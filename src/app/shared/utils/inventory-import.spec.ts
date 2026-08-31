import { Supplier } from '../models/supplier.model';
import {
  IMPORT_CSV_HEADERS,
  buildImportInsertPayload,
  buildInventoryImportTemplateCsv,
  parseAndValidateImportRows
} from './inventory-import';

function makeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'supplier-1',
    name: 'Gatherwell Event Furniture Co.',
    contactName: '',
    email: '',
    phone: '',
    website: '',
    notes: '',
    ...overrides
  };
}

describe('buildInventoryImportTemplateCsv', () => {
  it('writes a header row only, with every documented column and no data rows', () => {
    const csv = buildInventoryImportTemplateCsv();
    const lines = csv.split('\r\n');

    expect(lines.length).toBe(1);
    expect(lines[0].split(',')).toEqual(IMPORT_CSV_HEADERS);
  });

  it('never includes a Barcode column', () => {
    expect(IMPORT_CSV_HEADERS).not.toContain('Barcode');
  });
});

describe('parseAndValidateImportRows', () => {
  it('rejects a file with no "Name" column as not looking like the template', () => {
    const { rows, headerError } = parseAndValidateImportRows('Quantity total\n10', []);

    expect(rows).toEqual([]);
    expect(headerError).toContain('doesn\'t look like the import template');
  });

  it('parses a minimal valid row (Name + Quantity total only) with no errors', () => {
    const csv = 'Name,Quantity total\nFolding Chair,50';
    const { rows, headerError } = parseAndValidateImportRows(csv, []);

    expect(headerError).toBeNull();
    expect(rows.length).toBe(1);
    expect(rows[0].rowNumber).toBe(2);
    expect(rows[0].name).toBe('Folding Chair');
    expect(rows[0].quantityTotal).toBe(50);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings).toEqual([]);
  });

  it('numbers rows accounting for the header row and 1-indexing', () => {
    const csv = 'Name,Quantity total\nItem A,1\nItem B,2\nItem C,3';
    const { rows } = parseAndValidateImportRows(csv, []);

    expect(rows.map(row => row.rowNumber)).toEqual([2, 3, 4]);
  });

  it('flags a blank Name as a blocking error', () => {
    const csv = 'Name,Quantity total\n,50';
    const { rows } = parseAndValidateImportRows(csv, []);

    expect(rows[0].errors).toContain('Name is required');
  });

  it('flags a blank Quantity total as a blocking error', () => {
    const csv = 'Name,Quantity total\nFolding Chair,';
    const { rows } = parseAndValidateImportRows(csv, []);

    expect(rows[0].errors).toContain('Quantity total is required');
  });

  it('flags a non-numeric Quantity total as a blocking error', () => {
    const csv = 'Name,Quantity total\nFolding Chair,fifty';
    const { rows } = parseAndValidateImportRows(csv, []);

    expect(rows[0].errors).toContain('Quantity total must be a number ≥ 0');
  });

  it('flags a negative Quantity total as a blocking error', () => {
    const csv = 'Name,Quantity total\nFolding Chair,-5';
    const { rows } = parseAndValidateImportRows(csv, []);

    expect(rows[0].errors).toContain('Quantity total must be a number ≥ 0');
  });

  it('rejects a row whose Name already exists in the org, case-insensitively', () => {
    const csv = 'Name,Quantity total\nfolding chair,50';
    const { rows } = parseAndValidateImportRows(csv, [], ['Folding Chair']);

    expect(rows[0].errors).toContain('An item with this name already exists');
  });

  it('ignores leading/trailing whitespace when matching against existing names', () => {
    const csv = 'Name,Quantity total\n  Folding Chair  ,50';
    const { rows } = parseAndValidateImportRows(csv, [], ['Folding Chair']);

    expect(rows[0].errors).toContain('An item with this name already exists');
  });

  it('does not flag a name that is not already in the org', () => {
    const csv = 'Name,Quantity total\nRound Table,50';
    const { rows } = parseAndValidateImportRows(csv, [], ['Folding Chair']);

    expect(rows[0].errors).toEqual([]);
  });

  it('rejects every row sharing a name that appears more than once in the same file', () => {
    const csv = 'Name,Quantity total\nFolding Chair,50\nRound Table,20\nfolding chair,30';
    const { rows } = parseAndValidateImportRows(csv, []);

    expect(rows[0].errors).toContain('This name appears more than once in this file');
    expect(rows[1].errors).toEqual([]);
    expect(rows[2].errors).toContain('This name appears more than once in this file');
  });

  it('prefers the "already exists" message over the in-file duplicate message when both apply', () => {
    const csv = 'Name,Quantity total\nFolding Chair,50\nFolding Chair,30';
    const { rows } = parseAndValidateImportRows(csv, [], ['Folding Chair']);

    expect(rows[0].errors).toEqual(['An item with this name already exists']);
    expect(rows[1].errors).toEqual(['An item with this name already exists']);
  });

  it('leaves an optional numeric field blank as null with no error', () => {
    const csv = 'Name,Quantity total,Price per unit\nFolding Chair,50,';
    const { rows } = parseAndValidateImportRows(csv, []);

    expect(rows[0].pricePerUnit).toBeNull();
    expect(rows[0].errors).toEqual([]);
  });

  it('flags an invalid optional numeric field, naming which one', () => {
    const csv = 'Name,Quantity total,Price per unit\nFolding Chair,50,not-a-number';
    const { rows } = parseAndValidateImportRows(csv, []);

    expect(rows[0].errors).toContain('Price per unit must be a number ≥ 0');
  });

  it('accepts a valid YYYY-MM-DD expiration date', () => {
    const csv = 'Name,Quantity total,Expiration date\nFolding Chair,50,2027-03-15';
    const { rows } = parseAndValidateImportRows(csv, []);

    expect(rows[0].expirationDate).toBe('2027-03-15');
    expect(rows[0].errors).toEqual([]);
  });

  it('rejects a malformed expiration date', () => {
    const csv = 'Name,Quantity total,Expiration date\nFolding Chair,50,03/15/2027';
    const { rows } = parseAndValidateImportRows(csv, []);

    expect(rows[0].errors).toContain('Expiration date must be in YYYY-MM-DD format');
  });

  it('rejects a calendar-invalid expiration date (e.g. Feb 30)', () => {
    const csv = 'Name,Quantity total,Expiration date\nFolding Chair,50,2027-02-30';
    const { rows } = parseAndValidateImportRows(csv, []);

    expect(rows[0].errors).toContain('Expiration date must be in YYYY-MM-DD format');
  });

  it('resolves a supplier name against the org directory case-insensitively', () => {
    const csv = 'Name,Quantity total,Supplier name\nFolding Chair,50,gatherwell event furniture co.';
    const suppliers = [makeSupplier()];
    const { rows } = parseAndValidateImportRows(csv, suppliers);

    expect(rows[0].resolvedSupplierId).toBe('supplier-1');
    expect(rows[0].warnings).toEqual([]);
  });

  it('warns (but does not block) on an unmatched supplier name', () => {
    const csv = 'Name,Quantity total,Supplier name\nFolding Chair,50,Some Unknown Supplier';
    const { rows } = parseAndValidateImportRows(csv, [makeSupplier()]);

    expect(rows[0].resolvedSupplierId).toBeNull();
    expect(rows[0].warnings).toEqual(['Supplier "Some Unknown Supplier" not found — item will be imported without a supplier']);
    expect(rows[0].errors).toEqual([]);
  });

  it('leaves supplier unresolved with no warning when the column is blank', () => {
    const csv = 'Name,Quantity total,Supplier name\nFolding Chair,50,';
    const { rows } = parseAndValidateImportRows(csv, [makeSupplier()]);

    expect(rows[0].resolvedSupplierId).toBeNull();
    expect(rows[0].warnings).toEqual([]);
  });
});

describe('buildImportInsertPayload', () => {
  it('maps a valid row to an inventory_items insert, always with barcode null', () => {
    const csv = 'Name,Quantity total,Category,Price per unit\nFolding Chair,50,Furniture,12.5';
    const { rows } = parseAndValidateImportRows(csv, []);

    const payload = buildImportInsertPayload(rows[0]);

    expect(payload).toEqual(jasmine.objectContaining({
      name: 'Folding Chair',
      barcode: null,
      category: 'Furniture',
      quantity_total: 50,
      quantity_allocated: 0,
      quantity_remaining: 50,
      price_per_unit: 12.5
    }));
  });

  it('coerces blank optional text fields to null', () => {
    const csv = 'Name,Quantity total\nFolding Chair,50';
    const { rows } = parseAndValidateImportRows(csv, []);

    const payload = buildImportInsertPayload(rows[0]);

    expect(payload.description).toBeNull();
    expect(payload.physical_location).toBeNull();
    expect(payload.supplier_id).toBeNull();
  });
});
