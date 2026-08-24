/** A directory entry an inventory item's supplier field can point at
 *  (inventory_items.supplier_id) — see the supplier directory migration's
 *  own doc comment for why per-item logistics (lead time, order link) stay
 *  on the item itself rather than living here. */
export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  notes: string;
}
