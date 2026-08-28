import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SupabaseService } from '../core/supabase.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';

/** A card hub, same shape as ManageComponent, for a genuinely different
 *  audience: the app's own maintainer, not any org's own admin/manager.
 *  Every RLS policy and every manage/* route in this schema scopes
 *  strictly to the caller's own organization_id — this is the first area
 *  that deliberately spans every org at once, gated by
 *  `platformAdminGuard`/`profiles.is_platform_admin` (see the
 *  add_platform_admin migration) rather than `role`. Reachable via a
 *  "Studio" link in HeaderComponent's nav drawer and a card on Home, both
 *  gated the same way, so nobody else ever sees either exists. */
@Component({
  selector: 'app-studio',
  imports: [RouterModule, MatBadgeModule, MatButtonModule, MatIconModule, BreadcrumbsComponent],
  templateUrl: './studio.component.html',
  styleUrl: './studio.component.scss',
})
export class StudioComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  /** Feedback nobody's looked at yet — badged on the Feedback card, same
   *  "pending queue" badge treatment ManageComponent's own cards use, *and*
   *  reused as one of the headline stats below (see loadStats()). */
  newFeedbackCount = 0;

  /** Headline cross-org numbers — the platform-admin counterpart to
   *  manage/reports' own stat-grid, giving this hub an actual "state of the
   *  business" glance instead of just three navigation cards. Every count
   *  here is a plain head:true query, same convention ManageComponent's own
   *  ngOnInit() already uses for its three pending-queue badges. */
  isLoadingStats = true;
  /** Fixed at 5 — the real .stat-grid below always renders exactly this many
   *  tiles, unlike a data-driven list's own skeletonRows count. */
  readonly skeletonStatTiles = [1, 2, 3, 4, 5];
  /** Active (non-soft-deleted) organizations — the number that actually
   *  matters day to day, separate from newOrgCount below which is a gross
   *  signup count and deliberately doesn't exclude an org that signed up
   *  and was deleted again in the same week. */
  totalOrgCount = 0;
  newOrgCount = 0;
  approvedUserCount = 0;
  /** Non-development errors in the last 24 hours — filtered client-side
   *  against the fetched rows' own app_env, exactly mirroring
   *  StudioErrorLogComponent's own `row.app_env !== 'development'` check
   *  (a SQL `.neq('app_env', 'development')` would silently exclude a null
   *  app_env too, since `x != y` evaluates to NULL — not true — when x is
   *  NULL in Postgres, which isn't what the in-app check above means by
   *  "not development"). */
  recentErrorCount = 0;

  async ngOnInit() {
    await Promise.all([this.loadPendingBadge(), this.loadStats()]);
  }

  private async loadPendingBadge() {
    const { count } = await this.supabase
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new');
    this.newFeedbackCount = count ?? 0;
  }

  private async loadStats() {
    this.isLoadingStats = true;

    const now = Date.now();
    const weekAgoIso = new Date(now - 7 * 86400000).toISOString();
    const dayAgoIso = new Date(now - 86400000).toISOString();

    const [
      { count: totalOrgCount },
      { count: newOrgCount },
      { count: approvedUserCount },
      { data: recentErrors }
    ] = await Promise.all([
      this.supabase.from('organizations').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      this.supabase.from('organizations').select('id', { count: 'exact', head: true }).gte('created_at', weekAgoIso),
      this.supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('membership_status', 'approved'),
      this.supabase.from('client_error_log').select('app_env').gte('created_at', dayAgoIso)
    ]);

    this.totalOrgCount = totalOrgCount ?? 0;
    this.newOrgCount = newOrgCount ?? 0;
    this.approvedUserCount = approvedUserCount ?? 0;
    this.recentErrorCount = (recentErrors ?? []).filter(row => row.app_env !== 'development').length;
    this.isLoadingStats = false;
  }
}
