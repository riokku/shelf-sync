import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SupabaseService } from '../../core/supabase.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { pricingTierByKey } from '../../shared/models/pricing-tier';

interface OrgUsage {
  organizationId: string;
  name: string;
  memberCount: number;
  itemCount: number;
  storageMb: number;
}

interface UsageBreakdownRow {
  label: string;
  value: number;
}

interface OverLimitRow {
  organizationId: string;
  name: string;
  exceeded: string[];
}

const BYTES_PER_MB = 1024 * 1024;

/** Platform-admin resource usage leaderboard + Free-tier pressure report —
 *  the counterpart to Studio's own headline stat grid (StudioComponent),
 *  which only ever shows platform-wide totals, never a per-org breakdown of
 *  who's actually driving Supabase storage/egress cost or already past
 *  what the Free tier (shared/models/pricing-tier.ts) allows. Both sections
 *  read the same platform_get_organization_usage() RPC result — one
 *  cross-org aggregate query, joined against `organizations` for display
 *  names the same client-side-map way StudioOrganizationsComponent already
 *  correlates its own cross-org profiles query. */
@Component({
  selector: 'app-studio-usage',
  imports: [RouterLink, MatButtonModule, MatIconModule, BreadcrumbsComponent, PageHeaderComponent, EmptyStateComponent],
  templateUrl: './studio-usage.component.html',
  styleUrl: './studio-usage.component.scss',
})
export class StudioUsageComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  isLoading = true;
  loadError: string | null = null;
  /** Repeat-count for the loading-state skeleton breakdown rows — see
   *  ManageReportsComponent's own identical skeletonBreakdownRows. */
  readonly skeletonRows = [1, 2, 3];

  private usage: OrgUsage[] = [];

  topByStorage: UsageBreakdownRow[] = [];
  topByItems: UsageBreakdownRow[] = [];
  topByMembers: UsageBreakdownRow[] = [];
  overLimit: OverLimitRow[] = [];

  get hasAnyUsage(): boolean {
    return this.usage.length > 0;
  }

  retryLoad() {
    void this.loadUsage();
  }

  async ngOnInit() {
    await this.loadUsage();
  }

  /** Scales a bar's width against the largest value in its own list, same
   *  convention/reasoning ManageReportsComponent.barWidth() already
   *  documents. */
  barWidth(rows: UsageBreakdownRow[], value: number): number {
    const max = Math.max(1, ...rows.map(row => row.value));
    return (value / max) * 100;
  }

  private async loadUsage() {
    this.isLoading = true;

    const [usageResult, orgsResult] = await Promise.all([
      this.supabase.rpc('platform_get_organization_usage'),
      this.supabase.from('organizations').select('id, name')
    ]);

    const error = usageResult.error?.message ?? orgsResult.error?.message ?? null;
    if (error) {
      this.loadError = error;
      this.isLoading = false;
      return;
    }
    this.loadError = null;

    const namesById = new Map((orgsResult.data ?? []).map(org => [org.id, org.name]));
    this.usage = (usageResult.data ?? []).map(row => ({
      organizationId: row.organization_id,
      name: namesById.get(row.organization_id) ?? 'Unknown organization',
      memberCount: row.member_count,
      itemCount: row.item_count,
      storageMb: Math.round((row.storage_bytes / BYTES_PER_MB) * 10) / 10
    }));

    this.topByStorage = this.topN(this.usage, org => org.storageMb);
    this.topByItems = this.topN(this.usage, org => org.itemCount);
    this.topByMembers = this.topN(this.usage, org => org.memberCount);
    this.overLimit = this.buildOverLimitRows(this.usage);

    this.isLoading = false;
  }

  private topN(orgs: OrgUsage[], valueOf: (org: OrgUsage) => number, n = 5): UsageBreakdownRow[] {
    return [...orgs]
      .map(org => ({ label: org.name, value: valueOf(org) }))
      .filter(row => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, n);
  }

  /** Every org is hardcoded onto the Free tier today (no subscriptions
   *  table yet — see ManageBillingComponent's own identical hardcode), so
   *  "over the limit" here always means "over Free" — an upsell/attention
   *  signal, not an enforcement action (nothing in this schema actually
   *  blocks an org from exceeding it yet). */
  private buildOverLimitRows(orgs: OrgUsage[]): OverLimitRow[] {
    const limits = pricingTierByKey('free').limits;
    const rows: OverLimitRow[] = [];

    for (const org of orgs) {
      const exceeded: string[] = [];
      if (limits.maxTeamMembers !== null && org.memberCount > limits.maxTeamMembers) {
        exceeded.push(`${org.memberCount} members`);
      }
      if (limits.maxInventoryItems !== null && org.itemCount > limits.maxInventoryItems) {
        exceeded.push(`${org.itemCount} items`);
      }
      if (limits.storageLimitMb !== null && org.storageMb > limits.storageLimitMb) {
        exceeded.push(`${org.storageMb}MB storage`);
      }
      if (exceeded.length > 0) {
        rows.push({ organizationId: org.organizationId, name: org.name, exceeded });
      }
    }

    return rows.sort((a, b) => b.exceeded.length - a.exceeded.length);
  }
}
