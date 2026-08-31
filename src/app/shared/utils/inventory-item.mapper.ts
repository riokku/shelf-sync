import { ActivityLogEntry, InventoryItem, InventoryItemStatus } from '../models/inventory-item.model';
import { Database } from '../models/database.types';

type InventoryItemRow = Database['public']['Tables']['inventory_items']['Row'];

export function toInventoryItem(
  row: InventoryItemRow,
  images: string[],
  checkedOutToLabel: string,
  activityLog: ActivityLogEntry[] = [],
  checkedOutToAvatarKey: string | null = null,
  retirementRequestedByLabel = '',
  retiredByLabel = '',
  lockedByLabel = '',
  // Resolved separately from the row (unlike every other field above) since
  // supplier_name no longer exists on inventory_items — the item only
  // stores supplier_id now, and its display name lives on the suppliers
  // table (see resolveSupplierName()/SupplierService). Defaults to '' so
  // the handful of callers that don't need it (e.g. TaskDetailModalComponent's
  // lightweight related-item preview, which already skips the retirement/
  // lock labels above for the same reason) don't have to pass anything.
  supplierLabel = ''
): InventoryItem {
  const gallery = images.length > 0 ? images : (row.image ? [row.image] : []);

  return new InventoryItem(
    row.id,
    row.name,
    row.barcode ?? '',
    row.description ?? '',
    gallery[0] ?? '',
    gallery,
    row.category ?? '',
    row.physical_location ?? '',
    row.digital_location ?? '',
    row.applicable_year ?? '',
    row.expiration_date ?? '',
    supplierLabel,
    row.supplier_id,
    row.supplier_lead_time ?? '',
    row.order_link ?? '',
    row.quantity_total,
    row.quantity_per_container ?? 0,
    row.quantity_allocated,
    row.quantity_remaining,
    row.low_quantity_threshold ?? 0,
    row.price_per_unit ?? 0,
    row.price_per_container ?? 0,
    row.is_checked_out,
    checkedOutToLabel,
    row.checked_out_to,
    checkedOutToAvatarKey,
    row.checkout_due_at ?? '',
    activityLog,
    row.status as InventoryItemStatus,
    row.retirement_requested_by,
    retirementRequestedByLabel,
    row.retirement_request_note ?? '',
    row.retirement_requested_at ?? '',
    retiredByLabel,
    row.retired_at ?? '',
    row.is_locked,
    lockedByLabel,
    row.locked_at ?? ''
  );
}
