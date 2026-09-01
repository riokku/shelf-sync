import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';
import { Profile } from '../../core/auth.service';
import { InventoryAudit, InventoryAuditCount, InventoryAuditStatus, InventoryAuditTeamMember, isAuditDiscrepancy } from '../models/inventory-audit.model';
import { resolveProfileAvatarKey, resolveProfileName } from './profile-label';

type InventoryAuditRow = Database['public']['Tables']['inventory_audits']['Row'];
type InventoryAuditCountRow = Database['public']['Tables']['inventory_audit_counts']['Row'];

function toInventoryAudit(
  row: InventoryAuditRow,
  profiles: Profile[],
  totalItems: number,
  countedItems: number,
  discrepancyCount: number,
  supporterIds: string[]
): InventoryAudit {
  return {
    id: row.id,
    status: row.status as InventoryAuditStatus,
    physicalLocation: row.physical_location ?? '',
    note: row.note ?? '',
    startedByLabel: resolveProfileName(row.started_by, profiles) || 'Unknown user',
    startedAt: row.started_at,
    completedByLabel: resolveProfileName(row.completed_by, profiles),
    completedAt: row.completed_at ?? '',
    cancelledByLabel: resolveProfileName(row.cancelled_by, profiles),
    cancelledAt: row.cancelled_at ?? '',
    totalItems,
    countedItems,
    discrepancyCount,
    lead: row.lead_id
      ? { id: row.lead_id, label: resolveProfileName(row.lead_id, profiles) || 'Unknown user', avatarKey: resolveProfileAvatarKey(row.lead_id, profiles) }
      : null,
    supporters: supporterIds
      .map((id): InventoryAuditTeamMember => (
        { id, label: resolveProfileName(id, profiles) || 'Unknown user', avatarKey: resolveProfileAvatarKey(id, profiles) }
      ))
      .sort((a, b) => a.label.localeCompare(b.label))
  };
}

function toInventoryAuditCount(
  row: InventoryAuditCountRow,
  profiles: Profile[],
  itemNamesById: Map<string, string>,
  containerTrackedItemIds: Set<string>
): InventoryAuditCount {
  return {
    id: row.id,
    itemId: row.item_id,
    itemName: itemNamesById.get(row.item_id) ?? 'Unknown item',
    expectedQuantity: row.expected_quantity,
    countedQuantity: row.counted_quantity,
    countedByLabel: resolveProfileName(row.counted_by, profiles),
    countedAt: row.counted_at ?? '',
    note: row.note ?? '',
    appliedByLabel: resolveProfileName(row.applied_by, profiles),
    appliedAt: row.applied_at ?? '',
    isContainerTracked: containerTrackedItemIds.has(row.item_id)
  };
}

/** Every audit across the org, newest first, plus each one's own
 *  counted/discrepancy tallies — backs manage/audits' list view. The
 *  per-audit tallies are reduced client-side from a single narrow
 *  `inventory_audit_counts` query (just the three columns actually needed,
 *  not `select('*')`) rather than one query per audit, same "plain
 *  client-side id-keyed map, not a query per row" convention
 *  inventory-item-orders.ts's own itemNamesById already establishes.
 *
 *  Returns `{ audits, error }` rather than a bare array — this page's own
 *  primary content load, so its caller needs to distinguish a genuine
 *  fetch failure from "no audits yet," same reasoning
 *  loadAllInventoryItemReservations() gives for its own identical shape. */
export async function loadAuditSummaries(
  supabase: SupabaseClient<Database>,
  profiles: Profile[]
): Promise<{ audits: InventoryAudit[]; error: string | null }> {
  const [
    { data: auditRows, error: auditError },
    { data: countRows, error: countError },
    { data: supporterRows, error: supporterError }
  ] = await Promise.all([
    supabase.from('inventory_audits').select('*').order('started_at', { ascending: false }),
    supabase.from('inventory_audit_counts').select('audit_id, expected_quantity, counted_quantity'),
    supabase.from('inventory_audit_supporters').select('audit_id, user_id')
  ]);

  if (auditError) {
    return { audits: [], error: auditError.message };
  }
  if (countError) {
    return { audits: [], error: countError.message };
  }
  if (supporterError) {
    return { audits: [], error: supporterError.message };
  }

  const countsByAudit = new Map<string, { expected_quantity: number; counted_quantity: number | null }[]>();
  for (const row of countRows ?? []) {
    const list = countsByAudit.get(row.audit_id) ?? [];
    list.push(row);
    countsByAudit.set(row.audit_id, list);
  }

  const supporterIdsByAudit = new Map<string, string[]>();
  for (const row of supporterRows ?? []) {
    const list = supporterIdsByAudit.get(row.audit_id) ?? [];
    list.push(row.user_id);
    supporterIdsByAudit.set(row.audit_id, list);
  }

  const audits = (auditRows ?? []).map(row => {
    const counts = countsByAudit.get(row.id) ?? [];
    const countedItems = counts.filter(count => count.counted_quantity !== null).length;
    const discrepancyCount = counts.filter(
      count => count.counted_quantity !== null && count.counted_quantity !== count.expected_quantity
    ).length;
    return toInventoryAudit(row, profiles, counts.length, countedItems, discrepancyCount, supporterIdsByAudit.get(row.id) ?? []);
  });

  return { audits, error: null };
}

/** One audit's full set of item rows, item names resolved via a plain
 *  client-side id->name map (this app doesn't use PostgREST embedded-
 *  resource selects anywhere — see inventory-item-orders.ts's own doc
 *  comment) and isContainerTracked resolved via a single batched
 *  `inventory_item_containers` existence query keyed by this audit's own
 *  item ids, rather than one query per item. Sorted by item name — the
 *  audit_id-scoped query itself has no natural order worth preserving.
 *
 *  Also resolves the audit's own row (with the same tallies
 *  loadAuditSummaries() computes, here for free from the counts already
 *  fetched rather than a second reduce) — one call covers everything
 *  AuditDetailComponent needs rather than a separate lookup for the
 *  audit itself. `audit` comes back `null` (with `error: null`) if the id
 *  doesn't resolve to anything this caller can see — RLS-hidden and
 *  genuinely-missing look identical here, same as every other
 *  `.maybeSingle()`-style "not found" case in this app. */
export async function loadAuditDetail(
  supabase: SupabaseClient<Database>,
  auditId: string,
  profiles: Profile[]
): Promise<{ audit: InventoryAudit | null; counts: InventoryAuditCount[]; error: string | null }> {
  const [
    { data: auditRow, error: auditError },
    { data: countRows, error: countError },
    { data: supporterRows, error: supporterError }
  ] = await Promise.all([
    supabase.from('inventory_audits').select('*').eq('id', auditId).maybeSingle(),
    supabase.from('inventory_audit_counts').select('*').eq('audit_id', auditId),
    supabase.from('inventory_audit_supporters').select('user_id').eq('audit_id', auditId)
  ]);

  if (auditError) {
    return { audit: null, counts: [], error: auditError.message };
  }
  if (countError) {
    return { audit: null, counts: [], error: countError.message };
  }
  if (supporterError) {
    return { audit: null, counts: [], error: supporterError.message };
  }
  if (!auditRow) {
    return { audit: null, counts: [], error: null };
  }

  const rows = countRows ?? [];
  const itemIds = rows.map(row => row.item_id);

  const [{ data: itemRows }, { data: containerRows }] = await Promise.all([
    supabase.from('inventory_items').select('id, name').in('id', itemIds),
    supabase.from('inventory_item_containers').select('item_id').in('item_id', itemIds)
  ]);

  const itemNamesById = new Map((itemRows ?? []).map(item => [item.id, item.name]));
  const containerTrackedItemIds = new Set((containerRows ?? []).map(row => row.item_id));

  const counts = rows
    .map(row => toInventoryAuditCount(row, profiles, itemNamesById, containerTrackedItemIds))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  const countedItems = counts.filter(count => count.countedQuantity !== null).length;
  const discrepancyCount = counts.filter(isAuditDiscrepancy).length;
  const audit = toInventoryAudit(
    auditRow, profiles, counts.length, countedItems, discrepancyCount,
    (supporterRows ?? []).map(row => row.user_id)
  );

  return { audit, counts, error: null };
}
