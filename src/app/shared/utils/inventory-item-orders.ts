import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';
import { InventoryItemOrder, InventoryItemOrderStatus } from '../models/inventory-item-order.model';
import { Profile } from '../../core/auth.service';
import { resolveProfileName } from './profile-label';

type InventoryItemOrderRow = Database['public']['Tables']['inventory_item_orders']['Row'];

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

/** Most recent first — matches inventory_item_activity's own ordering,
 *  since an item's order history reads like a second, order-specific
 *  activity feed. */
export async function loadInventoryItemOrders(
  supabase: SupabaseClient<Database>,
  itemId: string,
  profiles: Profile[]
): Promise<InventoryItemOrder[]> {
  const { data } = await supabase
    .from('inventory_item_orders')
    .select('*')
    .eq('item_id', itemId)
    .order('ordered_at', { ascending: false });

  return (data ?? []).map(row => toInventoryItemOrder(row, profiles));
}
