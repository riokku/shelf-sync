import { BARCODE_FEATURE_ENABLED } from '../utils/barcode';

/** The optional fields an admin can show/hide on the "Create item" form
 *  (Settings > Data's "Inventory data" section — not to be confused with
 *  the "Filter data" section right above it, which curates approved
 *  category/physical-location *values*, or "Table presentation" further
 *  over, which is about the Inventory page's table view, not the create
 *  form). "name" and the item's core quantity tracking (quantityTotal /
 *  the single-vs-container toggle — see ManageInventoryComponent's
 *  trackingMode) aren't part of this list: an item with no name is
 *  unusable, and quantity tracking is what makes it an *inventory* item in
 *  the first place, so neither can be turned off.
 *
 *  Deliberately excludes fields that don't apply to item creation at all:
 *  quantityAllocated/quantityRemaining (derived, not user-entered on
 *  create), checkedOutTo/status (an item can't already be checked out or
 *  retired the moment it's created). "photos" has no InventoryItem field of
 *  its own — it toggles the image-upload section.
 *
 *  Grouped and labeled to match InventoryTableColumnGroup's own grouping
 *  (shared/models/inventory-table-column.ts) and InventoryItem's
 *  constructor comment groupings (Item/Supplier/Quantity/Price/Other
 *  information), reused by SettingsComponent (grouped checkboxes) and
 *  ManageInventoryComponent (fieldEnabled() gating which parts of the
 *  create form render). */
export type InventoryFormFieldKey =
  | 'barcode'
  | 'description'
  | 'category'
  | 'physicalLocation'
  | 'digitalLocation'
  | 'applicableYear'
  | 'expirationDate'
  | 'photos'
  | 'supplierName'
  | 'supplierLeadTime'
  | 'orderLink'
  | 'quantityPerContainer'
  | 'lowQuantityThreshold'
  | 'pricePerUnit'
  | 'pricePerContainer';

export interface InventoryFormFieldOption {
  key: InventoryFormFieldKey;
  label: string;
}

export interface InventoryFormFieldGroup {
  label: string;
  options: InventoryFormFieldOption[];
}

export const INVENTORY_FORM_FIELD_GROUPS: InventoryFormFieldGroup[] = [
  {
    label: 'Item information',
    options: [
      // Barcode is excluded from this list, not just left disabled by
      // default, while BARCODE_FEATURE_ENABLED is false (see its own doc
      // comment) — an admin toggling it on would have nothing to show for
      // it, since ManageInventoryComponent's create form hard-gates the
      // field on the same flag regardless of this setting.
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
      { key: 'quantityPerContainer', label: 'Quantity per container' },
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
      { key: 'photos', label: 'Photos' }
    ]
  }
];

export const INVENTORY_FORM_FIELD_OPTIONS: InventoryFormFieldOption[] =
  INVENTORY_FORM_FIELD_GROUPS.flatMap(group => group.options);

/** Matches the site_settings.inventory_form_fields column's own DB default
 *  — every field enabled, so a brand-new org (no site_settings row yet,
 *  client falls back to this) and an org that's never visited this section
 *  both see the exact same create form the app always had. */
export const DEFAULT_INVENTORY_FORM_FIELDS: InventoryFormFieldKey[] =
  INVENTORY_FORM_FIELD_OPTIONS.map(option => option.key);
