import { BARCODE_FEATURE_ENABLED } from '../utils/barcode';

/** The optional columns an admin can show/hide in the Inventory page's table
 *  view (Customize > Data). "name" and "actions" aren't part of this list —
 *  they're always shown, since a row with no name column is unusable and the
 *  actions column is just the "view details" link, not real data.
 *
 *  Deliberately excludes a few InventoryItem fields that don't make sense as
 *  standalone table columns: id (the table is already keyed by name),
 *  image/images (photos aren't tabular), activityLog (a list of entries, not
 *  a scalar value), checkedOutToId/checkedOutToAvatarKey (internal keys —
 *  checkedOutTo is the display label), and the retirement audit trail
 *  (retirementRequestedByLabel/retirementRequestNote/retirementRequestedAt/
 *  retiredByLabel/retiredAt) — that's already summarized by the "status"
 *  column's pill (see InventoryComponent.statusLabel()) and is otherwise a
 *  detail for the item popup, not a routine table column.
 *
 *  Grouped and labeled to match the field groupings InventoryItem's own
 *  constructor comments use (Item/Supplier/Quantity/Price/Other
 *  information), and reused by both CustomizeComponent (grouped checkboxes)
 *  and InventoryComponent (flattened via ALL_INVENTORY_TABLE_COLUMN_OPTIONS
 *  for canonical column order). Field labels match modal-table's own
 *  FIELD_LABELS map, so a column header and the item detail popup's field
 *  label for the same data always read the same. */
export type InventoryTableColumnKey =
  | 'barcode'
  | 'description'
  | 'category'
  | 'physicalLocation'
  | 'digitalLocation'
  | 'applicableYear'
  | 'expirationDate'
  | 'supplierName'
  | 'supplierLeadTime'
  | 'orderLink'
  | 'quantityTotal'
  | 'quantityPerContainer'
  | 'quantityAllocated'
  | 'quantityRemaining'
  | 'lowQuantityThreshold'
  | 'pricePerUnit'
  | 'pricePerContainer'
  | 'checkedOutTo'
  | 'status';

export interface InventoryTableColumnOption {
  key: InventoryTableColumnKey;
  label: string;
}

export interface InventoryTableColumnGroup {
  label: string;
  options: InventoryTableColumnOption[];
}

export const INVENTORY_TABLE_COLUMN_GROUPS: InventoryTableColumnGroup[] = [
  {
    label: 'Item information',
    options: [
      // Excluded from this list, not just left disabled by default, while
      // BARCODE_FEATURE_ENABLED is false (see its own doc comment) — an
      // admin toggling it on would have nothing to show for it, since
      // InventoryComponent.tableColumns filters down to whatever's in this
      // very options list, which never includes 'barcode' while the flag's
      // off.
      ...(BARCODE_FEATURE_ENABLED ? [{ key: 'barcode' as const, label: 'Barcode' }] : []),
      { key: 'description', label: 'Description' },
      { key: 'category', label: 'Category' },
      { key: 'physicalLocation', label: 'Physical location' },
      { key: 'digitalLocation', label: 'Digital location' },
      { key: 'applicableYear', label: 'Applicable year' },
      { key: 'expirationDate', label: 'Expiration date' }
    ]
  },
  {
    label: 'Supplier information',
    options: [
      { key: 'supplierName', label: 'Supplier name' },
      { key: 'supplierLeadTime', label: 'Supplier lead time' },
      { key: 'orderLink', label: 'Order link' }
    ]
  },
  {
    label: 'Quantity information',
    options: [
      { key: 'quantityTotal', label: 'Quantity total' },
      { key: 'quantityPerContainer', label: 'Quantity per container' },
      { key: 'quantityAllocated', label: 'Quantity allocated' },
      { key: 'quantityRemaining', label: 'Quantity remaining' },
      { key: 'lowQuantityThreshold', label: 'Low quantity threshold' }
    ]
  },
  {
    label: 'Price information',
    options: [
      { key: 'pricePerUnit', label: 'Price per unit' },
      { key: 'pricePerContainer', label: 'Price per container' }
    ]
  },
  {
    label: 'Other',
    options: [
      { key: 'checkedOutTo', label: 'Checked out to' },
      { key: 'status', label: 'Stock status' }
    ]
  }
];

/** Flattened view of the groups above, in the same order — this is the
 *  canonical column order InventoryComponent.tableColumns filters down to
 *  whatever's enabled, so the table's column order stays stable regardless
 *  of the order columns were toggled in. */
export const INVENTORY_TABLE_COLUMN_OPTIONS: InventoryTableColumnOption[] =
  INVENTORY_TABLE_COLUMN_GROUPS.flatMap(group => group.options);

/** The original, pre-expansion default — matches the
 *  site_settings.inventory_table_columns column's own DB default, so a
 *  brand-new org (no site_settings row yet, client falls back to this) and
 *  an existing org that saved before this list grew both start from the
 *  same modest set rather than every column at once. */
export const DEFAULT_INVENTORY_TABLE_COLUMNS: InventoryTableColumnKey[] = [
  'category',
  'physicalLocation',
  'quantityRemaining',
  'status'
];
