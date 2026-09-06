import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BillingService } from '../../core/billing.service';
import { NotificationService } from '../../core/notification.service';
import { SupabaseService } from '../../core/supabase.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { RingStatComponent } from '../../shared/components/ring-stat/ring-stat.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

/** Admin-only billing page — real Stripe subscription state via
 *  BillingService, replacing what used to be a permanent preview hardcoded
 *  onto the Free tier. adminGuard rather than manageGuard: billing is
 *  financial information, same audience as Danger Zone, not the broader
 *  admin-or-manager audience the rest of Manage's sub-pages use.
 *
 *  Account creation date, team member count, inventory item count, and
 *  photo storage usage are all real, queried numbers — storage usage comes
 *  from the `get_inventory_photo_storage_usage()` RPC (reads
 *  storage.objects, Supabase Storage's own backing table, which isn't
 *  exposed to PostgREST directly, hence the RPC rather than a plain query).
 *  `currentTier`/`subscription` now come from BillingService (a real
 *  `subscriptions` row, or the implicit Free default when none exists) —
 *  no more hardcoded/placeholder plan or billing date. */
@Component({
  selector: 'app-manage-billing',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    RouterLink,
    BreadcrumbsComponent,
    PageHeaderComponent,
    RingStatComponent,
    EmptyStateComponent
  ],
  templateUrl: './manage-billing.component.html',
  styleUrl: './manage-billing.component.scss',
})
export class ManageBillingComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  protected billingService = inject(BillingService);

  isLoading = true;
  /** Fixed at 3 — the real .usage-grid below always renders exactly this
   *  many stats. */
  readonly skeletonUsageStats = [1, 2, 3];
  /** Set when any of ngOnInit()'s own queries fails — see
   *  ManageReportsComponent's identical loadError field for the full
   *  reasoning (a failed load otherwise renders indistinguishably from a
   *  genuinely-fresh, all-zero org). */
  loadError: string | null = null;

  organizationCreatedAt: string | null = null;
  teamMemberCount = 0;
  inventoryItemCount = 0;
  storageUsedMb = 0;

  /** Tracks which billing action (if any) is currently redirecting the
   *  browser away to Stripe — disables every action button while set, and
   *  which spinner shows. Deliberately left set after a *successful*
   *  startCheckout()/openBillingPortal() call (rather than reset) since the
   *  page is genuinely about to navigate away; only reset on failure, so
   *  the buttons become usable again to retry. */
  isRedirectingToBilling: 'basic' | 'pro' | 'portal' | null = null;
  billingActionError: string | null = null;

  /** Re-runs ngOnInit()'s own loads after a failed one — the Retry button's
   *  handler (see the template's own loadError branch). */
  retryLoad() {
    void this.loadBillingData();
  }

  async ngOnInit() {
    await this.loadBillingData();
  }

  private async loadBillingData() {
    this.isLoading = true;

    const profile = await this.authService.getProfile();
    if (!profile) {
      this.isLoading = false;
      return;
    }

    const [orgResult, memberCountResult, itemCountResult, storageResult] = await Promise.all([
      this.supabase.from('organizations').select('created_at').eq('id', profile.organization_id).single(),
      this.supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', profile.organization_id)
        .eq('membership_status', 'approved'),
      this.supabase.from('inventory_items').select('id', { count: 'exact', head: true }),
      this.supabase.rpc('get_inventory_photo_storage_usage'),
      this.billingService.load()
    ]);

    const error = orgResult.error?.message ?? memberCountResult.error?.message
      ?? itemCountResult.error?.message ?? storageResult.error?.message ?? this.billingService.loadError() ?? null;
    if (error) {
      this.loadError = error;
      this.isLoading = false;
      return;
    }
    this.loadError = null;

    this.organizationCreatedAt = orgResult.data?.created_at ?? null;
    this.teamMemberCount = memberCountResult.count ?? 0;
    this.inventoryItemCount = itemCountResult.count ?? 0;
    this.storageUsedMb = Math.round(((storageResult.data ?? 0) / (1024 * 1024)) * 10) / 10;
    this.isLoading = false;
  }

  /** Clamped to 100 — a real overage (e.g. an org that joined under a
   *  higher-cap plan that later shrank) shouldn't render a progress bar
   *  wider than its own track. Returns 0 for an unlimited (null) cap rather
   *  than dividing by it. */
  usagePercent(used: number, limit: number | null): number {
    if (limit === null || limit === 0) {
      return 0;
    }
    return Math.min(100, Math.round((used / limit) * 100));
  }

  usageLabel(used: number, limit: number | null): string {
    return limit === null ? `${used} · Unlimited` : `${used} of ${limit}`;
  }

  /** Same shape as usageLabel() above, but with the MB unit folded into
   *  each number rather than appended once at the end — "142MB ·
   *  Unlimited" reads correctly where "142 · UnlimitedMB" wouldn't. */
  storageUsageLabel(): string {
    const limit = this.billingService.currentTier().limits.storageLimitMb;
    return limit === null
      ? `${this.storageUsedMb}MB · Unlimited`
      : `${this.storageUsedMb}MB of ${limit}MB`;
  }

  /** Moves the org onto `tier` — either a real Stripe Checkout redirect
   *  (nothing on Free yet) or an immediate in-place plan change (already on
   *  a different paid tier) — see BillingService.startCheckout()'s own doc
   *  comment. Only the redirect case leaves isRedirectingToBilling set; the
   *  immediate case has nothing left to wait on, so it clears the pending
   *  state itself and toasts the same way every other brief confirmation in
   *  this app does. */
  async upgrade(tier: 'basic' | 'pro') {
    if (this.isRedirectingToBilling) {
      return;
    }
    this.isRedirectingToBilling = tier;
    this.billingActionError = null;

    const result = await this.billingService.startCheckout(tier);
    if (result.error) {
      this.billingActionError = result.error;
      this.isRedirectingToBilling = null;
      return;
    }
    if (!result.redirected) {
      this.isRedirectingToBilling = null;
      this.notification.success(`You're now on the ${tier === 'pro' ? 'Pro' : 'Basic'} plan.`);
    }
  }

  /** Redirects to a real Stripe Customer Portal session — same
   *  leave-it-set-on-success shape as upgrade() above. */
  async manageBilling() {
    if (this.isRedirectingToBilling) {
      return;
    }
    this.isRedirectingToBilling = 'portal';
    this.billingActionError = null;

    const error = await this.billingService.openBillingPortal();
    if (error) {
      this.billingActionError = error;
      this.isRedirectingToBilling = null;
    }
  }
}
