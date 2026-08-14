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
  retiredByLabel = ''
): InventoryItem {
  const gallery = images.length > 0 ? images : (row.image ? [row.image] : []);

  return new InventoryItem(
    row.id,
    row.name,
    row.description ?? '',
    gallery[0] ?? '',
    gallery,
    row.category ?? '',
    row.physical_location ?? '',
    row.digital_location ?? '',
    row.applicable_year ?? '',
    row.expiration_date ?? '',
    row.supplier_name ?? '',
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
    activityLog,
    row.status as InventoryItemStatus,
    row.retirement_requested_by,
    retirementRequestedByLabel,
    row.retirement_request_note ?? '',
    row.retirement_requested_at ?? '',
    retiredByLabel,
    row.retired_at ?? ''
  );
}
