import { isLowStock } from './inventory-item.model';
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
});
