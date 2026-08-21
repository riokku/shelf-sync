/** Temporary kill switch — barcode/QR scanning (manufacturer barcode entry,
 *  the camera scanner, and printable QR labels) isn't fully set up to
 *  function yet, so every UI entry point for it is hidden while this stays
 *  false: ManageInventoryComponent's create-form field/scan button,
 *  ModalTableComponent's QR label button/barcode display row/edit field/
 *  scan button, and the "Barcode" checkbox in both of Customize > Data's
 *  grouped-field sections (inventory-form-field.ts/inventory-table-column.ts
 *  both exclude the option from their groups while this is false). The
 *  underlying code — this file, BarcodeScannerModalComponent,
 *  QrLabelModalComponent, the inventory_items.barcode column/migration, the
 *  InventoryItem field itself — is all deliberately left in place rather
 *  than removed, since this is meant to be re-enabled later, not scrapped;
 *  flipping this back to true is the only change that should be needed. */
export const BARCODE_FEATURE_ENABLED = false;

/** Prefix embedded in a ShelfSync-generated QR label (see
 *  QrLabelModalComponent) so a scan of one can be told apart from an
 *  ordinary manufacturer barcode (UPC/EAN/etc.) decoded off a retail
 *  product — the former resolves an item by id, the latter by the
 *  inventory_items.barcode column. */
const ITEM_QR_PREFIX = 'shelfsync:item:';

/** The value encoded into a printable QR label for an item that has no
 *  manufacturer barcode of its own (e.g. an internal asset). */
export function buildItemQrValue(itemId: string): string {
  return `${ITEM_QR_PREFIX}${itemId}`;
}

/** Extracts the item id back out of a decoded ShelfSync-generated QR
 *  value, or null if the scanned text isn't one (e.g. a plain UPC/EAN off
 *  a retail product, which the caller should instead look up by
 *  inventory_items.barcode). */
export function parseItemQrValue(value: string): string | null {
  return value.startsWith(ITEM_QR_PREFIX) ? value.slice(ITEM_QR_PREFIX.length) : null;
}
