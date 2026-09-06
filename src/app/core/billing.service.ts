import { Injectable, computed, inject, signal } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { OrgSubscription } from '../shared/models/subscription.model';
import { PricingTier, pricingTierByKey } from '../shared/models/pricing-tier';

/** startCheckout()'s result — `error` is null on success either way, but
 *  callers need `redirected` to know which kind of success happened:
 *  `true` means the browser is already navigating to Stripe Checkout (leave
 *  any pending/spinner UI alone, the page is about to unload); `false`
 *  means an existing paid subscription's price changed in place with no
 *  redirect at all — `subscription()`/`currentTier()` are already refreshed
 *  by the time this resolves, so the caller should clear its own pending
 *  state and show its own "done" feedback. */
export interface CheckoutResult {
  error: string | null;
  redirected: boolean;
}

/** The org's real Stripe subscription state — backs manage/billing's plan
 *  summary/upgrade-or-manage buttons and /pricing's per-tier CTAs. Same
 *  signal-plus-loadError shape SupplierService/ReservationKitService already
 *  establish for a root-provided service, but `startCheckout()`/
 *  `openBillingPortal()` are a different shape than those services' own
 *  create()/update() — there's no direct table write this app ever makes to
 *  `subscriptions` (see that table's own migration: no insert/update/delete
 *  grant for `authenticated` at all), only a redirect to a Stripe-hosted
 *  URL minted by an Edge Function. Mirrors ImpersonationService.start()'s
 *  own functions.invoke() + extractFunctionErrorMessage() shape for exactly
 *  that reason. */
@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly authService = inject(AuthService);

  private readonly _subscription = signal<OrgSubscription | null>(null);
  readonly subscription = this._subscription.asReadonly();

  /** Free is the implicit default whenever no subscriptions row exists yet
   *  (an org that's never subscribed) — same "missing row = default" shape
   *  SiteSettingsService's own signals already use. */
  readonly currentTier = computed<PricingTier>(() => pricingTierByKey(this._subscription()?.tier ?? 'free'));

  private readonly _loadError = signal<string | null>(null);
  readonly loadError = this._loadError.asReadonly();

  /** Loads the caller's own org's subscription row. Call once a profile is
   *  available, same lifecycle SiteSettingsService.load() already expects.
   *  A missing row is not an error (`.maybeSingle()` returns null data with
   *  no error) — it just means Free, so `_subscription` is set to `null`
   *  rather than `_loadError`. */
  async load(): Promise<void> {
    const organizationId = this.authService.organizationId();
    if (!organizationId) {
      this._subscription.set(null);
      this._loadError.set(null);
      return;
    }

    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('tier, status, current_period_end, cancel_at_period_end')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) {
      this._loadError.set(error.message);
      return;
    }

    this._loadError.set(null);
    this._subscription.set(
      data
        ? {
            tier: data.tier as OrgSubscription['tier'],
            status: data.status,
            currentPeriodEnd: data.current_period_end,
            cancelAtPeriodEnd: data.cancel_at_period_end
          }
        : null
    );
  }

  /** Moves the org onto `tier` — either by redirecting to a real Stripe
   *  Checkout page (an org with no existing paid subscription) or, for an
   *  org already on a *different* paid tier, by changing that subscription's
   *  price in place with no redirect at all (see create-checkout-session's
   *  own doc comment for why a Checkout Session can't be reused for that
   *  case — it would create a second, separate subscription rather than
   *  changing the existing one). Either way this app's own `subscriptions`
   *  row is only ever written by stripe-webhook, never here. Admin-only in
   *  practice (the Edge Function itself enforces this — this is just where
   *  every caller in this app happens to reach it from). */
  async startCheckout(tier: 'basic' | 'pro'): Promise<CheckoutResult> {
    const { data, error } = await this.supabase.functions.invoke<{ url?: string; updated?: boolean }>(
      'create-checkout-session',
      { body: { tier } }
    );
    if (error) {
      return { error: await this.extractFunctionErrorMessage(error, 'Failed to start checkout.'), redirected: false };
    }
    if (data?.updated) {
      // Applied immediately — reload so subscription()/currentTier()
      // reflect the new tier right away, since there's no page navigation
      // to otherwise trigger a refresh.
      await this.load();
      return { error: null, redirected: false };
    }
    if (!data?.url) {
      return { error: 'Failed to start checkout.', redirected: false };
    }
    window.location.href = data.url;
    return { error: null, redirected: true };
  }

  /** Same shape as startCheckout() — redirects to a real Stripe Customer
   *  Portal session on success, where an org's admin manages/cancels their
   *  own subscription without any hand-built UI in this app. */
  async openBillingPortal(): Promise<string | null> {
    const { data, error } = await this.supabase.functions.invoke<{ url: string }>('create-billing-portal-session', {});
    if (error) {
      return await this.extractFunctionErrorMessage(error, 'Failed to open the billing portal.');
    }
    if (!data?.url) {
      return 'Failed to open the billing portal.';
    }
    window.location.href = data.url;
    return null;
  }

  /** Copy of ImpersonationService's own — see its doc comment for why
   *  FunctionsHttpError.message alone isn't the real reason and
   *  error.context has to be read (and JSON-parsed) separately. */
  private async extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (typeof body?.error === 'string') {
          return body.error;
        }
      } catch {
        // Fall through to the generic message below.
      }
    }
    return error instanceof Error ? error.message : fallback;
  }
}
