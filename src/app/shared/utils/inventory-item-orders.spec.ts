import { loadAllInventoryItemOrders } from './inventory-item-orders';
import { createFakeProfile } from '../../testing/fakes';

/** Minimal chainable stand-in scoped to exactly the query shape
 *  loadAllInventoryItemOrders uses (select/order) — same reasoning as
 *  inventory-item-containers.spec.ts's own fake. */
function createFakeSupabaseClient(rows: unknown[] = []) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: { data: unknown; error: unknown }) => void) => resolve({ data: rows, error: null }),
  };
  for (const method of ['select', 'order']) {
    builder[method] = () => builder;
  }
  return { from: () => builder } as unknown as { from: () => unknown };
}

describe('loadAllInventoryItemOrders', () => {
  const profiles = [
    createFakeProfile({ id: 'user-1', nickname: 'Jamie Lee' }),
    createFakeProfile({ id: 'user-2', nickname: 'Sam Rivera' })
  ];
  const itemNamesById = new Map([['item-1', 'Chiavari Chairs']]);

  it('maps a row to InventoryItemOrderWithItem, resolving item id to name and ordered_by/received_by to display names', async () => {
    const client = createFakeSupabaseClient([{
      id: 'order-1',
      item_id: 'item-1',
      supplier_name: 'Gatherwell Event Furniture Co.',
      quantity: 20,
      status: 'received',
      note: 'Rush order',
      ordered_by: 'user-1',
      ordered_at: '2026-01-15T00:00:00.000Z',
      received_by: 'user-2',
      received_at: '2026-01-18T00:00:00.000Z'
    }]);

    const orders = await loadAllInventoryItemOrders(client as never, profiles, itemNamesById);

    expect(orders).toEqual([{
      id: 'order-1',
      itemId: 'item-1',
      itemName: 'Chiavari Chairs',
      supplierName: 'Gatherwell Event Furniture Co.',
      quantity: 20,
      status: 'received',
      note: 'Rush order',
      orderedByLabel: 'Jamie Lee',
      orderedAt: '2026-01-15T00:00:00.000Z',
      receivedByLabel: 'Sam Rivera',
      receivedAt: '2026-01-18T00:00:00.000Z'
    }]);
  });

  it('falls back to "Unknown item" when the order\'s item_id matches nothing in the provided map', async () => {
    const client = createFakeSupabaseClient([{
      id: 'order-2',
      item_id: 'item-deleted',
      supplier_name: 'Linen & Lace Event Textiles',
      quantity: 5,
      status: 'ordered',
      note: null,
      ordered_by: 'user-1',
      ordered_at: '2026-01-20T00:00:00.000Z',
      received_by: null,
      received_at: null
    }]);

    const orders = await loadAllInventoryItemOrders(client as never, profiles, itemNamesById);

    expect(orders[0].itemName).toBe('Unknown item');
  });

  it('returns an empty array when the org has no orders', async () => {
    const client = createFakeSupabaseClient([]);

    const orders = await loadAllInventoryItemOrders(client as never, profiles, itemNamesById);

    expect(orders).toEqual([]);
  });
});
