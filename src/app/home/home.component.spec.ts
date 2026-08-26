import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomeComponent } from './home.component';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { createFakeAuthService, createFakeProfile, createFakeSupabaseService } from '../testing/fakes';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;

  async function createComponent(items: { quantity_remaining: number; low_quantity_threshold: number | null }[] = []) {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: items, error: null }) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it('counts items that are low or out of stock', async () => {
    await createComponent([
      { quantity_remaining: 2, low_quantity_threshold: 5 }, // low
      { quantity_remaining: 0, low_quantity_threshold: null }, // out of stock, no threshold set
      { quantity_remaining: 20, low_quantity_threshold: 5 } // sufficient
    ]);

    expect(component.restockCount).toBe(2);
  });

  it('shows zero when nothing needs restocking', async () => {
    await createComponent([{ quantity_remaining: 20, low_quantity_threshold: 5 }]);

    expect(component.restockCount).toBe(0);
  });
});

/** Table-aware — unlike the shared createFakeSupabaseService() above (one
 *  canned result reused for every table), the getting-started card needs to
 *  tell inventory_items/tasks/profiles counts apart from each other in the
 *  same test. Also stands in for whatever loadPersonalStats() queries in
 *  the same ngOnInit() (it isn't role-gated, so it always fires alongside
 *  loadGettingStarted() here) — `in`/`gte` are included so that query
 *  chain resolves cleanly rather than throwing on a missing method. */
function createFakeSupabaseServiceForHome(counts: { items: number; tasks: number; teammates: number }): SupabaseService {
  function builderFor(count: number) {
    const builder: Record<string, unknown> = {
      then: (resolve: (value: { data: never[]; count: number; error: null }) => void) =>
        resolve({ data: [], count, error: null }),
    };
    for (const method of ['select', 'eq', 'neq', 'in', 'gte', 'order']) {
      builder[method] = () => builder;
    }
    return builder;
  }

  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'tasks') {
          return builderFor(counts.tasks);
        }
        if (table === 'profiles') {
          return builderFor(counts.teammates);
        }
        return builderFor(counts.items);
      }
    }
  };
  return fake as unknown as SupabaseService;
}

interface PersonalStatsFakeData {
  tasks?: { id: string; title: string; due_date: string | null }[];
  checkedOutItems?: { id: string; name: string }[];
  reservations?: { id: string; item_id: string; start_date: string; end_date: string; quantity: number; reserved_for: string }[];
  /** What the reservation item-name lookup's own `.in('id', itemIds)` call
   *  comes back with — see loadPersonalStats()'s own two-step
   *  reservation-name-resolution comment. */
  itemNames?: { id: string; name: string }[];
}

/** Table-aware in the same style as createFakeSupabaseServiceForHome above,
 *  but scoped to loadPersonalStats()'s own three tables/query shapes —
 *  tested against a 'staff' profile so loadGettingStarted() never fires its
 *  own inventory_items/tasks/profiles queries and collides with these.
 *  `inventory_items` is queried up to three times per load, in a fixed
 *  order: ngOnInit()'s own restock-count query lands first (its own
 *  Promise.all element is built synchronously before loadPersonalStats()'s
 *  first `await` even suspends), then loadPersonalStats()'s own
 *  checked-out-items query, then — only once there's at least one
 *  reservation — the reservation item-name lookup. A call counter tells
 *  the three apart rather than every `inventory_items` query sharing one
 *  canned result. */
function createFakeSupabaseServiceForPersonalStats(data: PersonalStatsFakeData): SupabaseService {
  function builderFor(rows: unknown[]) {
    const builder: Record<string, unknown> = {
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => resolve({ data: rows, error: null }),
    };
    for (const method of ['select', 'eq', 'neq', 'in', 'gte', 'order']) {
      builder[method] = () => builder;
    }
    return builder;
  }

  let inventoryItemsCallCount = 0;

  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'tasks') {
          return builderFor(data.tasks ?? []);
        }
        if (table === 'inventory_item_reservations') {
          return builderFor(data.reservations ?? []);
        }
        inventoryItemsCallCount++;
        if (inventoryItemsCallCount === 1) {
          return builderFor([]); // ngOnInit()'s own restock query — not under test here
        }
        return builderFor(inventoryItemsCallCount === 2 ? (data.checkedOutItems ?? []) : (data.itemNames ?? []));
      }
    }
  };
  return fake as unknown as SupabaseService;
}

describe('HomeComponent personal lists', () => {
  async function createComponent(data: PersonalStatsFakeData) {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'staff' })) },
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForPersonalStats(data) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('lists outstanding tasks, checked-out items, and upcoming reservations with their own detail for the signed-in user', async () => {
    const fixture = await createComponent({
      tasks: [{ id: 'task-1', title: 'Set up chairs', due_date: '2026-09-01' }],
      checkedOutItems: [{ id: 'item-1', name: 'Folding chair' }],
      reservations: [
        { id: 'res-1', item_id: 'item-2', start_date: '2026-09-05', end_date: '2026-09-07', quantity: 50, reserved_for: 'Smith wedding' }
      ],
      itemNames: [{ id: 'item-2', name: 'Banquet chair' }]
    });
    const { componentInstance: component } = fixture;

    expect(component.outstandingTasks).toEqual([{ id: 'task-1', title: 'Set up chairs', dueDate: '2026-09-01' }]);
    expect(component.checkedOutItems).toEqual([{ id: 'item-1', name: 'Folding chair' }]);
    expect(component.upcomingReservations).toEqual([{
      id: 'res-1',
      itemId: 'item-2',
      itemName: 'Banquet chair',
      startDate: '2026-09-05',
      endDate: '2026-09-07',
      quantity: 50,
      reservedFor: 'Smith wedding'
    }]);
  });

  it('caps each visible list at 4 entries and reports how many more exist', async () => {
    const tasks = Array.from({ length: 6 }, (_, i) => ({ id: `task-${i}`, title: `Task ${i}`, due_date: null }));
    const fixture = await createComponent({ tasks });
    const { componentInstance: component } = fixture;

    expect(component.outstandingTasks.length).toBe(6);
    expect(component.visibleOutstandingTasks.length).toBe(4);
    expect(component.outstandingTasksOverflowCount).toBe(2);
  });

  it('falls back to "Unknown item" for a reservation whose item-name lookup comes back empty', async () => {
    const fixture = await createComponent({
      reservations: [
        { id: 'res-1', item_id: 'item-missing', start_date: '2026-09-05', end_date: '2026-09-07', quantity: 3, reserved_for: 'Someone' }
      ],
      itemNames: []
    });

    expect(fixture.componentInstance.upcomingReservations[0].itemName).toBe('Unknown item');
  });

  it('shows empty lists for a user with nothing outstanding', async () => {
    const fixture = await createComponent({});
    const { componentInstance: component } = fixture;

    expect(component.outstandingTasks).toEqual([]);
    expect(component.checkedOutItems).toEqual([]);
    expect(component.upcomingReservations).toEqual([]);
  });

  it('tasksDueTodayCount counts only tasks due exactly today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const fixture = await createComponent({
      tasks: [
        { id: 't1', title: 'Due today', due_date: today },
        { id: 't2', title: 'Due later', due_date: '2099-01-01' },
        { id: 't3', title: 'No due date', due_date: null }
      ]
    });

    expect(fixture.componentInstance.tasksDueTodayCount).toBe(1);
  });

  it('reservationsStartingSoonCount counts reservations starting within the next 7 days', async () => {
    const today = new Date();
    const iso = (daysOffset: number) => {
      const d = new Date(today.getTime() + daysOffset * 86400000);
      return d.toISOString().slice(0, 10);
    };
    const fixture = await createComponent({
      reservations: [
        { id: 'r1', item_id: 'item-1', start_date: iso(2), end_date: iso(10), quantity: 5, reserved_for: 'Soon' },
        { id: 'r2', item_id: 'item-2', start_date: iso(30), end_date: iso(31), quantity: 2, reserved_for: 'Later' }
      ],
      itemNames: [{ id: 'item-1', name: 'A' }, { id: 'item-2', name: 'B' }]
    });

    expect(fixture.componentInstance.reservationsStartingSoonCount).toBe(1);
  });

  it('taskRowSeverity ranks overdue above due-today above everything else', async () => {
    const fixture = await createComponent({});
    const { componentInstance: component } = fixture;
    const today = new Date().toISOString().slice(0, 10);

    expect(component.taskRowSeverity({ id: '1', title: '', dueDate: '2000-01-01' })).toBe('danger');
    expect(component.taskRowSeverity({ id: '2', title: '', dueDate: today })).toBe('warn');
    expect(component.taskRowSeverity({ id: '3', title: '', dueDate: '2099-01-01' })).toBe('ok');
    expect(component.taskRowSeverity({ id: '4', title: '', dueDate: null })).toBe('ok');
  });

  it('heroSubtitle reflects a real count of what needs attention today, not fixed text', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const fixture = await createComponent({
      tasks: [{ id: 't1', title: 'Due today', due_date: today }]
    });

    expect(fixture.componentInstance.heroSubtitle).toContain('1 thing needs');
  });

  it('heroSubtitle reports nothing urgent when every count is zero', async () => {
    const fixture = await createComponent({});
    expect(fixture.componentInstance.heroSubtitle).toContain('Nothing urgent');
  });

  it('skips personal lists entirely for a signed-out session', async () => {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        {
          provide: SupabaseService,
          useValue: createFakeSupabaseServiceForPersonalStats({
            tasks: [{ id: 'task-1', title: 'Should not load', due_date: null }]
          })
        }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.outstandingTasks).toEqual([]);
    expect(fixture.componentInstance.checkedOutItems).toEqual([]);
    expect(fixture.componentInstance.upcomingReservations).toEqual([]);
  });
});

describe('HomeComponent getting-started card', () => {
  async function createComponent(
    role: 'admin' | 'manager' | 'staff',
    counts: { items: number; tasks: number; teammates: number }
  ): Promise<ComponentFixture<HomeComponent>> {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role })) },
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForHome(counts) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      // Same "best effort" reasoning HomeComponent's own storage access has.
    }
  });

  it('is never loaded for a plain staff member, who can\'t act on any of its steps', async () => {
    const fixture = await createComponent('staff', { items: 0, tasks: 0, teammates: 0 });

    expect(fixture.componentInstance.gettingStartedReady).toBeTrue();
    expect(fixture.componentInstance.gettingStartedSteps).toEqual([]);
    expect(fixture.componentInstance.showGettingStarted).toBeFalse();
  });

  it('shows every step as not done for a brand-new admin\'s org', async () => {
    const fixture = await createComponent('admin', { items: 0, tasks: 0, teammates: 0 });
    const { componentInstance: component } = fixture;

    expect(component.showGettingStarted).toBeTrue();
    expect(component.gettingStartedCompleteCount).toBe(0);
    expect(component.gettingStartedSteps.every(step => !step.done)).toBeTrue();
    expect(component.gettingStartedProgressPercent).toBe(0);
  });

  it('marks each step done once its own count is nonzero, for a manager too', async () => {
    const fixture = await createComponent('manager', { items: 3, tasks: 1, teammates: 2 });
    const { componentInstance: component } = fixture;

    expect(component.gettingStartedCompleteCount).toBe(3);
    expect(component.gettingStartedSteps.every(step => step.done)).toBeTrue();
    expect(component.gettingStartedProgressPercent).toBe(100);
  });

  it('gettingStartedProgressPercent reflects a partially-complete org', async () => {
    const fixture = await createComponent('admin', { items: 1, tasks: 0, teammates: 0 });
    const { componentInstance: component } = fixture;

    expect(component.gettingStartedCompleteCount).toBe(1);
    expect(component.gettingStartedProgressPercent).toBeCloseTo(33.33, 1);
  });

  it('hides the card once every step is done, even without an explicit dismissal', async () => {
    const fixture = await createComponent('admin', { items: 1, tasks: 1, teammates: 1 });

    expect(fixture.componentInstance.showGettingStarted).toBeFalse();
  });

  it('dismissGettingStarted() hides the card and persists across a fresh load', async () => {
    const fixture = await createComponent('admin', { items: 0, tasks: 0, teammates: 0 });
    expect(fixture.componentInstance.showGettingStarted).toBeTrue();

    fixture.componentInstance.dismissGettingStarted();
    expect(fixture.componentInstance.showGettingStarted).toBeFalse();

    const secondVisit = await createComponent('admin', { items: 0, tasks: 0, teammates: 0 });
    expect(secondVisit.componentInstance.showGettingStarted).toBeFalse();
  });
});
