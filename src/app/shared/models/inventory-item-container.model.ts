/** One physical box/container holding some of an item's remaining stock —
 *  see ModalTableComponent's "Container breakdown" section. `location` is
 *  optional free text (e.g. "Shelf A, Bin 2"); an empty string means unset,
 *  matching how InventoryItem's other optional text fields are modeled. */
export interface InventoryItemContainer {
  id: string;
  quantity: number;
  location: string;
}
