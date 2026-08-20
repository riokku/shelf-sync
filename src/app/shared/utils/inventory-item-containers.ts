import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';
import { InventoryItemContainer } from '../models/inventory-item-container.model';

export async function loadInventoryItemContainers(
  supabase: SupabaseClient<Database>,
  itemId: string
): Promise<InventoryItemContainer[]> {
  const { data } = await supabase
    .from('inventory_item_containers')
    .select('id, quantity, location')
    .eq('item_id', itemId)
    .order('created_at', { ascending: true });

  return (data ?? []).map(row => ({
    id: row.id,
    quantity: row.quantity,
    location: row.location ?? ''
  }));
}

/** Sum of every container's quantity — this is what an item's
 *  quantity_remaining is kept in sync with once it has at least one
 *  container (see ModalTableComponent). */
export function sumContainerQuantity(containers: { quantity: number }[]): number {
  return containers.reduce((sum, container) => sum + (container.quantity || 0), 0);
}
