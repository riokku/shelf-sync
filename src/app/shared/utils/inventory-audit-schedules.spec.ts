import { createFakeProfile, createFakeSupabaseService } from '../../testing/fakes';
import { loadAuditSchedules } from './inventory-audit-schedules';

const PROFILES = [createFakeProfile({ id: 'user-1', full_name: 'Jamie Lee', nickname: null, avatar_key: null })];

describe('loadAuditSchedules', () => {
  it('maps rows into InventoryAuditSchedule, resolving createdByLabel from profiles', async () => {
    const supabase = createFakeSupabaseService({
      data: [
        {
          id: 'schedule-1',
          organization_id: 'org-1',
          physical_location: 'Warehouse A',
          frequency: 'monthly',
          note: 'Monthly count',
          next_occurrence_date: '2099-01-01',
          active: true,
          created_by: 'user-1',
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ],
      error: null
    });

    const { schedules, error } = await loadAuditSchedules(supabase.client, PROFILES);

    expect(error).toBeNull();
    expect(schedules.length).toBe(1);
    expect(schedules[0]).toEqual({
      id: 'schedule-1',
      physicalLocation: 'Warehouse A',
      frequency: 'monthly',
      note: 'Monthly count',
      nextOccurrenceDate: '2099-01-01',
      active: true,
      createdByLabel: 'Jamie Lee',
      createdAt: '2026-01-01T00:00:00.000Z'
    });
  });

  it('reads physicalLocation/note as empty strings when org-wide with no note', async () => {
    const supabase = createFakeSupabaseService({
      data: [
        {
          id: 'schedule-2',
          organization_id: 'org-1',
          physical_location: null,
          frequency: 'weekly',
          note: null,
          next_occurrence_date: '2099-02-01',
          active: true,
          created_by: null,
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ],
      error: null
    });

    const { schedules } = await loadAuditSchedules(supabase.client, []);

    expect(schedules[0].physicalLocation).toBe('');
    expect(schedules[0].note).toBe('');
    expect(schedules[0].createdByLabel).toBe('Unknown user');
  });

  it('surfaces a query error rather than throwing', async () => {
    const supabase = createFakeSupabaseService({ data: null, error: { message: 'network error' } });

    const { schedules, error } = await loadAuditSchedules(supabase.client, []);

    expect(schedules).toEqual([]);
    expect(error).toBe('network error');
  });
});
