import { loadInventoryItemOrders } from './inventory-item-orders';
import { createFakeProfile } from '../../testing/fakes';

/** Minimal chainable stand-in scoped to exactly the query shape
 *  loadInventoryItemOrders uses (select/eq/order) — same reasoning as
 *  inventory-item-containers.spec.ts's own fake. */
function createFakeSupabaseClient(rows: unknown[] = []) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: { data: unknown; error: unknown }) => void) => resolve({ data: rows, error: null }),
  };
  for (const method of ['select', 'eq', 'order']) {
    builder[method] = () => builder;
  }
  return { from: () => builder } as unknown as { from: () => unknown };
}

describe('loadInventoryItemOrders', () => {
  const profiles = [
    createFakeProfile({ id: 'user-1', nickname: 'Jamie Lee' }),
    createFakeProfile({ id: 'user-2', nickname: 'Sam Rivera' })
  ];

  it('maps a row to InventoryItemOrder, resolving ordered_by/received_by to display names', async () => {
    const client = createFakeSupabaseClient([{
      id: 'order-1',
      supplier_name: 'Gatherwell Event Furniture Co.',
      quantity: 20,
      status: 'received',
      note: 'Rush order',
      ordered_by: 'user-1',
      ordered_at: '2026-01-15T00:00:00.000Z',
      received_by: 'user-2',
      received_at: '2026-01-18T00:00:00.000Z'
    }]);

    const orders = await loadInventoryItemOrders(client as never, 'item-1', profiles);

    expect(orders).toEqual([{
      id: 'order-1',
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

  it('defaults a null note/received_by/received_at to empty rather than null, and an unresolvable orderer to "Unknown user"', async () => {
    const client = createFakeSupabaseClient([{
      id: 'order-2',
      supplier_name: 'Linen & Lace Event Textiles',
      quantity: 5,
      status: 'ordered',
      note: null,
      ordered_by: 'user-nonexistent',
      ordered_at: '2026-01-20T00:00:00.000Z',
      received_by: null,
      received_at: null
    }]);

    const orders = await loadInventoryItemOrders(client as never, 'item-1', profiles);

    expect(orders[0].note).toBe('');
    expect(orders[0].orderedByLabel).toBe('Unknown user');
    expect(orders[0].receivedByLabel).toBe('');
    expect(orders[0].receivedAt).toBe('');
  });

  it('returns an empty array when the item has no orders', async () => {
    const client = createFakeSupabaseClient([]);

    const orders = await loadInventoryItemOrders(client as never, 'item-1', profiles);

    expect(orders).toEqual([]);
  });
});
