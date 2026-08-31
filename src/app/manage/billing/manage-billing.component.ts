import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { RingStatComponent } from '../../shared/components/ring-stat/ring-stat.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PricingTier, pricingTierByKey } from '../../shared/models/pricing-tier';

/** Admin-only preview of what the Billing page will show once Stripe is
 *  wired up (see PricingComponent's own doc comment — that's separate,
 *  later work). adminGuard rather than manageGuard: billing is financial
 *  information, same audience as Danger Zone, not the broader admin-or-
 *  manager audience the rest of Manage's sub-pages use.
 *
 *  Every org is hardcoded onto the Free tier below — there's no
 *  subscriptions table yet, so nothing is actually read to determine a
 *  "current plan". Account creation date, team member count, inventory item
 *  count, and photo storage usage are all real, queried numbers — storage
 *  usage comes from the `get_inventory_photo_storage_usage()` RPC (reads
 *  storage.objects, Supabase Storage's own backing table, which isn't
 *  exposed to PostgREST directly, hence the RPC rather than a plain query).
 *  Only the billing-cycle date below is still a plausible-looking
 *  placeholder — there's no real subscription to read a renewal date from
 *  until Stripe is wired up. */
@Component({
  selector: 'app-manage-billing',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
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

  isLoading = true;
  /** Fixed at 3 — the real .usage-grid below always renders exactly this
   *  many stats. */
  readonly skeletonUsageStats = [1, 2, 3];
  /** Set when any of ngOnInit()'s own queries fails — see
   *  ManageReportsComponent's identical loadError field for the full
   *  reasoning (a failed load otherwise renders indistinguishably from a
   *  genuinely-fresh, all-zero org). */
  loadError: string | null = null;

  readonly currentTier: PricingTier = pricingTierByKey('free');

  organizationCreatedAt: string | null = null;
  teamMemberCount = 0;
  inventoryItemCount = 0;
  storageUsedMb = 0;

  /** Placeholder — no real subscription exists to read a renewal date from. */
  readonly placeholderNextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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
      this.supabase.rpc('get_inventory_photo_storage_usage')
    ]);

    const error = orgResult.error?.message ?? memberCountResult.error?.message
      ?? itemCountResult.error?.message ?? storageResult.error?.message ?? null;
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
    const limit = this.currentTier.limits.storageLimitMb;
    return limit === null
      ? `${this.storageUsedMb}MB · Unlimited`
      : `${this.storageUsedMb}MB of ${limit}MB`;
  }
}
