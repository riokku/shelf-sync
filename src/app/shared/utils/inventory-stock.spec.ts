import { isRowLowStock, isRowOutOfStock, needsRestockAttention } from './inventory-stock';

describe('isRowLowStock', () => {
  it('is true when remaining is under the threshold', () => {
    expect(isRowLowStock({ quantity_remaining: 2, low_quantity_threshold: 5 })).toBeTrue();
  });

  it('is false when remaining is at or above the threshold', () => {
    expect(isRowLowStock({ quantity_remaining: 5, low_quantity_threshold: 5 })).toBeFalse();
    expect(isRowLowStock({ quantity_remaining: 10, low_quantity_threshold: 5 })).toBeFalse();
  });

  it('is false when no threshold is configured, even at zero remaining', () => {
    expect(isRowLowStock({ quantity_remaining: 0, low_quantity_threshold: null })).toBeFalse();
  });
});

describe('isRowOutOfStock', () => {
  it('is true at zero or negative remaining', () => {
    expect(isRowOutOfStock({ quantity_remaining: 0 })).toBeTrue();
  });

  it('is false with any remaining stock', () => {
    expect(isRowOutOfStock({ quantity_remaining: 1 })).toBeFalse();
  });
});

describe('needsRestockAttention', () => {
  it('is true for out-of-stock even with no threshold configured (not a subset of isRowLowStock)', () => {
    const row = { quantity_remaining: 0, low_quantity_threshold: null };
    expect(isRowLowStock(row)).toBeFalse();
    expect(needsRestockAttention(row)).toBeTrue();
  });

  it('is true for low stock', () => {
    expect(needsRestockAttention({ quantity_remaining: 2, low_quantity_threshold: 5 })).toBeTrue();
  });

  it('is false with sufficient stock', () => {
    expect(needsRestockAttention({ quantity_remaining: 20, low_quantity_threshold: 5 })).toBeFalse();
  });
});
