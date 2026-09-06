import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../core/auth.service';
import { BillingService } from '../core/billing.service';
import { NotificationService } from '../core/notification.service';
import { FooterComponent } from '../footer/footer.component';
import { PRICING_TIERS, PricingTier } from '../shared/models/pricing-tier';

/** What a tier's own card actually means for this viewer, resolved per
 *  viewer/tier by ctaFor() below rather than templated inline logic. Only
 *  'register' still renders an actual button in the template — every other
 *  kind belongs to a viewer who already has an established plan (their own
 *  org's current tier, or any other), and manage/billing is the one place
 *  that ever changes that now (see PricingComponent's own doc comment), so
 *  the rest of the union exists purely to drive the "Current plan"
 *  badge/border and to keep chooseTier()/startCheckout() themselves fully
 *  intact and tested even with no template entry point left to reach them
 *  from — same "kill switch, logic stays working underneath" convention
 *  BARCODE_FEATURE_ENABLED already establishes elsewhere in this app:
 *  - 'register': signed out — every tier routes to /register unchanged,
 *    same as before Stripe existed (checkout-during-signup is out of
 *    scope; an anonymous visitor needs an org to attach a subscription to
 *    before Stripe enters the picture at all).
 *  - 'current': this is the viewer's org's current tier.
 *  - 'checkout': would be a real Stripe Checkout redirect via chooseTier()
 *    for a signed-in admin on a non-current Basic/Pro card, if this page
 *    still offered one — manage/billing's own "Upgrade to Pro/Basic"
 *    button is where that action actually lives now.
 *  - 'manage-billing': a signed-in admin viewing the Free card while on a
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
 *  Its own top nav is session-aware the same way LandingComponent's is —
 *  Pricing/Log in/Sign up for a signed-out visitor, Dashboard/Logout for one
 *  who already has a session — since none of the former make sense once
 *  already signed in.
 *
 *  Once a viewer already has an established plan (any authenticated viewer
 *  — their org defaults to Free the moment it exists, subscribed or not),
 *  every card is pure reference/comparison with no selectable button at
 *  all — manage/billing already owns every real plan change (its own
 *  "Upgrade to Pro/Basic" and "Manage billing" actions), so this page
 *  doesn't need to duplicate that once someone's already a customer; only
 *  their org's own current tier gets a further "Current plan" badge/border
 *  (see ctaFor()'s own doc comment for the full per-tier/per-viewer
 *  breakdown, and BillingService itself for the real Stripe Checkout this
 *  page's own chooseTier() still calls into, kept working underneath even
 *  with no button left here to trigger it). The three tiers
 *  (shared/models/pricing-tier.ts,
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
  imports: [RouterModule, MatButtonModule, MatIconModule, FooterComponent],
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.scss'
})
export class PricingComponent implements OnInit {
  protected readonly tiers = PRICING_TIERS;

  protected authService = inject(AuthService);
  protected billingService = inject(BillingService);
  private notification = inject(NotificationService);
  private router = inject(Router);

  /** Which tier's checkout is currently redirecting the browser, if any.
   *  No template button reads this anymore (see PricingCta's own doc
   *  comment) — kept alongside chooseTier()/checkoutError purely so that
   *  capability stays fully working/tested underneath, same
   *  leave-it-set-on-success shape ManageBillingComponent's own
   *  isRedirectingToBilling already establishes for its own, still-live
   *  version of this same button. */
  isRedirecting: 'basic' | 'pro' | null = null;
  checkoutError: string | null = null;

  /** Deliberately awaits getSession() directly rather than reading the
   *  isAuthenticated() signal (see AuthService's own "session vs
   *  getSession()" doc comment) — /pricing has no guard to await that
   *  signal's own async catch-up first, unlike every authGuard-protected
   *  route, so a fresh load (a hard refresh, or a direct link straight to
   *  /pricing) can hit ngOnInit before the signal has updated. Reading the
   *  signal here would silently skip billingService.load() for the rest of
   *  that page view — nothing else ever calls it again — permanently
   *  stuck showing Free regardless of the org's real tier, rather than the
   *  harmless one-frame nav flash the same signal lag causes elsewhere
   *  (e.g. LandingComponent's own nav, which self-corrects the moment the
   *  signal catches up). */
  async ngOnInit() {
    const session = await this.authService.getSession();
    if (session) {
      await this.billingService.load();
    }
  }

  /** Mirrors LandingComponent's own logout() exactly — same "already signed
   *  in" nav trim (Dashboard/Logout in place of Pricing/Log in/Sign up),
   *  same navigate-to-self-afterward shape (harmless here since the signal
   *  flip alone already swaps the nav back, but kept for consistency with
   *  that established precedent rather than a bespoke one-off). */
  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/pricing']);
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

    const result = await this.billingService.startCheckout(checkoutTier);
    if (result.error) {
      this.checkoutError = result.error;
      this.isRedirecting = null;
      return;
    }
    if (!result.redirected) {
      // Applied immediately (already on a different paid tier — see
      // BillingService.startCheckout()'s own doc comment) rather than
      // redirecting to Checkout. ctaFor() already reflects the new tier as
      // 'current' the moment currentTier() updates; the toast is just the
      // same brief "it worked" confirmation every other action in this app
      // gets.
      this.isRedirecting = null;
      this.notification.success(`You're now on the ${tier.name} plan.`);
    }
  }
}
