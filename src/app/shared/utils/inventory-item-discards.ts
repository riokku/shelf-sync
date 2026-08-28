import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';

type InventoryItemDiscardRow = Database['public']['Tables']['inventory_item_discards']['Row'];

/** Structured counterpart to logInventoryItemActivity()'s free-text
 *  "Discarded N units... Reason(s): ..." line — written alongside it (not
 *  instead of it) by ModalTableComponent.performDiscard(), so the item's
 *  own activity history keeps reading exactly as it always has while
 *  manage/reports' "Stock movement & loss" section gets a queryable
 *  quantity/reason/category to group by. `reasons` (plural — a multi-select
 *  against Settings > Data's admin-curated "Discard reasons" list, not free
 *  text) is stored as-is in the `reason` array column: each entry counts
 *  toward its own total in the report rather than the whole combination
 *  becoming its own distinct bucket. Best-effort: a failure here shouldn't
 *  undo or block the discard itself (which has already succeeded by the
 *  time this is called), only leave that one event missing from the
 *  aggregate report — same "logging must never block the action it's
 *  describing" reasoning this app's other audit-trail writes already
 *  follow. */
export async function logInventoryItemDiscard(
  supabase: SupabaseClient<Database>,
  itemId: string,
  userId: string,
  quantity: number,
  reasons: string[],
  containerId: string | null
): Promise<void> {
  await supabase.from('inventory_item_discards').insert({
    item_id: itemId,
    discarded_by: userId,
    quantity,
    reason: reasons,
    container_id: containerId
  });
}

/** Every discard across the org, RLS-scoped via item_id -> inventory_items
 *  the same way the table's own SELECT policy is — returned as raw rows
 *  rather than pre-aggregated, since ManageReportsComponent is the only
 *  consumer and what it groups by (reason, category via a join against the
 *  inventory items it's already loaded) is report-specific, not something
 *  worth baking into a shared loader.
 *
 *  Returns `{ discards, error }` rather than a bare array — this feeds the
 *  "Stock movement & loss" section of manage/reports' own primary content
 *  load, so its caller needs to distinguish a genuine fetch failure from
 *  "nothing discarded yet," same reasoning loadAllInventoryItemReservations()
 *  gives for its own identical shape. */
export async function loadAllInventoryItemDiscards(
  supabase: SupabaseClient<Database>
): Promise<{ discards: InventoryItemDiscardRow[]; error: string | null }> {
  const { data, error } = await supabase.from('inventory_item_discards').select('*');
  if (error) {
    return { discards: [], error: error.message };
  }
  return { discards: data ?? [], error: null };
}
