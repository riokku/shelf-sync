import { buildInventoryExportCsv } from './inventory-export';
import { toInventoryItem } from './inventory-item.mapper';
import { createTestInventoryItemRow } from '../../testing/fakes';

describe('buildInventoryExportCsv', () => {
  it('writes a header row followed by one row per item', () => {
    const items = [
      toInventoryItem(createTestInventoryItemRow({ name: 'Chiavari Chairs' }), [], ''),
      toInventoryItem(createTestInventoryItemRow({ name: 'Folding Tables' }), [], '')
    ];

    const csv = buildInventoryExportCsv(items);
    const lines = csv.split('\r\n');

    expect(lines[0]).toContain('Name');
    expect(lines[0]).toContain('Activity log');
    expect(lines[1]).toContain('Chiavari Chairs');
    expect(lines[2]).toContain('Folding Tables');
    expect(lines.length).toBe(3);
  });

  it('quotes and doubles internal quotes in a field containing a comma', () => {
    const row = createTestInventoryItemRow({ name: 'Widget', description: 'Comes in red, blue, and "gold"' });
    const csv = buildInventoryExportCsv([toInventoryItem(row, [], '')]);

    expect(csv).toContain('"Comes in red, blue, and ""gold"""');
  });

  it('leaves a plain field with no comma, quote, or newline unquoted', () => {
    const row = createTestInventoryItemRow({ name: 'Plain Widget' });
    const csv = buildInventoryExportCsv([toInventoryItem(row, [], '')]);

    expect(csv.split('\r\n')[1]).toMatch(/^Plain Widget,/);
  });

  it('folds every activity log entry for an item into one quoted, newline-joined cell', () => {
    const row = createTestInventoryItemRow({ name: 'Tracked Item' });
    const item = toInventoryItem(row, [], '', [
      { timestamp: '2026-01-15T10:00:00.000Z', user: 'Jamie Lee', userAvatarKey: null, message: 'Created item' },
      { timestamp: '2026-01-16T10:00:00.000Z', user: 'Sam Rivera', userAvatarKey: null, message: 'Updated Quantity remaining (80 → 25)' }
    ]);

    const csv = buildInventoryExportCsv([item]);

    expect(csv).toContain('Jamie Lee: Created item\n');
    expect(csv).toContain('Sam Rivera: Updated Quantity remaining (80 → 25)');
  });

  it('labels status by the same priority order the Inventory table view uses (retired > pending > out of stock > low stock > checked out > available)', () => {
    const retired = toInventoryItem(createTestInventoryItemRow({ status: 'retired', quantity_remaining: 0 }), [], '');
    const pending = toInventoryItem(createTestInventoryItemRow({ status: 'retirement_pending', quantity_remaining: 0 }), [], '');
    const outOfStock = toInventoryItem(createTestInventoryItemRow({ quantity_remaining: 0, low_quantity_threshold: 5 }), [], '');
    const lowStock = toInventoryItem(createTestInventoryItemRow({ quantity_remaining: 2, low_quantity_threshold: 5 }), [], '');
    const checkedOut = toInventoryItem(createTestInventoryItemRow({ quantity_remaining: 10, low_quantity_threshold: 5, is_checked_out: true }), [], 'Jamie Lee');
    const available = toInventoryItem(createTestInventoryItemRow({ quantity_remaining: 10, low_quantity_threshold: 5 }), [], '');

    const csv = buildInventoryExportCsv([retired, pending, outOfStock, lowStock, checkedOut, available]);
    const lines = csv.split('\r\n').slice(1);

    // Status is the second-to-last column, with an empty (no activity
    // logged) final Activity log column trailing after it — hence the
    // trailing comma rather than end-of-line right after the status value.
    expect(lines[0]).toMatch(/,Retired,$/);
    expect(lines[1]).toMatch(/,Pending retirement,$/);
    expect(lines[2]).toMatch(/,Out of stock,$/);
    expect(lines[3]).toMatch(/,Low stock,$/);
    expect(lines[4]).toMatch(/,Checked out,$/);
    expect(lines[5]).toMatch(/,Available,$/);
  });
});
