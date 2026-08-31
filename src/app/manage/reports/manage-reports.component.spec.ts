import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ManageReportsComponent } from './manage-reports.component';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService } from '../../core/auth.service';
import { createFakeAuthService, createFakeProfile } from '../../testing/fakes';

/** Table-aware fake — each of the four queries this component makes needs
 *  its own canned rows, unlike the shared createFakeSupabaseService() (one
 *  result reused for every table). */
function createFakeSupabaseServiceForReports(data: {
  items?: unknown[];
  discards?: unknown[];
  tasks?: unknown[];
  profiles?: unknown[];
  errors?: { items?: string; discards?: string; tasks?: string };
}): SupabaseService {
  function builderFor(rows: unknown[], errorMessage: string | undefined) {
    const error = errorMessage ? { message: errorMessage } : null;
    const builder: Record<string, unknown> = {
      then: (resolve: (value: { data: unknown[] | null; error: { message: string } | null }) => void) =>
        resolve({ data: error ? null : rows, error }),
    };
    for (const method of ['select', 'eq', 'neq', 'order']) {
      builder[method] = () => builder;
    }
    return builder;
  }

  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'inventory_item_discards') {
          return builderFor(data.discards ?? [], data.errors?.discards);
        }
        if (table === 'tasks') {
          return builderFor(data.tasks ?? [], data.errors?.tasks);
        }
        if (table === 'profiles') {
          return builderFor(data.profiles ?? [], undefined);
        }
        return builderFor(data.items ?? [], data.errors?.items);
      }
    }
  };
  return fake as unknown as SupabaseService;
}

function item(overrides: Partial<{
  id: string;
  category: string | null;
  physical_location: string | null;
  quantity_remaining: number;
  low_quantity_threshold: number | null;
  price_per_unit: number | null;
  price_per_container: number | null;
  quantity_per_container: number | null;
  status: 'active' | 'retirement_pending' | 'retired';
}> = {}) {
  return {
    id: 'item-1',
    category: 'Furniture',
    physical_location: 'Warehouse A',
    quantity_remaining: 10,
    low_quantity_threshold: 5,
    price_per_unit: 10,
    price_per_container: null,
    quantity_per_container: null,
    status: 'active' as const,
    ...overrides
  };
}

async function createComponent(data: {
  items?: unknown[];
  discards?: unknown[];
  tasks?: unknown[];
  profiles?: unknown[];
  errors?: { items?: string; discards?: string; tasks?: string };
}): Promise<ManageReportsComponent> {
  await TestBed.resetTestingModule().configureTestingModule({
    imports: [ManageReportsComponent],
    providers: [
      provideRouter([]),
      { provide: SupabaseService, useValue: createFakeSupabaseServiceForReports(data) },
      { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ organization_id: 'org-1' })) }
    ]
  }).compileComponents();

  const fixture: ComponentFixture<ManageReportsComponent> = TestBed.createComponent(ManageReportsComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.componentInstance;
}

describe('ManageReportsComponent', () => {
  it('should create', async () => {
    const component = await createComponent({});
    expect(component).toBeTruthy();
    expect(component.isLoading).toBeFalse();
  });

  describe('load errors', () => {
    it('sets loadError instead of silently rendering zeroed-out stats when the items query fails', async () => {
      const component = await createComponent({ errors: { items: 'Network error' } });
      expect(component.loadError).toBe('Network error');
      expect(component.isLoading).toBeFalse();
    });

    it('sets loadError when the discards query fails', async () => {
      const component = await createComponent({ errors: { discards: 'Network error' } });
      expect(component.loadError).toBe('Network error');
    });

    it('sets loadError when the tasks query fails', async () => {
      const component = await createComponent({ errors: { tasks: 'Network error' } });
      expect(component.loadError).toBe('Network error');
    });

    it('retryLoad() clears loadError on a successful retry', async () => {
      const component = await createComponent({ errors: { items: 'Network error' } });
      expect(component.loadError).toBe('Network error');

      (component as unknown as { supabase: SupabaseService['client'] }).supabase =
        createFakeSupabaseServiceForReports({}).client;

      component.retryLoad();
      // A real macrotask boundary rather than a fixed number of
      // Promise.resolve() ticks — loadReportData()'s own Promise.all resolves
      // several microtasks deep (four chained query builders), which a
      // couple of bare ticks doesn't reliably flush.
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(component.loadError).toBeNull();
    });
  });

  describe('inventory value & stock health', () => {
    it('sums quantity_remaining * price_per_unit across active items only', async () => {
      const component = await createComponent({
        items: [
          item({ id: '1', quantity_remaining: 10, price_per_unit: 5 }), // $50
          item({ id: '2', quantity_remaining: 4, price_per_unit: 2, status: 'retired' }), // excluded
          item({ id: '3', quantity_remaining: 2, price_per_unit: 25 }) // $50
        ]
      });

      expect(component.totalValue).toBe(100);
      expect(component.activeItemCount).toBe(2);
    });

    it('falls back to price_per_container / quantity_per_container when price_per_unit is unset', async () => {
      const component = await createComponent({
        items: [item({ quantity_remaining: 5, price_per_unit: null, price_per_container: 40, quantity_per_container: 10 })]
      });

      // Effective unit price = 40 / 10 = 4; value = 5 * 4 = 20.
      expect(component.totalValue).toBe(20);
    });

    it('contributes $0 for an item with no pricing at all', async () => {
      const component = await createComponent({
        items: [item({ price_per_unit: null, price_per_container: null, quantity_per_container: null })]
      });

      expect(component.totalValue).toBe(0);
    });

    it('counts low-stock and out-of-stock active items separately', async () => {
      const component = await createComponent({
        items: [
          item({ id: '1', quantity_remaining: 2, low_quantity_threshold: 5 }), // low
          item({ id: '2', quantity_remaining: 0, low_quantity_threshold: null }), // out of stock
          item({ id: '3', quantity_remaining: 20, low_quantity_threshold: 5 }) // sufficient
        ]
      });

      expect(component.lowStockCount).toBe(1);
      expect(component.outOfStockCount).toBe(1);
    });

    it('groups value by category and by location, sorted descending, with a fallback label for unset fields', async () => {
      const component = await createComponent({
        items: [
          item({ id: '1', category: 'Furniture', physical_location: 'Warehouse A', quantity_remaining: 1, price_per_unit: 10 }),
          item({ id: '2', category: 'Furniture', physical_location: 'Warehouse A', quantity_remaining: 1, price_per_unit: 10 }),
          item({ id: '3', category: null, physical_location: null, quantity_remaining: 1, price_per_unit: 100 })
        ]
      });

      expect(component.valueByCategory).toEqual([
        { label: 'Uncategorized', primary: 100, itemCount: 1 },
        { label: 'Furniture', primary: 20, itemCount: 2 }
      ]);
      expect(component.valueByLocation).toEqual([
        { label: 'Unspecified', primary: 100, itemCount: 1 },
        { label: 'Warehouse A', primary: 20, itemCount: 2 }
      ]);
    });
  });

  describe('stock movement & loss', () => {
    it('totals discarded units and events, and finds the top 5 reasons by quantity', async () => {
      const component = await createComponent({
        discards: [
          { item_id: 'item-1', quantity: 3, reason: ['Water damage'] },
          { item_id: 'item-1', quantity: 2, reason: ['Water damage'] },
          { item_id: 'item-2', quantity: 10, reason: ['Broken in transit'] },
          { item_id: 'item-2', quantity: 1, reason: ['Expired'] }
        ]
      });

      expect(component.totalDiscardedUnits).toBe(16);
      expect(component.discardEventCount).toBe(4);
      expect(component.topDiscardReasons.map(row => row.label)).toEqual(['Broken in transit', 'Water damage', 'Expired']);
      expect(component.topDiscardReasons[0].primary).toBe(10);
      expect(component.topDiscardReasons[1].primary).toBe(5);
    });

    it('credits every selected reason with the full quantity, for a multi-reason discard', async () => {
      const component = await createComponent({
        discards: [{ item_id: 'item-1', quantity: 5, reason: ['Water damage', 'Wear and tear'] }]
      });

      const byLabel = new Map(component.topDiscardReasons.map(row => [row.label, row.primary]));
      expect(byLabel.get('Water damage')).toBe(5);
      expect(byLabel.get('Wear and tear')).toBe(5);
      // Not double-counted in the totals — those are per discard event, not per reason.
      expect(component.totalDiscardedUnits).toBe(5);
      expect(component.discardEventCount).toBe(1);
    });

    it('caps top reasons at 5', async () => {
      const component = await createComponent({
        discards: Array.from({ length: 8 }, (_, i) => ({ item_id: 'item-1', quantity: 1, reason: [`Reason ${i}`] }))
      });

      expect(component.topDiscardReasons.length).toBe(5);
    });

    it('groups discards by their item\'s category, correlated from the inventory_items query', async () => {
      const component = await createComponent({
        items: [
          item({ id: 'chair-1', category: 'Furniture' }),
          item({ id: 'tent-1', category: 'Tents' })
        ],
        discards: [
          { item_id: 'chair-1', quantity: 2, reason: ['Water damage'] },
          { item_id: 'tent-1', quantity: 1, reason: ['Ripped'] },
          { item_id: 'unknown-item', quantity: 4, reason: ['Lost'] }
        ]
      });

      expect(component.discardsByCategory).toEqual([
        { label: 'Uncategorized', primary: 4, itemCount: 0 },
        { label: 'Furniture', primary: 2, itemCount: 0 },
        { label: 'Tents', primary: 1, itemCount: 0 }
      ]);
    });

    it('computes retirement rate by category, excluding categories with no retirements', async () => {
      const component = await createComponent({
        items: [
          item({ id: '1', category: 'Furniture', status: 'retired' }),
          item({ id: '2', category: 'Furniture', status: 'active' }),
          item({ id: '3', category: 'Furniture', status: 'active' }),
          item({ id: '4', category: 'Tents', status: 'active' })
        ]
      });

      expect(component.retirementRateByCategory).toEqual([
        { category: 'Furniture', retiredCount: 1, totalCount: 3, rate: 1 / 3 }
      ]);
    });
  });

  describe('task throughput', () => {
    function task(overrides: Partial<{
      status: 'todo' | 'in_progress' | 'done';
      due_date: string | null;
      created_at: string;
      updated_at: string;
      assigned_to: string | null;
    }> = {}) {
      return {
        status: 'todo' as const,
        due_date: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        assigned_to: null,
        ...overrides
      };
    }

    it('computes completion rate and completed/total counts', async () => {
      const component = await createComponent({
        tasks: [task({ status: 'done' }), task({ status: 'done' }), task({ status: 'todo' }), task({ status: 'in_progress' })]
      });

      expect(component.totalTasks).toBe(4);
      expect(component.completedTaskCount).toBe(2);
      expect(component.completionRatePercent).toBe(50);
    });

    it('is 0% with no tasks at all, not a divide-by-zero NaN', async () => {
      const component = await createComponent({ tasks: [] });
      expect(component.completionRatePercent).toBe(0);
    });

    it('counts a task overdue only when not done and past due', async () => {
      const component = await createComponent({
        tasks: [
          task({ status: 'todo', due_date: '2020-01-01' }), // overdue
          task({ status: 'done', due_date: '2020-01-01' }), // done, not overdue despite the date
          task({ status: 'todo', due_date: null }) // no due date
        ]
      });

      expect(component.overdueTaskCount).toBe(1);
    });

    it('averages days-to-close across done tasks only, and is null with no done tasks yet', async () => {
      const withDone = await createComponent({
        tasks: [
          task({ status: 'done', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-03T00:00:00.000Z' }), // 2 days
          task({ status: 'done', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z' }), // 4 days
          task({ status: 'todo' })
        ]
      });
      expect(withDone.averageDaysToClose).toBe(3);

      const withoutDone = await createComponent({ tasks: [task({ status: 'todo' })] });
      expect(withoutDone.averageDaysToClose).toBeNull();
    });

    it('groups workload by assignee, resolving a name and falling back to "Unassigned"', async () => {
      const alice = createFakeProfile({ id: 'alice', full_name: 'Alice' });
      const component = await createComponent({
        profiles: [alice],
        tasks: [
          task({ assigned_to: 'alice', status: 'todo' }),
          task({ assigned_to: 'alice', status: 'done' }),
          task({ assigned_to: null, status: 'todo' })
        ]
      });

      const aliceRow = component.workloadByAssignee.find(row => row.label === 'Alice');
      expect(aliceRow).toEqual({ label: 'Alice', todo: 1, inProgress: 0, done: 1, overdue: 0 });
      expect(component.workloadByAssignee.some(row => row.label === 'Unassigned')).toBeTrue();
    });

    it('statusCount() reads the matching field for each task status', async () => {
      const component = await createComponent({});
      const row = { label: 'Alice', todo: 1, inProgress: 2, done: 3, overdue: 0 };

      expect(component.statusCount(row, 'todo')).toBe(1);
      expect(component.statusCount(row, 'in_progress')).toBe(2);
      expect(component.statusCount(row, 'done')).toBe(3);
    });
  });

  describe('barWidth()', () => {
    it('scales a value relative to the largest primary in the list', async () => {
      const component = await createComponent({});
      const rows = [{ label: 'a', primary: 50, itemCount: 0 }, { label: 'b', primary: 100, itemCount: 0 }];

      expect(component.barWidth(rows, 50)).toBe(50);
      expect(component.barWidth(rows, 100)).toBe(100);
    });

    it('falls back to a max of 1 for an empty list rather than dividing by zero', async () => {
      const component = await createComponent({});
      expect(component.barWidth([], 0)).toBe(0);
    });
  });

  describe('valueByCategoryChartData', () => {
    it('passes every category through unchanged when there are 5 or fewer', async () => {
      const component = await createComponent({
        items: [
          item({ id: '1', category: 'Furniture', quantity_remaining: 1, price_per_unit: 10 }),
          item({ id: '2', category: 'Tents', quantity_remaining: 1, price_per_unit: 5 })
        ]
      });

      expect(component.valueByCategoryChartData).toEqual([
        { label: 'Furniture', value: 10 },
        { label: 'Tents', value: 5 }
      ]);
    });

    it('caps the chart at the top 5 categories plus one folded-in "Other" slice', async () => {
      const component = await createComponent({
        items: Array.from({ length: 7 }, (_, i) =>
          item({ id: `item-${i}`, category: `Category ${i}`, quantity_remaining: 1, price_per_unit: 7 - i })
        )
      });

      expect(component.valueByCategoryChartData.length).toBe(6);
      expect(component.valueByCategoryChartData[5]).toEqual({ label: 'Other', value: 1 + 2 }); // Category 5 ($2) + Category 6 ($1)
    });

    it('omits the "Other" slice entirely when there are exactly 5 categories', async () => {
      const component = await createComponent({
        items: Array.from({ length: 5 }, (_, i) =>
          item({ id: `item-${i}`, category: `Category ${i}`, quantity_remaining: 1, price_per_unit: 1 })
        )
      });

      expect(component.valueByCategoryChartData.length).toBe(5);
      expect(component.valueByCategoryChartData.some(slice => slice.label === 'Other')).toBeFalse();
    });
  });

  describe('workloadSegmentWidth()', () => {
    function reportsTask(assignedTo: string) {
      return { status: 'todo' as const, due_date: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', assigned_to: assignedTo };
    }

    it('scales a status segment against the page-wide busiest assignee\'s total, not the row\'s own total', async () => {
      const alice = createFakeProfile({ id: 'alice', full_name: 'Alice' });
      const bob = createFakeProfile({ id: 'bob', full_name: 'Bob' });
      const component = await createComponent({
        profiles: [alice, bob],
        tasks: [
          ...Array.from({ length: 8 }, () => reportsTask('alice')),
          reportsTask('bob')
        ]
      });

      const bobRow = component.workloadByAssignee.find(row => row.label === 'Bob')!;
      // Bob has 1 of 1 own task, but only 1 of the page-wide max of 8 —
      // a naive per-row 100% scale would read this as a full-width bar.
      expect(component.workloadSegmentWidth(bobRow, 'todo')).toBe(1 / 8 * 100);
    });
  });
});
