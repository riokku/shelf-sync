import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { PricingComponent } from './pricing.component';
import { AuthService } from '../core/auth.service';
import { BillingService } from '../core/billing.service';
import { NotificationService } from '../core/notification.service';
import { PRICING_TIERS, pricingTierByKey } from '../shared/models/pricing-tier';
import { OrgSubscription } from '../shared/models/subscription.model';
import { createFakeAuthService, createFakeBillingService, createFakeProfile } from '../testing/fakes';

const FREE_TIER = pricingTierByKey('free');
const BASIC_TIER = pricingTierByKey('basic');
const PRO_TIER = pricingTierByKey('pro');

describe('PricingComponent', () => {
  let component: PricingComponent;
  let fixture: ComponentFixture<PricingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PricingComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: BillingService, useValue: createFakeBillingService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PricingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders all three tiers, with Basic highlighted as most popular', () => {
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('.tier-card');
    expect(cards.length).toBe(3);

    const highlighted = (fixture.nativeElement as HTMLElement).querySelectorAll('.tier-highlighted');
    expect(highlighted.length).toBe(1);
    expect(highlighted[0].textContent).toContain('Basic');
  });

  // Scoped to .pricing-nav-actions specifically — the hero/tier CTAs
  // further down the page always route signed-out visitors to /register
  // regardless of session, same reasoning LandingComponent's own nav-scoped
  // assertion gives for itself.
  function navText(): string {
    return (fixture.nativeElement as HTMLElement).querySelector('.pricing-nav-actions')?.textContent ?? '';
  }

  it('shows the signed-out nav (Log in/Get started free) when there is no session', () => {
    const nav = navText();
    expect(nav).toContain('Log in');
    expect(nav).toContain('Get started free');
    expect(nav).not.toContain('Dashboard');
  });
});

describe('PricingComponent CTA behavior', () => {
  async function createComponent(
    profile: ReturnType<typeof createFakeProfile> | null,
    subscription: OrgSubscription | null = null
  ): Promise<ComponentFixture<PricingComponent>> {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [PricingComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(profile) },
        { provide: BillingService, useValue: createFakeBillingService(subscription) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(PricingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('signed out: every tier still routes to /register, regardless of tier', async () => {
    const fixture = await createComponent(null);
    const { componentInstance: component } = fixture;

    for (const tier of PRICING_TIERS) {
      expect(component.ctaFor(tier).kind).toBe('register');
    }
  });

  it('ngOnInit still loads billing even if the isAuthenticated() signal is still stale (the race a hard refresh on this unguarded route can hit)', async () => {
    const authService = createFakeAuthService(createFakeProfile({ role: 'admin' }));
    // Simulates AuthService.session not having caught up yet, even though
    // getSession() itself already resolves with a real session — see
    // PricingComponent.ngOnInit()'s own doc comment for why it has to await
    // getSession() directly rather than trust this signal.
    spyOn(authService, 'isAuthenticated').and.returnValue(false);
    const billingService = createFakeBillingService({ tier: 'pro', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false });
    const loadSpy = spyOn(billingService, 'load').and.callThrough();

    await TestBed.resetTestingModule().configureTestingModule({
      imports: [PricingComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: BillingService, useValue: billingService }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(PricingComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(loadSpy).toHaveBeenCalled();
  });

  it('signed-in admin on Free: Free shows Current plan, Basic/Pro show a real checkout CTA', async () => {
    const fixture = await createComponent(createFakeProfile({ role: 'admin' }), null);
    const { componentInstance: component } = fixture;

    expect(component.ctaFor(FREE_TIER).kind).toBe('current');
    expect(component.ctaFor(BASIC_TIER).kind).toBe('checkout');
    expect(component.ctaFor(PRO_TIER).kind).toBe('checkout');
  });

  it('signed-in admin on Basic: Basic shows Current plan, Free routes to manage billing, Pro shows checkout', async () => {
    const fixture = await createComponent(
      createFakeProfile({ role: 'admin' }),
      { tier: 'basic', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false }
    );
    const { componentInstance: component } = fixture;

    expect(component.ctaFor(FREE_TIER).kind).toBe('manage-billing');
    expect(component.ctaFor(BASIC_TIER).kind).toBe('current');
    expect(component.ctaFor(PRO_TIER).kind).toBe('checkout');
  });

  it('signed-in non-admin: ctaFor() still resolves "contact-admin", but no card renders a CTA at all', async () => {
    const fixture = await createComponent(createFakeProfile({ role: 'staff' }), null);
    const { componentInstance: component } = fixture;

    expect(component.ctaFor(FREE_TIER).kind).toBe('current'); // nothing to do either way
    expect(component.ctaFor(BASIC_TIER).kind).toBe('contact-admin');
    expect(component.ctaFor(PRO_TIER).kind).toBe('contact-admin');
    // A signed-in viewer never gets a selectable CTA at all anymore, admin
    // or not — manage/billing is the one place plan changes happen now.
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.tier-cta').length).toBe(0);
  });

  it('shows the signed-in nav (Dashboard/Logout) once a session exists', async () => {
    const fixture = await createComponent(createFakeProfile({ role: 'admin' }), null);
    const nav = (fixture.nativeElement as HTMLElement).querySelector('.pricing-nav-actions')?.textContent ?? '';

    expect(nav).toContain('Dashboard');
    expect(nav).toContain('Logout');
    expect(nav).not.toContain('Log in');
  });

  it('logout() signs out and navigates back to pricing', async () => {
    const fixture = await createComponent(createFakeProfile({ role: 'admin' }), null);
    const { componentInstance: component } = fixture;
    const signOutSpy = spyOn(TestBed.inject(AuthService), 'signOut').and.returnValue(Promise.resolve());
    const navigateSpy = spyOn(TestBed.inject(Router), 'navigate');

    await component.logout();

    expect(signOutSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/pricing']);
  });

  it('drops the "most popular" ribbon entirely once a subscription is established, even on a card that isn\'t the current plan', async () => {
    // Signed-in admin already on Free — Basic is the "most popular" tier
    // but isn't this org's current plan, so the old per-card rule alone
    // would still show its ribbon here; the new rule hides it on every
    // card the moment the viewer has any established plan at all.
    const fixture = await createComponent(createFakeProfile({ role: 'admin' }), null);
    const nativeElement = fixture.nativeElement as HTMLElement;

    expect(nativeElement.querySelectorAll('.tier-badge').length).toBe(1);
    expect(nativeElement.textContent).not.toContain('Most popular');
    expect(nativeElement.textContent).toContain('Current plan');
  });

  it('the org\'s current-plan card is highlighted, and no card (current or otherwise) shows a select-plan button', async () => {
    const fixture = await createComponent(
      createFakeProfile({ role: 'admin' }),
      { tier: 'basic', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false }
    );
    const nativeElement = fixture.nativeElement as HTMLElement;
    const cards = Array.from(nativeElement.querySelectorAll('.tier-card'));
    const basicCard = cards.find(card => card.textContent?.includes('Basic'));

    expect(basicCard?.classList).toContain('tier-current');
    expect(basicCard?.textContent).toContain('Current plan');
    expect(basicCard?.querySelector('.tier-cta')).toBeNull();
    // A card that's both "most popular" and the current plan shows only the
    // current-plan badge, not both.
    expect(basicCard?.classList).not.toContain('tier-highlighted');

    // Once the org has an established plan, no other card gets a CTA
    // either — manage/billing's own "Upgrade to Pro"/"Manage billing"
    // buttons are the only way to actually change it now.
    expect(nativeElement.querySelectorAll('.tier-cta').length).toBe(0);
  });

  it('chooseTier() calls startCheckout with the tier key and leaves the button pending when it redirects', async () => {
    const fixture = await createComponent(createFakeProfile({ role: 'admin' }), null);
    const { componentInstance: component } = fixture;
    const startCheckoutSpy = spyOn(TestBed.inject(BillingService), 'startCheckout')
      .and.returnValue(Promise.resolve({ error: null, redirected: true }));

    await component.chooseTier(BASIC_TIER);

    expect(startCheckoutSpy).toHaveBeenCalledWith('basic');
    expect(component.isRedirecting).toBe('basic');
  });

  it('chooseTier() clears the pending state and toasts when the plan changes immediately (no redirect)', async () => {
    const fixture = await createComponent(createFakeProfile({ role: 'admin' }), null);
    const { componentInstance: component } = fixture;
    spyOn(TestBed.inject(BillingService), 'startCheckout').and.returnValue(Promise.resolve({ error: null, redirected: false }));
    const notificationSuccessSpy = spyOn((component as unknown as { notification: NotificationService }).notification, 'success');

    await component.chooseTier(BASIC_TIER);

    expect(component.isRedirecting).toBeNull();
    expect(notificationSuccessSpy).toHaveBeenCalledWith("You're now on the Basic plan.");
  });

  it('chooseTier() surfaces an error and clears the pending state on failure', async () => {
    const fixture = await createComponent(createFakeProfile({ role: 'admin' }), null);
    const { componentInstance: component } = fixture;
    spyOn(TestBed.inject(BillingService), 'startCheckout').and.returnValue(Promise.resolve({ error: 'boom', redirected: false }));

    await component.chooseTier(BASIC_TIER);

    expect(component.checkoutError).toBe('boom');
    expect(component.isRedirecting).toBeNull();
  });

  it('chooseTier() is a no-op for a tier whose CTA is not checkout', async () => {
    const fixture = await createComponent(createFakeProfile({ role: 'admin' }), null);
    const { componentInstance: component } = fixture;
    const startCheckoutSpy = spyOn(TestBed.inject(BillingService), 'startCheckout');

    await component.chooseTier(FREE_TIER); // 'current' for an admin on Free

    expect(startCheckoutSpy).not.toHaveBeenCalled();
  });
});
