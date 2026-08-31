import Papa from 'papaparse';
import { Supplier } from '../models/supplier.model';
import { Database } from '../models/database.types';
import { toCsv } from './inventory-export';
import { DUPLICATE_ITEM_NAME_ERROR, isDuplicateItemName } from './inventory-item-name';

type InventoryItemInsert = Database['public']['Tables']['inventory_items']['Insert'];

/** The bulk-import counterpart to inventory-export.ts's own CSV_COLUMNS —
 *  every insertable "Create item" field except barcode (skipped entirely
 *  for this feature, not just while BARCODE_FEATURE_ENABLED is off — see
 *  ImportInventoryModalComponent's own doc comment) and every server-
 *  derived/runtime-state column a fresh item can't have yet (Quantity
 *  allocated, Quantity remaining, Checked out to, Status, Activity log).
 *  Order matches the create form's own Item/Supplier/Quantity grouping, but
 *  parsing below reads cells by header name, not position, so reordering
 *  columns in Excel doesn't break anything. */
export const IMPORT_CSV_HEADERS = [
  'Name',
  'Description',
  'Category',
  'Physical location',
  'Digital location',
  'Applicable year',
  'Expiration date',
  'Supplier name',
  'Supplier lead time',
  'Order link',
  'Quantity total',
  'Quantity per container',
  'Low quantity threshold',
  'Price per unit',
  'Price per container'
];

/** Header row only — no example data row, so there's nothing for someone to
 *  forget to delete before re-uploading. */
export function buildInventoryImportTemplateCsv(): string {
  return toCsv([IMPORT_CSV_HEADERS]);
}

/** One parsed + validated spreadsheet row. `errors` block the row from ever
 *  being sent to the DB (the preview shows it, but "Import" skips it);
 *  `warnings` don't — the row still imports as-is. rowNumber accounts for
 *  the header row and 1-indexing, so it matches what someone would actually
 *  see if they opened the file in Excel. */
export interface ParsedImportRow {
  rowNumber: number;
  name: string;
  description: string;
  category: string;
  physicalLocation: string;
  digitalLocation: string;
  applicableYear: string;
  expirationDate: string | null;
  supplierName: string;
  resolvedSupplierId: string | null;
  supplierLeadTime: string;
  orderLink: string;
  quantityTotal: number | null;
  quantityPerContainer: number | null;
  lowQuantityThreshold: number | null;
  pricePerUnit: number | null;
  pricePerContainer: number | null;
  errors: string[];
  warnings: string[];
}

export interface ParseImportResult {
  rows: ParsedImportRow[];
  /** Set when the file doesn't look like the template at all (no "Name"
   *  column) — the caller should show this and never advance to a preview
   *  built from garbage. */
  headerError: string | null;
}

function cell(raw: Record<string, string>, header: string): string {
  return (raw[header] ?? '').trim();
}

function parseOptionalNumber(raw: string, fieldLabel: string, errors: string[]): number | null {
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    errors.push(`${fieldLabel} must be a number ≥ 0`);
    return null;
  }
  return value;
}

function parseRequiredQuantity(raw: string, errors: string[]): number | null {
  if (!raw) {
    errors.push('Quantity total is required');
    return null;
  }
  return parseOptionalNumber(raw, 'Quantity total', errors);
}

/** Strict 'YYYY-MM-DD', and a real calendar date (rejects e.g. 2026-02-30) —
 *  matches the format toIsoDateString()/parseIsoDate() (shared/utils/date.ts)
 *  use elsewhere, so the raw string round-trips straight into Postgres's
 *  `date` column with no Date-object conversion (and none of the UTC-shift
 *  pitfall those two helpers exist to guard against). */
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Parses + validates an uploaded CSV against the org's already-loaded
 *  supplier directory and existing inventory. Pure function (no Supabase
 *  access) — the caller supplies `suppliers` and `existingItemNames`
 *  (both already loaded page-wide by the time an admin/manager can even
 *  open the import modal — same data the create form's own supplier
 *  dropdown and barcode-scan duplicate check already reuse) so this stays
 *  directly unit-testable. `existingItemNames` defaults to `[]` so every
 *  existing call site/spec that doesn't care about duplicate detection
 *  keeps working unchanged. */
export function parseAndValidateImportRows(
  csvText: string,
  suppliers: Supplier[],
  existingItemNames: string[] = []
): ParseImportResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });

  const fields = parsed.meta.fields ?? [];
  if (!fields.includes('Name')) {
    return {
      rows: [],
      headerError: 'This doesn\'t look like the import template — make sure the file has a header row with a "Name" column.'
    };
  }

  // How many times each name shows up in this file — a name repeated
  // across rows would create duplicate items from the same upload, the
  // same problem as matching something already in the system, just scoped
  // to the file itself rather than the DB.
  const nameCountsInFile = new Map<string, number>();
  for (const raw of parsed.data) {
    const nameLower = cell(raw, 'Name').toLowerCase();
    if (nameLower) {
      nameCountsInFile.set(nameLower, (nameCountsInFile.get(nameLower) ?? 0) + 1);
    }
  }

  const rows: ParsedImportRow[] = parsed.data.map((raw, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = cell(raw, 'Name');
    if (!name) {
      errors.push('Name is required');
    } else if (isDuplicateItemName(name, existingItemNames)) {
      errors.push(DUPLICATE_ITEM_NAME_ERROR);
    } else if ((nameCountsInFile.get(name.toLowerCase()) ?? 0) > 1) {
      errors.push('This name appears more than once in this file');
    }

    const quantityTotal = parseRequiredQuantity(cell(raw, 'Quantity total'), errors);
    const quantityPerContainer = parseOptionalNumber(cell(raw, 'Quantity per container'), 'Quantity per container', errors);
    const lowQuantityThreshold = parseOptionalNumber(cell(raw, 'Low quantity threshold'), 'Low quantity threshold', errors);
    const pricePerUnit = parseOptionalNumber(cell(raw, 'Price per unit'), 'Price per unit', errors);
    const pricePerContainer = parseOptionalNumber(cell(raw, 'Price per container'), 'Price per container', errors);

    const expirationRaw = cell(raw, 'Expiration date');
    let expirationDate: string | null = null;
    if (expirationRaw) {
      if (isValidIsoDate(expirationRaw)) {
        expirationDate = expirationRaw;
      } else {
        errors.push('Expiration date must be in YYYY-MM-DD format');
      }
    }

    const supplierName = cell(raw, 'Supplier name');
    let resolvedSupplierId: string | null = null;
    if (supplierName) {
      const match = suppliers.find(supplier => supplier.name.toLowerCase() === supplierName.toLowerCase());
      if (match) {
        resolvedSupplierId = match.id;
      } else {
        warnings.push(`Supplier "${supplierName}" not found — item will be imported without a supplier`);
      }
    }

    return {
      rowNumber: index + 2,
      name,
      description: cell(raw, 'Description'),
      category: cell(raw, 'Category'),
      physicalLocation: cell(raw, 'Physical location'),
      digitalLocation: cell(raw, 'Digital location'),
      applicableYear: cell(raw, 'Applicable year'),
      expirationDate,
      supplierName,
      resolvedSupplierId,
      supplierLeadTime: cell(raw, 'Supplier lead time'),
      orderLink: cell(raw, 'Order link'),
      quantityTotal,
      quantityPerContainer,
      lowQuantityThreshold,
      pricePerUnit,
      pricePerContainer,
      errors,
      warnings
    };
  });

  return { rows, headerError: null };
}

/** Mirrors ManageInventoryComponent.submitInventoryItem()'s own insert
 *  payload shape — flat quantity tracking only (no containers, no photos;
 *  both stay a manual, per-item follow-up after import, same as the user
 *  asked for) and barcode always null. Only ever called with a row that has
 *  no blocking errors — quantityTotal is validated required above, the `?? 0`
 *  here is just to satisfy the type, not a reachable fallback. */
export function buildImportInsertPayload(row: ParsedImportRow): InventoryItemInsert {
  return {
    name: row.name,
    barcode: null,
    category: row.category || null,
    description: row.description || null,
    physical_location: row.physicalLocation || null,
    digital_location: row.digitalLocation || null,
    applicable_year: row.applicableYear || null,
    expiration_date: row.expirationDate,
    supplier_id: row.resolvedSupplierId,
    supplier_lead_time: row.supplierLeadTime || null,
    order_link: row.orderLink || null,
    quantity_total: row.quantityTotal ?? 0,
    quantity_allocated: 0,
    quantity_remaining: row.quantityTotal ?? 0,
    quantity_per_container: row.quantityPerContainer,
    low_quantity_threshold: row.lowQuantityThreshold,
    price_per_unit: row.pricePerUnit,
    price_per_container: row.pricePerContainer
  };
}
