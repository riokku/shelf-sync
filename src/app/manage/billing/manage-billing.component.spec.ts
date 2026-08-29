import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ManageBillingComponent } from './manage-billing.component';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { createFakeAuthService, createFakeProfile, createFakeQueryBuilder, createFakeSupabaseService } from '../../testing/fakes';

describe('ManageBillingComponent', () => {
  let component: ManageBillingComponent;
  let fixture: ComponentFixture<ManageBillingComponent>;

  beforeEach(async () => {
    // ngOnInit loads org/member/item counts and photo storage usage on
    // construction — faked so this hits nothing real, same reasoning as
    // every other spec that does this. The shared fake returns the same
    // canned `data`/`count` for every call regardless of table/RPC, which
    // doesn't fit here (the RPC needs a plain byte count, not the
    // organization row), so the RPC call is overridden separately below.
    const baseFake = createFakeSupabaseService({ data: { created_at: '2026-01-15T00:00:00.000Z' }, count: 3 });
    const fakeSupabaseService = {
      client: {
        ...baseFake.client,
        rpc: () => Promise.resolve({ data: 10 * 1024 * 1024, error: null })
      }
    } as unknown as SupabaseService;

    await TestBed.configureTestingModule({
      imports: [ManageBillingComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        { provide: SupabaseService, useValue: fakeSupabaseService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageBillingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('hardcodes every org onto the Free tier — no subscriptions table exists yet', () => {
    expect(component.currentTier.key).toBe('free');
  });

  describe('usagePercent', () => {
    it('computes a percentage against a real cap', () => {
      expect(component.usagePercent(3, 6)).toBe(50);
    });

    it('clamps to 100 for a real overage', () => {
      expect(component.usagePercent(9, 6)).toBe(100);
    });

    it('returns 0 for an unlimited (null) cap rather than dividing by it', () => {
      expect(component.usagePercent(9, null)).toBe(0);
    });
  });

  describe('usageLabel', () => {
    it('reads "X of Y" against a real cap', () => {
      expect(component.usageLabel(3, 10)).toBe('3 of 10');
    });

    it('reads "X · Unlimited" against a null cap', () => {
      expect(component.usageLabel(3, null)).toBe('3 · Unlimited');
    });
  });

  describe('storageUsageLabel', () => {
    it('folds the MB unit into each number rather than appending it once', () => {
      expect(component.storageUsedMb).toBe(10);
      expect(component.storageUsageLabel()).toBe('10MB of 500MB');
    });
  });
});

/** Fails the team-member count query the first time it's called, then
 *  succeeds on the next call — same "one fake covers both the failure and a
 *  subsequent successful retry" shape HomeComponent's own
 *  createFakeSupabaseServiceFailingTasksOnce() uses. */
function createFakeSupabaseServiceFailingProfilesOnce(): SupabaseService {
  let profilesCallCount = 0;
  return {
    client: {
      from: (table: string) => {
        if (table === 'organizations') {
          return createFakeQueryBuilder({ data: { created_at: '2026-01-15T00:00:00.000Z' }, error: null });
        }
        if (table === 'profiles') {
          profilesCallCount++;
          return profilesCallCount === 1
            ? createFakeQueryBuilder({ data: null, count: undefined, error: { message: 'network error' } })
            : createFakeQueryBuilder({ data: [], count: 5, error: null });
        }
        return createFakeQueryBuilder({ data: [], count: 3, error: null });
      },
      rpc: () => Promise.resolve({ data: 10 * 1024 * 1024, error: null })
    }
  } as unknown as SupabaseService;
}

describe('ManageBillingComponent load errors', () => {
  async function createComponent() {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [ManageBillingComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        { provide: SupabaseService, useValue: createFakeSupabaseServiceFailingProfilesOnce() }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageBillingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('sets loadError on a failed query rather than showing all-zero usage stats', async () => {
    const fixture = await createComponent();

    expect(fixture.componentInstance.loadError).toBe('network error');
    expect(fixture.componentInstance.isLoading).toBeFalse();
    expect(fixture.componentInstance.teamMemberCount).toBe(0);
  });

  it('clears loadError and loads real usage stats once retryLoad() succeeds', async () => {
    const fixture = await createComponent();
    const { componentInstance: component } = fixture;
    expect(component.loadError).toBe('network error');

    component.retryLoad();
    // A real macrotask boundary rather than fixture.whenStable() — see
    // ManageReportsComponent's own retryLoad() spec for why a couple of bare
    // ticks doesn't reliably flush a Promise.all this many microtasks deep.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(component.loadError).toBeNull();
    expect(component.teamMemberCount).toBe(5);
  });
});
