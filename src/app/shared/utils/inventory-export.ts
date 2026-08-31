import { InventoryItem, isLowStock, isOutOfStock } from '../models/inventory-item.model';

/** Mirrors InventoryComponent.statusLabel()'s own priority order (retired >
 *  pending retirement > out of stock > low stock > checked out > available)
 *  — that method lives on a component and isn't exported, so this is a
 *  small, deliberate duplicate rather than a cross-page dependency for one
 *  six-line function. Keep the two in sync if that priority order changes. */
function describeStatus(item: InventoryItem): string {
  if (item.status === 'retired') {
    return 'Retired';
  }
  if (item.status === 'retirement_pending') {
    return 'Pending retirement';
  }
  if (isOutOfStock(item)) {
    return 'Out of stock';
  }
  if (isLowStock(item)) {
    return 'Low stock';
  }
  if (item.isCheckedOut) {
    return 'Checked out';
  }
  return 'Available';
}

function formatActivityLog(item: InventoryItem): string {
  return item.activityLog
    .map(entry => `${new Date(entry.timestamp).toLocaleString()} — ${entry.user}: ${entry.message}`)
    .join('\n');
}

/** One column per InventoryItem field worth exporting, in the same Item/
 *  Supplier/Quantity/Price/Other grouping order the table-column and
 *  form-field models use — plus a final Activity log column with every
 *  entry for that item folded into one cell (see formatActivityLog()
 *  above), rather than a second file/sheet to correlate by item id. */
const CSV_COLUMNS: { header: string; value: (item: InventoryItem) => string }[] = [
  { header: 'Name', value: item => item.name },
  { header: 'Barcode', value: item => item.barcode },
  { header: 'Description', value: item => item.description },
  { header: 'Category', value: item => item.category },
  { header: 'Physical location', value: item => item.physicalLocation },
  { header: 'Digital location', value: item => item.digitalLocation },
  { header: 'Applicable year', value: item => item.applicableYear },
  { header: 'Expiration date', value: item => item.expirationDate },
  { header: 'Supplier name', value: item => item.supplierName },
  { header: 'Supplier lead time', value: item => item.supplierLeadTime },
  { header: 'Order link', value: item => item.orderLink },
  { header: 'Quantity total', value: item => String(item.quantityTotal) },
  { header: 'Quantity per container', value: item => String(item.quantityPerContainer) },
  { header: 'Quantity allocated', value: item => String(item.quantityAllocated) },
  { header: 'Quantity remaining', value: item => String(item.quantityRemaining) },
  { header: 'Low quantity threshold', value: item => String(item.lowQuantityThreshold) },
  { header: 'Price per unit', value: item => String(item.pricePerUnit) },
  { header: 'Price per container', value: item => String(item.pricePerContainer) },
  { header: 'Checked out to', value: item => item.checkedOutTo },
  { header: 'Status', value: describeStatus },
  { header: 'Activity log', value: formatActivityLog }
];

/** A field containing a comma, double quote, or line break must be quoted
 *  per the CSV spec (RFC 4180), with internal quotes doubled — everything
 *  else is left bare. Activity log cells (the only multi-line field here)
 *  always hit the quoting path. Exported so inventory-import.ts's own
 *  template-generation can reuse it rather than duplicating this logic. */
export function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: string[][]): string {
  return rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}

/** Builds one friendly CSV — current data plus full activity history — for
 *  every inventory item passed in, active/pending/retired alike (the caller
 *  decides which items to include; manage/inventory's own export passes its
 *  full org list, not just what's currently filtered/paged anywhere). */
export function buildInventoryExportCsv(items: InventoryItem[]): string {
  const header = CSV_COLUMNS.map(column => column.header);
  const rows = items.map(item => CSV_COLUMNS.map(column => column.value(item)));
  return toCsv([header, ...rows]);
}

/** Plain client-side file download via a throwaway <a download> — no server
 *  round trip needed, the CSV is already fully built in memory. */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
