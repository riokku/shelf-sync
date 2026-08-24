import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';
import { InventoryItemOrder, InventoryItemOrderStatus } from '../models/inventory-item-order.model';
import { Profile } from '../../core/auth.service';
import { resolveProfileName } from './profile-label';

type InventoryItemOrderRow = Database['public']['Tables']['inventory_item_orders']['Row'];

/** An order plus the name of the item it was placed for — manage/orders is
 *  org-wide (not scoped to one item's popup the way this used to be), so
 *  every row needs to say which item it's about. itemNamesById is a plain
 *  client-side join (this app doesn't use PostgREST embedded-resource
 *  selects anywhere — every other multi-entity list here correlates
 *  separately-queried rows by id instead, e.g. ManageInventoryComponent's
 *  images/activity maps), not a second round trip. */
export interface InventoryItemOrderWithItem extends InventoryItemOrder {
  itemId: string;
  itemName: string;
}

function toInventoryItemOrder(row: InventoryItemOrderRow, profiles: Profile[]): InventoryItemOrder {
  return {
    id: row.id,
    supplierName: row.supplier_name,
    quantity: row.quantity,
    status: row.status as InventoryItemOrderStatus,
    note: row.note ?? '',
    orderedByLabel: resolveProfileName(row.ordered_by, profiles) || 'Unknown user',
    orderedAt: row.ordered_at,
    receivedByLabel: resolveProfileName(row.received_by, profiles),
    receivedAt: row.received_at ?? ''
  };
}

/** Every order across the org, most recent first — backs manage/orders.
 *  RLS (inventory_item_orders' own SELECT policy, joined through item_id to
 *  inventory_items.organization_id) is what actually scopes this to the
 *  caller's org; there's no explicit organization_id filter here, matching
 *  every other unfiltered .from(...) query in this app that relies on RLS
 *  alone (see shared/utils/realtime.ts's own comment on this convention). */
export async function loadAllInventoryItemOrders(
  supabase: SupabaseClient<Database>,
  profiles: Profile[],
  itemNamesById: Map<string, string>
): Promise<InventoryItemOrderWithItem[]> {
  const { data } = await supabase
    .from('inventory_item_orders')
    .select('*')
    .order('ordered_at', { ascending: false });

  return (data ?? []).map(row => ({
    ...toInventoryItemOrder(row, profiles),
    itemId: row.item_id,
    itemName: itemNamesById.get(row.item_id) ?? 'Unknown item'
  }));
}
