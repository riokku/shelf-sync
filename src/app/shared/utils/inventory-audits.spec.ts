import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';
import { createFakeProfile, createFakeQueryBuilder } from '../../testing/fakes';
import { loadAuditDetail, loadAuditSummaries } from './inventory-audits';

/** A per-table-aware fake — createFakeSupabaseService() (see testing/fakes.ts)
 *  returns the same result for every .from() call regardless of table,
 *  which can't represent these two functions' own multi-table reads (audits
 *  + counts, or counts + items + containers). Built directly on the
 *  exported createFakeQueryBuilder(), same "build your own narrower fake on
 *  top of this" invitation that helper's own doc comment gives. */
function createTableAwareFakeSupabase(
  responses: Record<string, { data?: unknown; error?: unknown }>
): SupabaseClient<Database> {
  return {
    from: (table: string) => createFakeQueryBuilder(responses[table] ?? { data: [], error: null })
  } as unknown as SupabaseClient<Database>;
}

const PROFILES = [createFakeProfile({ id: 'user-1', full_name: 'Jamie Lee', nickname: null })];

describe('loadAuditSummaries', () => {
  it('tallies counted/discrepancy counts per audit from a single counts query', async () => {
    const supabase = createTableAwareFakeSupabase({
      inventory_audits: {
        data: [
          {
            id: 'audit-1', organization_id: 'org-1', status: 'in_progress', physical_location: 'Warehouse A',
            note: null, started_by: 'user-1', started_at: '2026-01-01T00:00:00.000Z',
            completed_by: null, completed_at: null, cancelled_by: null, cancelled_at: null
          }
        ],
        error: null
      },
      inventory_audit_counts: {
        data: [
          { audit_id: 'audit-1', expected_quantity: 10, counted_quantity: 10 },
          { audit_id: 'audit-1', expected_quantity: 5, counted_quantity: 3 },
          { audit_id: 'audit-1', expected_quantity: 2, counted_quantity: null }
        ],
        error: null
      }
    });

    const { audits, error } = await loadAuditSummaries(supabase, PROFILES);

    expect(error).toBeNull();
    expect(audits.length).toBe(1);
    expect(audits[0].totalItems).toBe(3);
    expect(audits[0].countedItems).toBe(2);
    expect(audits[0].discrepancyCount).toBe(1);
    expect(audits[0].startedByLabel).toBe('Jamie Lee');
    expect(audits[0].physicalLocation).toBe('Warehouse A');
  });

  it('reads physicalLocation/note as empty strings when the audit is org-wide with no note', async () => {
    const supabase = createTableAwareFakeSupabase({
      inventory_audits: {
        data: [
          {
            id: 'audit-1', organization_id: 'org-1', status: 'in_progress', physical_location: null,
            note: null, started_by: 'user-1', started_at: '2026-01-01T00:00:00.000Z',
            completed_by: null, completed_at: null, cancelled_by: null, cancelled_at: null
          }
        ],
        error: null
      },
      inventory_audit_counts: { data: [], error: null }
    });

    const { audits } = await loadAuditSummaries(supabase, PROFILES);

    expect(audits[0].physicalLocation).toBe('');
    expect(audits[0].note).toBe('');
    expect(audits[0].totalItems).toBe(0);
  });

  it('surfaces a query error rather than an empty list', async () => {
    const supabase = createTableAwareFakeSupabase({
      inventory_audits: { data: null, error: { message: 'Network error' } }
    });

    const { audits, error } = await loadAuditSummaries(supabase, PROFILES);

    expect(audits).toEqual([]);
    expect(error).toBe('Network error');
  });
});

describe('loadAuditDetail', () => {
  it('resolves item names and container-tracked status for each count row', async () => {
    const supabase = createTableAwareFakeSupabase({
      inventory_audits: {
        data: {
          id: 'audit-1', organization_id: 'org-1', status: 'in_progress', physical_location: null,
          note: null, started_by: 'user-1', started_at: '2026-01-01T00:00:00.000Z',
          completed_by: null, completed_at: null, cancelled_by: null, cancelled_at: null
        },
        error: null
      },
      inventory_audit_counts: {
        data: [
          { id: 'count-1', audit_id: 'audit-1', item_id: 'item-1', expected_quantity: 10, counted_quantity: 8, counted_by: 'user-1', counted_at: '2026-01-02T00:00:00.000Z', note: null, applied_by: null, applied_at: null },
          { id: 'count-2', audit_id: 'audit-1', item_id: 'item-2', expected_quantity: 4, counted_quantity: null, counted_by: null, counted_at: null, note: null, applied_by: null, applied_at: null }
        ],
        error: null
      },
      inventory_items: {
        data: [
          { id: 'item-1', name: 'Folding Chair' },
          { id: 'item-2', name: 'Round Table' }
        ],
        error: null
      },
      inventory_item_containers: {
        data: [{ item_id: 'item-1' }],
        error: null
      }
    });

    const { audit, counts, error } = await loadAuditDetail(supabase, 'audit-1', PROFILES);

    expect(error).toBeNull();
    expect(audit?.totalItems).toBe(2);
    expect(audit?.countedItems).toBe(1);
    expect(audit?.discrepancyCount).toBe(1);

    const chair = counts.find(count => count.itemId === 'item-1');
    expect(chair?.itemName).toBe('Folding Chair');
    expect(chair?.isContainerTracked).toBeTrue();

    const table = counts.find(count => count.itemId === 'item-2');
    expect(table?.itemName).toBe('Round Table');
    expect(table?.isContainerTracked).toBeFalse();
    expect(table?.countedQuantity).toBeNull();
  });

  it('returns a null audit (no error) when the audit id does not resolve to anything visible', async () => {
    const supabase = createTableAwareFakeSupabase({
      inventory_audits: { data: null, error: null },
      inventory_audit_counts: { data: [], error: null }
    });

    const { audit, counts, error } = await loadAuditDetail(supabase, 'missing-audit', PROFILES);

    expect(audit).toBeNull();
    expect(counts).toEqual([]);
    expect(error).toBeNull();
  });
});
