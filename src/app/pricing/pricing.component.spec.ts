import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PricingComponent } from './pricing.component';
import { AuthService } from '../core/auth.service';
import { BillingService } from '../core/billing.service';
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

  it('signed-in non-admin: every non-current tier shows Contact your admin', async () => {
    const fixture = await createComponent(createFakeProfile({ role: 'staff' }), null);
    const { componentInstance: component } = fixture;

    expect(component.ctaFor(FREE_TIER).kind).toBe('current'); // nothing to do either way
    expect(component.ctaFor(BASIC_TIER).kind).toBe('contact-admin');
    expect(component.ctaFor(PRO_TIER).kind).toBe('contact-admin');
    expect(fixture.nativeElement.textContent).toContain('Contact your admin');
  });

  it('chooseTier() calls startCheckout with the tier key and leaves the button pending on success', async () => {
    const fixture = await createComponent(createFakeProfile({ role: 'admin' }), null);
    const { componentInstance: component } = fixture;
    const startCheckoutSpy = spyOn(TestBed.inject(BillingService), 'startCheckout').and.returnValue(Promise.resolve(null));

    await component.chooseTier(BASIC_TIER);

    expect(startCheckoutSpy).toHaveBeenCalledWith('basic');
    expect(component.isRedirecting).toBe('basic');
  });

  it('chooseTier() surfaces an error and clears the pending state on failure', async () => {
    const fixture = await createComponent(createFakeProfile({ role: 'admin' }), null);
    const { componentInstance: component } = fixture;
    spyOn(TestBed.inject(BillingService), 'startCheckout').and.returnValue(Promise.resolve('boom'));

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
