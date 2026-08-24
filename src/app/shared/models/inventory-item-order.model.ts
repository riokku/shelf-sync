/** A restock order placed against one of an item's linked supplier — see
 *  ModalTableComponent's "Orders" tab. One order = one item + one quantity,
 *  not a multi-line purchase order (see the add_inventory_item_orders
 *  migration's own doc comment for why). `supplierName` is a point-in-time
 *  snapshot (the order should still read correctly even if the supplier is
 *  later renamed or removed from the directory), independent of whether the
 *  item's own current supplier is later changed. */
export type InventoryItemOrderStatus = 'ordered' | 'received' | 'cancelled';

export interface InventoryItemOrder {
  id: string;
  supplierName: string;
  quantity: number;
  status: InventoryItemOrderStatus;
  note: string;
  orderedByLabel: string;
  orderedAt: string;
  receivedByLabel: string;
  receivedAt: string;
}
