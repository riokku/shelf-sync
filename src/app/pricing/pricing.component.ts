import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../core/auth.service';
import { BillingService } from '../core/billing.service';
import { FooterComponent } from '../footer/footer.component';
import { PRICING_TIERS, PricingTier } from '../shared/models/pricing-tier';

/** What a tier's own call-to-action should actually do, resolved per
 *  viewer/tier by ctaFor() below rather than templated inline logic:
 *  - 'register': signed out — every tier routes to /register unchanged,
 *    same as before Stripe existed (checkout-during-signup is out of
 *    scope; an anonymous visitor needs an org to attach a subscription to
 *    before Stripe enters the picture at all).
 *  - 'current': this is the viewer's org's current tier — nothing to do.
 *  - 'checkout': signed-in admin, a non-current Basic/Pro card — a real
 *    Stripe Checkout redirect via chooseTier().
 *  - 'manage-billing': signed-in admin viewing the Free card while on a
 *    paid tier — "downgrading" to Free is a cancellation, handled by the
 *    Customer Portal (manage/billing's own "Manage billing" button), never
 *    a Stripe Checkout call.
 *  - 'contact-admin': signed-in but not an admin — mirrors adminGuard's own
 *    "billing is admin-only" boundary (manage/billing uses adminGuard, not
 *    the broader admin-or-manager canManage()). */
type PricingCta =
  | { kind: 'register' }
  | { kind: 'current' }
  | { kind: 'checkout' }
  | { kind: 'manage-billing' }
  | { kind: 'contact-admin' };

/** Public marketing page at `/pricing` — not gated by any guard; hidden
 *  from the app shell's header/footer chrome (see AppComponent.showChrome())
 *  so it can lay out its own nav and footer, same treatment as
 *  LandingComponent.
 *
 *  Real Stripe checkout for a signed-in org admin now lives here too, via
 *  BillingService — see ctaFor()'s own doc comment for the full per-tier/
 *  per-viewer CTA behavior. The three tiers (shared/models/pricing-tier.ts,
 *  also read by ManageBillingComponent) are a first pass at what
 *  *should* differentiate them once real usage-cap enforcement exists (out
 *  of scope for this pass), chosen deliberately around what actually drives
 *  hosting cost for this app (Supabase): item photos are by far the biggest
 *  lever (storage *and* the repeated bandwidth/egress cost of browsing
 *  them), team size is a moderate, predictable lever (Auth bills by monthly
 *  active users), and inventory/task row counts are minor unless an org
 *  reaches tens of thousands of items. Core inventory/task functionality is
 *  deliberately available on every tier rather than paywalled —
 *  differentiation is about *scale* (item/team/storage caps) and *admin
 *  polish* (branding, export, oversight tools), not gating the product's
 *  basic value proposition this early on. */
@Component({
  selector: 'app-pricing',
  imports: [RouterModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, FooterComponent],
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.scss'
})
export class PricingComponent implements OnInit {
  protected readonly tiers = PRICING_TIERS;

  protected authService = inject(AuthService);
  protected billingService = inject(BillingService);

  /** Which tier's checkout is currently redirecting the browser, if any —
   *  disables every checkout button while set, same
   *  leave-it-set-on-success shape ManageBillingComponent's own
   *  isRedirectingToBilling already establishes. */
  isRedirecting: 'basic' | 'pro' | null = null;
  checkoutError: string | null = null;

  async ngOnInit() {
    if (this.authService.isAuthenticated()) {
      await this.billingService.load();
    }
  }

  ctaFor(tier: PricingTier): PricingCta {
    if (!this.authService.isAuthenticated()) {
      return { kind: 'register' };
    }
    if (this.billingService.currentTier().key === tier.key) {
      return { kind: 'current' };
    }
    if (this.authService.role() !== 'admin') {
      return { kind: 'contact-admin' };
    }
    return tier.key === 'free' ? { kind: 'manage-billing' } : { kind: 'checkout' };
  }

  async chooseTier(tier: PricingTier) {
    if (this.ctaFor(tier).kind !== 'checkout' || this.isRedirecting) {
      return;
    }
    // ctaFor() only ever returns 'checkout' for 'basic'/'pro' (see its own
    // doc comment) — this cast just reflects that narrowing to the type
    // startCheckout() actually accepts.
    const checkoutTier = tier.key as 'basic' | 'pro';
    this.isRedirecting = checkoutTier;
    this.checkoutError = null;

    const error = await this.billingService.startCheckout(checkoutTier);
    if (error) {
      this.checkoutError = error;
      this.isRedirecting = null;
    }
  }
}
