import { loadAllInventoryItemReservations, loadUpcomingReservationsForItem } from './inventory-item-reservations';
import { createFakeProfile } from '../../testing/fakes';

/** Minimal chainable stand-in scoped to exactly the query shapes this file's
 *  functions use — createFakeSupabaseService (testing/fakes.ts) is
 *  deliberately too generic for this: it returns the same fixed result for
 *  every `.from()` call, which can't express "these particular rows came
 *  back," same reasoning activity-log.spec.ts's own fake client gives. */
function createFakeSupabaseClient(rows: unknown[] = []) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: { data: unknown; error: unknown }) => void) => resolve({ data: rows, error: null }),
  };
  for (const method of ['select', 'eq', 'in', 'gte', 'order']) {
    builder[method] = () => builder;
  }
  return { client: { from: () => builder } } as unknown as { client: { from: () => unknown } };
}

describe('loadAllInventoryItemReservations', () => {
  const profiles = [createFakeProfile({ id: 'user-1', nickname: 'Kirsty' })];

  it('maps a row to its display shape, resolving actor labels and the item name', async () => {
    const fake = createFakeSupabaseClient([{
      id: 'reservation-1',
      item_id: 'item-1',
      start_date: '2026-06-01',
      end_date: '2026-06-03',
      quantity: 30,
      reserved_for: 'Smith wedding',
      note: null,
      status: 'reserved',
      reserved_by: 'user-1',
      reserved_at: '2026-01-15T00:00:00.000Z',
      picked_up_by: null,
      picked_up_at: null,
      returned_by: null,
      returned_at: null,
      cancelled_by: null,
      cancelled_at: null
    }]);

    const reservations = await loadAllInventoryItemReservations(
      fake.client as never,
      profiles,
      new Map([['item-1', 'Chiavari Chairs']])
    );

    expect(reservations).toEqual([{
      id: 'reservation-1',
      itemId: 'item-1',
      itemName: 'Chiavari Chairs',
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      quantity: 30,
      reservedFor: 'Smith wedding',
      note: '',
      status: 'reserved',
      reservedByLabel: 'Kirsty',
      reservedAt: '2026-01-15T00:00:00.000Z',
      pickedUpByLabel: '',
      pickedUpAt: '',
      returnedByLabel: '',
      returnedAt: '',
      cancelledByLabel: '',
      cancelledAt: ''
    }]);
  });

  it('falls back to "Unknown item" when itemNamesById has no entry', async () => {
    const fake = createFakeSupabaseClient([{
      id: 'reservation-1',
      item_id: 'item-gone',
      start_date: '2026-06-01',
      end_date: '2026-06-03',
      quantity: 5,
      reserved_for: 'Someone',
      note: null,
      status: 'reserved',
      reserved_by: null,
      reserved_at: '2026-01-15T00:00:00.000Z',
      picked_up_by: null,
      picked_up_at: null,
      returned_by: null,
      returned_at: null,
      cancelled_by: null,
      cancelled_at: null
    }]);

    const reservations = await loadAllInventoryItemReservations(fake.client as never, [], new Map());

    expect(reservations[0].itemName).toBe('Unknown item');
    expect(reservations[0].reservedByLabel).toBe('Unknown user');
  });

  it('returns an empty array when there are no reservations', async () => {
    const fake = createFakeSupabaseClient([]);
    const reservations = await loadAllInventoryItemReservations(fake.client as never, profiles, new Map());
    expect(reservations).toEqual([]);
  });
});

describe('loadUpcomingReservationsForItem', () => {
  it('maps rows without needing profiles resolved', async () => {
    const fake = createFakeSupabaseClient([{
      id: 'reservation-1',
      item_id: 'item-1',
      start_date: '2026-06-01',
      end_date: '2026-06-03',
      quantity: 30,
      reserved_for: 'Smith wedding',
      note: 'Deliver by 8am',
      status: 'picked_up',
      reserved_by: null,
      reserved_at: '2026-01-15T00:00:00.000Z',
      picked_up_by: null,
      picked_up_at: '2026-06-01T09:00:00.000Z',
      returned_by: null,
      returned_at: null,
      cancelled_by: null,
      cancelled_at: null
    }]);

    const reservations = await loadUpcomingReservationsForItem(fake.client as never, 'item-1');

    expect(reservations.length).toBe(1);
    expect(reservations[0].quantity).toBe(30);
    expect(reservations[0].reservedFor).toBe('Smith wedding');
    expect(reservations[0].note).toBe('Deliver by 8am');
    expect(reservations[0].status).toBe('picked_up');
  });
});
