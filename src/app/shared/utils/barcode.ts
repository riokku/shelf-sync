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
