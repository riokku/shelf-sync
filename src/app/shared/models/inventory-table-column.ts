/** The optional columns an admin can show/hide in the Inventory page's table
 *  view (Customize > Data). "name" and "actions" aren't part of this list —
 *  they're always shown, since a row with no name column is unusable and the
 *  actions column is just the "view details" link, not real data. Order here
 *  is also the canonical display order: InventoryComponent.tableColumns
 *  filters this array down to whatever's enabled rather than reading the
 *  enabled list's own order, so the column order stays stable regardless of
 *  the order columns happen to be toggled on/off in. */
export type InventoryTableColumnKey = 'category' | 'physicalLocation' | 'quantityRemaining' | 'status';

export interface InventoryTableColumnOption {
  key: InventoryTableColumnKey;
  label: string;
}

export const INVENTORY_TABLE_COLUMN_OPTIONS: InventoryTableColumnOption[] = [
  { key: 'category', label: 'Category' },
  { key: 'physicalLocation', label: 'Physical location' },
  { key: 'quantityRemaining', label: 'Quantity remaining' },
  { key: 'status', label: 'Stock status' }
];

export const DEFAULT_INVENTORY_TABLE_COLUMNS: InventoryTableColumnKey[] =
  INVENTORY_TABLE_COLUMN_OPTIONS.map(option => option.key);
