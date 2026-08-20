import { toInventoryItem } from './inventory-item.mapper';
import { createTestInventoryItemRow } from '../../testing/fakes';

describe('toInventoryItem', () => {
  it('maps a fully-populated row straight across', () => {
    const row = createTestInventoryItemRow({
      name: 'Cordless Drill',
      description: 'A drill',
      category: 'Tools',
      quantity_total: 20,
      quantity_remaining: 12,
      status: 'retirement_pending',
      checked_out_to: 'user-2',
      is_checked_out: true
    });

    const item = toInventoryItem(row, [], 'Jamie Lee');

    expect(item.id).toBe(row.id);
    expect(item.name).toBe('Cordless Drill');
    expect(item.description).toBe('A drill');
    expect(item.category).toBe('Tools');
    expect(item.quantityTotal).toBe(20);
    expect(item.quantityRemaining).toBe(12);
    expect(item.status).toBe('retirement_pending');
    expect(item.isCheckedOut).toBe(true);
    expect(item.checkedOutTo).toBe('Jamie Lee');
    expect(item.checkedOutToId).toBe('user-2');
  });

  it('turns nullable text columns into empty strings, not null, so templates can bind them directly', () => {
    const row = createTestInventoryItemRow({
      description: null,
      category: null,
      physical_location: null,
      supplier_name: null,
      order_link: null
    });

    const item = toInventoryItem(row, [], '');

    expect(item.description).toBe('');
    expect(item.category).toBe('');
    expect(item.physicalLocation).toBe('');
    expect(item.supplierName).toBe('');
    expect(item.orderLink).toBe('');
  });

  it('turns nullable numeric columns into 0, not null', () => {
    const row = createTestInventoryItemRow({
      quantity_per_container: null,
      low_quantity_threshold: null,
      price_per_unit: null,
      price_per_container: null
    });

    const item = toInventoryItem(row, [], '');

    expect(item.quantityPerContainer).toBe(0);
    expect(item.lowQuantityThreshold).toBe(0);
    expect(item.pricePerUnit).toBe(0);
    expect(item.pricePerContainer).toBe(0);
  });

  it('uses the gallery table images when present, cover image being the first one', () => {
    const row = createTestInventoryItemRow({ image: 'legacy.jpg' });
    const item = toInventoryItem(row, ['gallery-1.jpg', 'gallery-2.jpg'], '');

    expect(item.images).toEqual(['gallery-1.jpg', 'gallery-2.jpg']);
    expect(item.image).toBe('gallery-1.jpg');
  });

  it('falls back to the legacy single image column when the gallery table has nothing for this item', () => {
    const row = createTestInventoryItemRow({ image: 'legacy.jpg' });
    const item = toInventoryItem(row, [], '');

    expect(item.images).toEqual(['legacy.jpg']);
    expect(item.image).toBe('legacy.jpg');
  });

  it('leaves image/images empty when there is neither a gallery nor a legacy image', () => {
    const row = createTestInventoryItemRow({ image: null });
    const item = toInventoryItem(row, [], '');

    expect(item.images).toEqual([]);
    expect(item.image).toBe('');
  });

  it('maps retirement fields, defaulting the label params and empty note/timestamps', () => {
    const row = createTestInventoryItemRow({
      status: 'retired',
      retired_by: 'user-3',
      retired_at: '2026-02-01T00:00:00.000Z',
      retirement_requested_by: 'user-4',
      retirement_requested_at: '2026-01-30T00:00:00.000Z',
      retirement_request_note: 'No longer stocked'
    });

    const item = toInventoryItem(row, [], '', [], null, 'Jamie Lee', 'Admin Dude');

    expect(item.status).toBe('retired');
    expect(item.retiredByLabel).toBe('Admin Dude');
    expect(item.retiredAt).toBe('2026-02-01T00:00:00.000Z');
    expect(item.retirementRequestedById).toBe('user-4');
    expect(item.retirementRequestedByLabel).toBe('Jamie Lee');
    expect(item.retirementRequestNote).toBe('No longer stocked');
  });

  it('maps lock fields, defaulting the label param and empty timestamp', () => {
    const row = createTestInventoryItemRow({
      is_locked: true,
      locked_by: 'user-5',
      locked_at: '2026-03-01T00:00:00.000Z'
    });

    const item = toInventoryItem(row, [], '', [], null, '', '', 'Sam Rivera');

    expect(item.isLocked).toBe(true);
    expect(item.lockedByLabel).toBe('Sam Rivera');
    expect(item.lockedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('defaults isLocked to false and lockedAt to an empty string when unset', () => {
    const row = createTestInventoryItemRow({ is_locked: false, locked_at: null });

    const item = toInventoryItem(row, [], '');

    expect(item.isLocked).toBe(false);
    expect(item.lockedAt).toBe('');
  });

  it('defaults retirement note/timestamps to empty strings rather than null when unset', () => {
    const row = createTestInventoryItemRow({
      retirement_request_note: null,
      retirement_requested_at: null,
      retired_at: null
    });

    const item = toInventoryItem(row, [], '');

    expect(item.retirementRequestNote).toBe('');
    expect(item.retirementRequestedAt).toBe('');
    expect(item.retiredAt).toBe('');
  });
});
