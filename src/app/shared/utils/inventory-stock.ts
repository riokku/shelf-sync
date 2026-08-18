/** Minimal shape needed to classify a row's stock level — deliberately not
 *  the full `inventory_items` row type, so this works equally well against
 *  a full row or a narrow `.select('quantity_remaining, low_quantity_threshold')`
 *  used purely for a count (see HeaderComponent/HomeComponent). */
export interface StockLevelRow {
  quantity_remaining: number;
  low_quantity_threshold: number | null;
}

/** A null/unset threshold means "not configured for this item" rather than
 *  "always low" — mirrors InventoryItem's own isLowStock(), which gets the
 *  same behavior for free via the mapper defaulting a null threshold to 0
 *  (quantityRemaining can never be negative, so that check is always
 *  false). Kept explicit here since this operates on raw rows instead. */
export function isRowLowStock(row: StockLevelRow): boolean {
  return row.low_quantity_threshold != null && row.quantity_remaining < row.low_quantity_threshold;
}

export function isRowOutOfStock(row: Pick<StockLevelRow, 'quantity_remaining'>): boolean {
  return row.quantity_remaining <= 0;
}

/** Out of stock and low stock aren't strictly nested — an out-of-stock item
 *  with no threshold configured wouldn't trip isRowLowStock() on its own —
 *  so a single "needs restocking" count (HeaderComponent's nav badge,
 *  HomeComponent's Inventory card pill) checks both rather than just one. */
export function needsRestockAttention(row: StockLevelRow): boolean {
  return isRowOutOfStock(row) || isRowLowStock(row);
}
