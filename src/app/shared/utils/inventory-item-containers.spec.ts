import { loadInventoryItemContainers, sumContainerQuantity } from './inventory-item-containers';

/** Minimal chainable stand-in scoped to exactly the query shape
 *  loadInventoryItemContainers uses (select/eq/order) — same reasoning as
 *  activity-log.spec.ts's own fake: createFakeSupabaseService is too generic
 *  to express "these particular rows came back". */
function createFakeSupabaseClient(rows: unknown[] = []) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: { data: unknown; error: unknown }) => void) => resolve({ data: rows, error: null }),
  };
  for (const method of ['select', 'eq', 'order']) {
    builder[method] = () => builder;
  }
  return { from: () => builder } as unknown as { from: () => unknown };
}

describe('loadInventoryItemContainers', () => {
  it('maps rows to InventoryItemContainer, defaulting a null location to an empty string', async () => {
    const client = createFakeSupabaseClient([
      { id: 'box-1', quantity: 20, location: 'Shelf A' },
      { id: 'box-2', quantity: 15, location: null }
    ]);

    const containers = await loadInventoryItemContainers(client as never, 'item-1');

    expect(containers).toEqual([
      { id: 'box-1', quantity: 20, location: 'Shelf A' },
      { id: 'box-2', quantity: 15, location: '' }
    ]);
  });

  it('returns an empty array when the item has no containers', async () => {
    const client = createFakeSupabaseClient([]);

    const containers = await loadInventoryItemContainers(client as never, 'item-1');

    expect(containers).toEqual([]);
  });
});

describe('sumContainerQuantity', () => {
  it('sums every container quantity', () => {
    expect(sumContainerQuantity([{ quantity: 20 }, { quantity: 15 }, { quantity: 0 }])).toBe(35);
  });

  it('returns 0 for an empty list', () => {
    expect(sumContainerQuantity([])).toBe(0);
  });
});
