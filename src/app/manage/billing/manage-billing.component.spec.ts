import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ManageBillingComponent } from './manage-billing.component';
import { AuthService } from '../../core/auth.service';
import { BillingService } from '../../core/billing.service';
import { NotificationService } from '../../core/notification.service';
import { SupabaseService } from '../../core/supabase.service';
import {
  createFakeAuthService,
  createFakeBillingService,
  createFakeProfile,
  createFakeQueryBuilder,
  createFakeSupabaseService
} from '../../testing/fakes';

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
        { provide: SupabaseService, useValue: fakeSupabaseService },
        { provide: BillingService, useValue: createFakeBillingService() }
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

  it('reflects the implicit Free tier when no subscriptions row exists', () => {
    expect(TestBed.inject(BillingService).currentTier().key).toBe('free');
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
        { provide: SupabaseService, useValue: createFakeSupabaseServiceFailingProfilesOnce() },
        { provide: BillingService, useValue: createFakeBillingService() }
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

describe('ManageBillingComponent Stripe actions', () => {
  async function createComponent(billingService: BillingService) {
    const baseFake = createFakeSupabaseService({ data: { created_at: '2026-01-15T00:00:00.000Z' }, count: 3 });
    const fakeSupabaseService = {
      client: {
        ...baseFake.client,
        rpc: () => Promise.resolve({ data: 0, error: null })
      }
    } as unknown as SupabaseService;

    await TestBed.resetTestingModule().configureTestingModule({
      imports: [ManageBillingComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        { provide: SupabaseService, useValue: fakeSupabaseService },
        { provide: BillingService, useValue: billingService }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageBillingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows Upgrade buttons and no Manage billing button while on Free', async () => {
    const fixture = await createComponent(createFakeBillingService(null));

    expect(fixture.nativeElement.textContent).toContain('Upgrade to Basic');
    expect(fixture.nativeElement.textContent).toContain('Upgrade to Pro');
    expect(fixture.nativeElement.textContent).not.toContain('Manage billing');
  });

  it('shows both Manage billing and Upgrade to Pro while on Basic — upgrading further is still an option', async () => {
    const fixture = await createComponent(
      createFakeBillingService({ tier: 'basic', status: 'active', currentPeriodEnd: '2026-11-01T00:00:00.000Z', cancelAtPeriodEnd: false })
    );

    expect(fixture.nativeElement.textContent).toContain('Manage billing');
    expect(fixture.nativeElement.textContent).toContain('Upgrade to Pro');
    expect(fixture.nativeElement.textContent).not.toContain('Upgrade to Basic');
  });

  it('shows only Manage billing once on Pro — nothing left to upgrade to', async () => {
    const fixture = await createComponent(
      createFakeBillingService({ tier: 'pro', status: 'active', currentPeriodEnd: '2026-11-01T00:00:00.000Z', cancelAtPeriodEnd: false })
    );

    expect(fixture.nativeElement.textContent).toContain('Manage billing');
    expect(fixture.nativeElement.textContent).not.toContain('Upgrade to Basic');
    expect(fixture.nativeElement.textContent).not.toContain('Upgrade to Pro');
  });

  it('shows a payment-failed banner when the subscription is past_due', async () => {
    const fixture = await createComponent(
      createFakeBillingService({ tier: 'basic', status: 'past_due', currentPeriodEnd: '2026-11-01T00:00:00.000Z', cancelAtPeriodEnd: false })
    );

    expect(fixture.nativeElement.textContent).toContain('Your last payment failed');
  });

  it('shows a cancellation note when cancelAtPeriodEnd is set', async () => {
    const fixture = await createComponent(
      createFakeBillingService({ tier: 'pro', status: 'active', currentPeriodEnd: '2026-11-01T00:00:00.000Z', cancelAtPeriodEnd: true })
    );

    expect(fixture.nativeElement.textContent).toContain('will move to Free');
  });

  it('upgrade() calls startCheckout with the chosen tier and leaves the button pending when it redirects', async () => {
    const billingService = createFakeBillingService(null);
    const startCheckoutSpy = spyOn(billingService, 'startCheckout')
      .and.returnValue(Promise.resolve({ error: null, redirected: true }));
    const fixture = await createComponent(billingService);

    await fixture.componentInstance.upgrade('pro');

    expect(startCheckoutSpy).toHaveBeenCalledWith('pro');
    expect(fixture.componentInstance.isRedirectingToBilling).toBe('pro');
    expect(fixture.componentInstance.billingActionError).toBeNull();
  });

  it('upgrade() clears the pending state and toasts when the plan changes immediately (no redirect)', async () => {
    const billingService = createFakeBillingService(null);
    spyOn(billingService, 'startCheckout').and.returnValue(Promise.resolve({ error: null, redirected: false }));
    const fixture = await createComponent(billingService);
    const notificationSuccessSpy = spyOn((fixture.componentInstance as unknown as { notification: NotificationService }).notification, 'success');

    await fixture.componentInstance.upgrade('pro');

    expect(fixture.componentInstance.isRedirectingToBilling).toBeNull();
    expect(notificationSuccessSpy).toHaveBeenCalledWith("You're now on the Pro plan.");
  });

  it('upgrade() surfaces an error and clears the pending state on failure', async () => {
    const billingService = createFakeBillingService(null);
    spyOn(billingService, 'startCheckout').and.returnValue(Promise.resolve({ error: 'boom', redirected: false }));
    const fixture = await createComponent(billingService);

    await fixture.componentInstance.upgrade('basic');

    expect(fixture.componentInstance.billingActionError).toBe('boom');
    expect(fixture.componentInstance.isRedirectingToBilling).toBeNull();
  });

  it('upgrade() is a no-op while another billing action is already pending', async () => {
    const billingService = createFakeBillingService(null);
    const startCheckoutSpy = spyOn(billingService, 'startCheckout')
      .and.returnValue(Promise.resolve({ error: null, redirected: true }));
    const fixture = await createComponent(billingService);
    fixture.componentInstance.isRedirectingToBilling = 'portal';

    await fixture.componentInstance.upgrade('basic');

    expect(startCheckoutSpy).not.toHaveBeenCalled();
  });

  it('manageBilling() calls openBillingPortal and leaves the button pending on success', async () => {
    const billingService = createFakeBillingService({ tier: 'basic', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false });
    const openPortalSpy = spyOn(billingService, 'openBillingPortal').and.returnValue(Promise.resolve(null));
    const fixture = await createComponent(billingService);

    await fixture.componentInstance.manageBilling();

    expect(openPortalSpy).toHaveBeenCalled();
    expect(fixture.componentInstance.isRedirectingToBilling).toBe('portal');
  });

  it('manageBilling() surfaces an error and clears the pending state on failure', async () => {
    const billingService = createFakeBillingService({ tier: 'basic', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false });
    spyOn(billingService, 'openBillingPortal').and.returnValue(Promise.resolve('No billing account yet.'));
    const fixture = await createComponent(billingService);

    await fixture.componentInstance.manageBilling();

    expect(fixture.componentInstance.billingActionError).toBe('No billing account yet.');
    expect(fixture.componentInstance.isRedirectingToBilling).toBeNull();
  });
});
