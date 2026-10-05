/** Barcode/QR scanning (manufacturer barcode entry, the camera scanner via
 *  @zxing/browser, and printable QR labels via the qrcode package) is live —
 *  ManageInventoryComponent's create-form field/scan button,
 *  ModalTableComponent's QR label button/barcode display row/edit field/
 *  scan button, and the "Barcode" checkbox in both of Settings > Data's
 *  grouped-field sections (inventory-form-field.ts/inventory-table-column.ts)
 *  all render normally while this stays true. Kept as a real constant
 *  (rather than deleting the gate now that it's on) purely as a fast kill
 *  switch — flipping it back to false hides every one of those entry points
 *  again instantly, with the underlying code (this file,
 *  BarcodeScannerModalComponent, QrLabelModalComponent, the
 *  inventory_items.barcode column, the InventoryItem field itself) left
 *  fully in place either way. */
export const BARCODE_FEATURE_ENABLED = true;

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
