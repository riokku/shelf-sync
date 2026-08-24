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
 *  same test. */
function createFakeSupabaseServiceForHome(counts: { items: number; tasks: number; teammates: number }): SupabaseService {
  function builderFor(count: number) {
    const builder: Record<string, unknown> = {
      then: (resolve: (value: { data: never[]; count: number; error: null }) => void) =>
        resolve({ data: [], count, error: null }),
    };
    for (const method of ['select', 'eq', 'neq', 'order']) {
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
  });

  it('marks each step done once its own count is nonzero, for a manager too', async () => {
    const fixture = await createComponent('manager', { items: 3, tasks: 1, teammates: 2 });
    const { componentInstance: component } = fixture;

    expect(component.gettingStartedCompleteCount).toBe(3);
    expect(component.gettingStartedSteps.every(step => step.done)).toBeTrue();
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
