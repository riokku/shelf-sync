import { isLowStock, isOutOfStock } from './inventory-item.model';
import { createTestInventoryItem } from '../../testing/fakes';

describe('InventoryItem', () => {
  it('creates an instance with the given values', () => {
    const item = createTestInventoryItem();
    expect(item).toBeTruthy();
    expect(item.name).toBe('Test Item');
    expect(item.quantityRemaining).toBe(50);
  });
});

describe('isLowStock', () => {
  it('is true when remaining quantity is below the threshold', () => {
    const item = createTestInventoryItem({ quantityRemaining: 5, lowQuantityThreshold: 10 });
    expect(isLowStock(item)).toBe(true);
  });

  it('is false when remaining quantity equals the threshold', () => {
    const item = createTestInventoryItem({ quantityRemaining: 10, lowQuantityThreshold: 10 });
    expect(isLowStock(item)).toBe(false);
  });

  it('is false when remaining quantity is above the threshold', () => {
    const item = createTestInventoryItem({ quantityRemaining: 20, lowQuantityThreshold: 10 });
    expect(isLowStock(item)).toBe(false);
  });

  // isLowStock() is still true at zero (0 < any positive threshold) —
  // isOutOfStock() below is the more specific case badge rendering checks
  // first so the two stay mutually exclusive on screen, not a replacement
  // for this one.
  it('is true at exactly zero remaining, same as any other below-threshold amount', () => {
    const item = createTestInventoryItem({ quantityRemaining: 0, lowQuantityThreshold: 10 });
    expect(isLowStock(item)).toBe(true);
  });
});

describe('isOutOfStock', () => {
  it('is true when remaining quantity is exactly zero', () => {
    const item = createTestInventoryItem({ quantityRemaining: 0 });
    expect(isOutOfStock(item)).toBe(true);
  });

  it('is false when any quantity remains', () => {
    const item = createTestInventoryItem({ quantityRemaining: 1 });
    expect(isOutOfStock(item)).toBe(false);
  });

  it('is true for a negative remaining quantity too (defensive — should not normally happen)', () => {
    const item = createTestInventoryItem({ quantityRemaining: -1 });
    expect(isOutOfStock(item)).toBe(true);
  });
});
