import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SupabaseService } from '../../core/supabase.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { Database } from '../../shared/models/database.types';
import { computeOrgHealthTier, ORG_HEALTH_TIER_LABELS, OrgHealthTier } from '../../shared/models/org-health';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];

interface OrganizationSummary extends OrganizationRow {
  memberCount: number;
  lastActiveAt: string | null;
  /** From platform_get_organization_usage() (see StudioUsageComponent's own
   *  leaderboard, the first consumer of this RPC) — null for a row the RPC
   *  didn't return usage for, kept distinct from a real zero so this table
   *  can show "—" rather than a misleading "0". In practice that's only
   *  ever a retired org: the RPC's own zero-arg call (same one the
   *  leaderboard uses) excludes `deleted_at`-set orgs, since a purged-in-
   *  30-days org's usage isn't worth surfacing there — StudioOrgDetailComponent's
   *  own per-id call is the one place that still shows a retired org's real
   *  usage, by passing its id explicitly. */
  itemCount: number | null;
  taskCount: number | null;
  storageMb: number | null;
  /** null alongside the other usage fields above, for the identical reason
   *  — a retired org simply has no row in this call's own result. */
  healthTier: OrgHealthTier | null;
}

const BYTES_PER_MB = 1024 * 1024;

/** Every organization using ShelfSync, at a glance — organizations' own
 *  SELECT policy is already `using (true)` for authenticated (see
 *  create_organizations.sql), so no new policy was needed for that part;
 *  memberCount/lastActiveAt come from a single cross-org profiles query
 *  (readable here only because of the new "Platform admins can view all
 *  profiles" policy from add_platform_admin), reduced client-side into one
 *  map rather than a per-org query loop. itemCount/taskCount/storageMb come
 *  from a second cross-org aggregate, platform_get_organization_usage() —
 *  the same SECURITY DEFINER RPC StudioUsageComponent's own leaderboard
 *  already calls (see add_platform_organization_task_count for the
 *  organization_id param that page doesn't use but this one doesn't need
 *  either, since this list wants every org's row at once) — so the same
 *  data StudioOrgDetailComponent shows one org at a time is visible here
 *  across the whole list without opening each org individually. healthTier
 *  is derived client-side from that same RPC result's five feature-adoption
 *  counts via computeOrgHealthTier() (see shared/models/org-health.ts) —
 *  same Bronze/Silver/Gold badge StudioUsageComponent's own "Org health"
 *  section and StudioOrgDetailComponent's meta list both show. */
@Component({
  selector: 'app-studio-organizations',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, BreadcrumbsComponent, PageHeaderComponent, EmptyStateComponent],
  templateUrl: './studio-organizations.component.html',
  styleUrl: './studio-organizations.component.scss',
})
export class StudioOrganizationsComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private router = inject(Router);

  isLoading = true;
  loadError: string | null = null;
  organizations: OrganizationSummary[] = [];
  /** Repeat-count for the loading-state skeleton table rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3, 4];
  readonly healthTierLabels = ORG_HEALTH_TIER_LABELS;

  async ngOnInit() {
    await this.loadOrganizations();
  }

  retryLoad() {
    void this.loadOrganizations();
  }

  /** Navigates to this org's own dedicated page — see
   *  StudioOrgDetailComponent's own doc comment for what it shows and why
   *  it's scoped the way it is. Was a popup (OrgDetailModalComponent)
   *  before the first "convert Studio's info drill-downs to real pages"
   *  pass. */
  openOrgDetail(org: OrganizationSummary) {
    this.router.navigate(['/studio/organizations', org.id]);
  }

  private async loadOrganizations() {
    this.isLoading = true;
    this.loadError = null;

    const [{ data: orgs, error }, { data: profiles }, { data: usage }] = await Promise.all([
      this.supabase.from('organizations').select('*').order('created_at', { ascending: false }),
      this.supabase.from('profiles').select('organization_id, last_active_at'),
      this.supabase.rpc('platform_get_organization_usage')
    ]);

    if (error) {
      this.loadError = error.message;
      this.isLoading = false;
      return;
    }

    // One pass building { count, lastActive } per org, rather than a query
    // per row — see this component's own doc comment above.
    const statsByOrgId = new Map<string, { count: number; lastActive: string | null }>();
    for (const profile of profiles ?? []) {
      const existing = statsByOrgId.get(profile.organization_id) ?? { count: 0, lastActive: null };
      existing.count += 1;
      if (profile.last_active_at && (!existing.lastActive || profile.last_active_at > existing.lastActive)) {
        existing.lastActive = profile.last_active_at;
      }
      statsByOrgId.set(profile.organization_id, existing);
    }

    // Usage is supplementary (a failed/partial RPC result just leaves every
    // org's item/task/storage columns showing "—") rather than failing the
    // whole page load over it, same reasoning StudioOrgDetailComponent's own
    // usage lookup already follows.
    const usageByOrgId = new Map((usage ?? []).map(row => [row.organization_id, row]));

    this.organizations = (orgs ?? []).map(org => {
      const stats = statsByOrgId.get(org.id) ?? { count: 0, lastActive: null };
      const orgUsage = usageByOrgId.get(org.id);
      return {
        ...org,
        memberCount: stats.count,
        lastActiveAt: stats.lastActive,
        itemCount: orgUsage?.item_count ?? null,
        taskCount: orgUsage?.task_count ?? null,
        storageMb: orgUsage ? Math.round((orgUsage.storage_bytes / BYTES_PER_MB) * 10) / 10 : null,
        healthTier: orgUsage
          ? computeOrgHealthTier({
              containerCount: orgUsage.container_count,
              reservationCount: orgUsage.reservation_count,
              orderCount: orgUsage.order_count,
              broadcastCount: orgUsage.broadcast_count,
              completedAuditCount: orgUsage.completed_audit_count
            })
          : null
      };
    });
    this.isLoading = false;
  }
}
