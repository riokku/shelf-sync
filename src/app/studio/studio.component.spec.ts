import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StudioComponent } from './studio.component';
import { SupabaseService } from '../core/supabase.service';
import { createFakeSupabaseService } from '../testing/fakes';

describe('StudioComponent', () => {
  let component: StudioComponent;
  let fixture: ComponentFixture<StudioComponent>;

  async function createComponent(count: number) {
    await TestBed.configureTestingModule({
      imports: [StudioComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], count, error: null }) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await createComponent(0);
    expect(component).toBeTruthy();
  });

  it('badges the Feedback card with the count of not-yet-reviewed feedback', async () => {
    await createComponent(4);
    expect(component.newFeedbackCount).toBe(4);
  });

  it('shows zero when nothing new is waiting', async () => {
    await createComponent(0);
    expect(component.newFeedbackCount).toBe(0);
  });
});

/** Table-aware — unlike the shared createFakeSupabaseService() above (one
 *  canned count reused everywhere), the dashboard stats need
 *  organizations/profiles/client_error_log told apart from feedback and
 *  from each other. */
function createFakeSupabaseServiceForStats(counts: {
  feedback: number;
  organizations: number;
  errorRows: { app_env: string | null }[];
  orgCreatedAtRows?: { created_at: string }[];
  profileCreatedAtRows?: { created_at: string }[];
}): SupabaseService {
  function builderFor(count: number, data: unknown[] = []) {
    const builder: Record<string, unknown> = {
      then: (resolve: (value: { data: unknown[]; count: number; error: null }) => void) =>
        resolve({ data, count, error: null }),
    };
    for (const method of ['select', 'eq', 'neq', 'is', 'gte', 'order']) {
      builder[method] = () => builder;
    }
    return builder;
  }

  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'feedback') {
          return builderFor(counts.feedback);
        }
        if (table === 'organizations') {
          // totalOrgCount (deleted_at is null), newOrgCount (created_at
          // within the last week), and orgSignupTrend's own
          // created_at-only query all hit this same table — the fake
          // doesn't tell them apart by their own .select()/.eq() args, they
          // share one canned count/data pair, same "not testing the exact
          // filter, just that both wire up" scope every other count-only
          // stat in this app's specs uses.
          return builderFor(counts.organizations, counts.orgCreatedAtRows ?? []);
        }
        if (table === 'profiles') {
          // Only ever hit for userSignupTrend's own created_at-only query
          // now — StudioComponent no longer queries an approved-member
          // count, so the count half of this pair goes unread.
          return builderFor(0, counts.profileCreatedAtRows ?? []);
        }
        if (table === 'client_error_log') {
          return builderFor(counts.errorRows.length, counts.errorRows);
        }
        return builderFor(0);
      }
    }
  };
  return fake as unknown as SupabaseService;
}

describe('StudioComponent dashboard stats', () => {
  async function createComponent(counts: {
    feedback: number;
    organizations: number;
    errorRows: { app_env: string | null }[];
    orgCreatedAtRows?: { created_at: string }[];
    profileCreatedAtRows?: { created_at: string }[];
  }) {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [StudioComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForStats(counts) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(StudioComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('loads the headline organization/feedback counts', async () => {
    const component = await createComponent({
      feedback: 3,
      organizations: 12,
      errorRows: []
    });

    expect(component.totalOrgCount).toBe(12);
    expect(component.newOrgCount).toBe(12);
    expect(component.newFeedbackCount).toBe(3);
    expect(component.isLoadingStats).toBeFalse();
  });

  it('counts only non-development errors in the last 24 hours', async () => {
    const component = await createComponent({
      feedback: 0,
      organizations: 0,
      errorRows: [
        { app_env: 'production' },
        { app_env: 'development' },
        { app_env: null } // treated as "not development", same as StudioErrorLogComponent's own check
      ]
    });

    expect(component.recentErrorCount).toBe(2);
  });

  it('buckets organization/profile created_at rows into a 12-week signup trend', async () => {
    const now = new Date().toISOString();
    const component = await createComponent({
      feedback: 0,
      organizations: 0,
      errorRows: [],
      orgCreatedAtRows: [{ created_at: now }, { created_at: now }],
      profileCreatedAtRows: [{ created_at: now }]
    });

    expect(component.orgSignupTrend.length).toBe(12);
    expect(component.orgSignupTrendTotal).toBe(2);
    expect(component.userSignupTrend.length).toBe(12);
    expect(component.userSignupTrendTotal).toBe(1);
  });
});

/** Fails the organizations count query the first time it's called, then
 *  succeeds on the next call — same "one fake covers both the failure and a
 *  subsequent successful retry" shape HomeComponent's own
 *  createFakeSupabaseServiceFailingTasksOnce() uses. loadPendingBadge()'s
 *  own 'feedback' query is untouched by this — see StudioComponent's own
 *  loadError doc comment for why that's deliberately out of scope. */
function createFakeSupabaseServiceFailingOrgsOnce(): SupabaseService {
  function builder(result: { data: unknown[]; count?: number; error: { message: string } | null }) {
    const b: Record<string, unknown> = {
      then: (resolve: (value: typeof result) => void) => resolve(result),
    };
    for (const method of ['select', 'eq', 'neq', 'is', 'gte', 'order']) {
      b[method] = () => b;
    }
    return b;
  }

  let orgsCallCount = 0;

  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'organizations') {
          orgsCallCount++;
          return orgsCallCount === 1
            ? builder({ data: [], error: { message: 'network error' } })
            : builder({ data: [], count: 12, error: null });
        }
        return builder({ data: [], count: 0, error: null });
      }
    }
  };
  return fake as unknown as SupabaseService;
}

describe('StudioComponent dashboard stats load errors', () => {
  async function createComponent() {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [StudioComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseServiceFailingOrgsOnce() }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(StudioComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('sets loadError on a failed query rather than showing all-zero platform stats', async () => {
    const fixture = await createComponent();

    expect(fixture.componentInstance.loadError).toBe('network error');
    expect(fixture.componentInstance.isLoadingStats).toBeFalse();
    expect(fixture.componentInstance.totalOrgCount).toBe(0);
  });

  it('clears loadError and loads real stats once retryLoad() succeeds', async () => {
    const fixture = await createComponent();
    const { componentInstance: component } = fixture;
    expect(component.loadError).toBe('network error');

    component.retryLoad();
    // A real macrotask boundary rather than fixture.whenStable() — see
    // ManageReportsComponent's own retryLoad() spec for why a couple of bare
    // ticks doesn't reliably flush a Promise.all this many microtasks deep.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(component.loadError).toBeNull();
    expect(component.totalOrgCount).toBe(12);
  });
});
