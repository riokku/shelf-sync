import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
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
    MatProgressSpinnerModule,
    RouterLink,
    BreadcrumbsComponent,
    PageHeaderComponent
  ],
  templateUrl: './manage-billing.component.html',
  styleUrl: './manage-billing.component.scss',
})
export class ManageBillingComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);

  isLoading = true;

  readonly currentTier: PricingTier = pricingTierByKey('free');

  organizationCreatedAt: string | null = null;
  teamMemberCount = 0;
  inventoryItemCount = 0;
  storageUsedMb = 0;

  /** Placeholder — no real subscription exists to read a renewal date from. */
  readonly placeholderNextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  async ngOnInit() {
    const profile = await this.authService.getProfile();
    if (!profile) {
      this.isLoading = false;
      return;
    }

    const [{ data: organization }, { count: memberCount }, { count: itemCount }, { data: storageBytes }] = await Promise.all([
      this.supabase.from('organizations').select('created_at').eq('id', profile.organization_id).single(),
      this.supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('membership_status', 'approved'),
      this.supabase.from('inventory_items').select('id', { count: 'exact', head: true }),
      this.supabase.rpc('get_inventory_photo_storage_usage')
    ]);

    this.organizationCreatedAt = organization?.created_at ?? null;
    this.teamMemberCount = memberCount ?? 0;
    this.inventoryItemCount = itemCount ?? 0;
    this.storageUsedMb = Math.round(((storageBytes ?? 0) / (1024 * 1024)) * 10) / 10;
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
