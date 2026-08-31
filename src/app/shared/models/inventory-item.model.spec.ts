import { isCheckoutOverdue, isLowStock, isOutOfStock } from './inventory-item.model';
import { createTestInventoryItem } from '../../testing/fakes';
import { toIsoDateString } from '../utils/date';

/** Builds a 'YYYY-MM-DD' string offset from today by the given number of
 *  days (negative for the past) — avoids hardcoding a date that would
 *  eventually become stale relative to isCheckoutOverdue()'s own
 *  getTodayIsoDate() comparison. */
function isoDateDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIsoDateString(date)!;
}

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

describe('isCheckoutOverdue', () => {
  it('is true for a checked-out item whose due date has passed', () => {
    const item = createTestInventoryItem({ isCheckedOut: true, checkedOutDueAt: isoDateDaysFromToday(-1) });
    expect(isCheckoutOverdue(item)).toBe(true);
  });

  it('is false for a checked-out item whose due date is today', () => {
    const item = createTestInventoryItem({ isCheckedOut: true, checkedOutDueAt: isoDateDaysFromToday(0) });
    expect(isCheckoutOverdue(item)).toBe(false);
  });

  it('is false for a checked-out item whose due date is in the future', () => {
    const item = createTestInventoryItem({ isCheckedOut: true, checkedOutDueAt: isoDateDaysFromToday(1) });
    expect(isCheckoutOverdue(item)).toBe(false);
  });

  it('is false for a checked-out item with no due date set', () => {
    const item = createTestInventoryItem({ isCheckedOut: true, checkedOutDueAt: '' });
    expect(isCheckoutOverdue(item)).toBe(false);
  });

  it('is false once the item is no longer checked out, even with a past due date still on the row', () => {
    const item = createTestInventoryItem({ isCheckedOut: false, checkedOutDueAt: isoDateDaysFromToday(-5) });
    expect(isCheckoutOverdue(item)).toBe(false);
  });
});
