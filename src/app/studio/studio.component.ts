import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { EmptyStateComponent } from '../shared/components/empty-state/empty-state.component';
import { TrendChartComponent, TrendPoint } from '../shared/components/trend-chart/trend-chart.component';
import { CountUpDirective } from '../shared/directives/count-up.directive';
import { bucketByWeek } from '../shared/utils/trend-buckets';
import { getUnseenChangelogCount } from '../shared/utils/changelog';

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
  imports: [
    RouterModule,
    MatBadgeModule,
    MatButtonModule,
    MatIconModule,
    BreadcrumbsComponent,
    EmptyStateComponent,
    TrendChartComponent,
    CountUpDirective
  ],
  templateUrl: './studio.component.html',
  styleUrl: './studio.component.scss',
})
export class StudioComponent implements OnInit {
  private authService = inject(AuthService);
  private supabase = inject(SupabaseService).client;

  /** Feedback nobody's looked at yet — badged on the Feedback card, same
   *  "pending queue" badge treatment ManageComponent's own cards use, *and*
   *  reused as one of the headline stats below (see loadStats()). */
  newFeedbackCount = 0;
  /** How many Release Notes entries this user hasn't seen yet — badged on
   *  this hub's own Release Notes card, same treatment and same underlying
   *  per-user (not per-page) storage key ManageComponent.unseenReleaseNotesCount
   *  already uses, so visiting either hub's Release Notes page clears both
   *  badges together. Awaited directly in ngOnInit, alongside (not inside)
   *  loadStats()'s own Promise.all — release_notes is a real table now
   *  (see the add_release_notes migration), not the static array this used
   *  to read synchronously, but this count has no "genuinely broken vs.
   *  empty" ambiguity worth its own loadError/retry treatment the way
   *  loadStats()'s five queries do. */
  unseenReleaseNotesCount = 0;

  /** Headline cross-org numbers — the platform-admin counterpart to
   *  manage/reports' own stat-grid, giving this hub an actual "state of the
   *  business" glance instead of just three navigation cards. Displayed in
   *  the hero's own pulse row (see the template) rather than a separate
   *  stat-grid card. Every count here is a plain head:true query, same
   *  convention ManageComponent's own ngOnInit() already uses for its three
   *  pending-queue badges. */
  isLoadingStats = true;
  /** Fixed at 4 — the Mission Control hero's own pulse row always renders
   *  exactly this many chips, unlike a data-driven list's own skeletonRows
   *  count. This is now the only headline-stat display on the page — the
   *  plain .stat-grid card that used to sit below the hero was removed once
   *  the hero's own pulse row made it fully redundant (4 of its 5 tiles
   *  duplicated here; the fifth, approved-member count, wasn't worth
   *  keeping a whole card around for on its own). */
  readonly heroSkeletonChips = [1, 2, 3, 4];
  /** Set when any of loadStats()'s own five queries fails — see
   *  ManageReportsComponent's identical loadError field for the full
   *  reasoning (a failed load otherwise renders indistinguishably from a
   *  genuinely-empty platform). Deliberately scoped to loadStats() only,
   *  not loadPendingBadge() — that one already feeds newFeedbackCount
   *  independently and has no "is this really zero" ambiguity worth a
   *  retry UI of its own, the same "just a badge" reasoning
   *  ManageComponent's own hub-card counts are left out of this pattern
   *  for. */
  loadError: string | null = null;
  /** Active (non-soft-deleted) organizations — the number that actually
   *  matters day to day, separate from newOrgCount below which is a gross
   *  signup count and deliberately doesn't exclude an org that signed up
   *  and was deleted again in the same week. */
  totalOrgCount = 0;
  newOrgCount = 0;
  /** Non-development errors in the last 24 hours — filtered client-side
   *  against the fetched rows' own app_env, exactly mirroring
   *  StudioErrorLogComponent's own `row.app_env !== 'development'` check
   *  (a SQL `.neq('app_env', 'development')` would silently exclude a null
   *  app_env too, since `x != y` evaluates to NULL — not true — when x is
   *  NULL in Postgres, which isn't what the in-app check above means by
   *  "not development"). */
  recentErrorCount = 0;

  /** 12-week signup trends — the counterpart to newOrgCount above, which
   *  only ever shows the most recent week in isolation. Bucketed
   *  client-side via bucketByWeek() from the same plain created_at
   *  columns every org/profile row already carries — no new schema, no
   *  RPC, since organizations' own SELECT policy is already `using (true)`
   *  and profiles already has a cross-org read policy for a platform
   *  admin (add_platform_admin). */
  orgSignupTrend: TrendPoint[] = [];
  userSignupTrend: TrendPoint[] = [];

  get orgSignupTrendTotal(): number {
    return this.orgSignupTrend.reduce((sum, point) => sum + point.value, 0);
  }

  get userSignupTrendTotal(): number {
    return this.userSignupTrend.reduce((sum, point) => sum + point.value, 0);
  }

  async ngOnInit() {
    const profile = await this.authService.getProfile();
    await Promise.all([
      this.loadPendingBadge(),
      this.loadStats(),
      profile ? this.loadUnseenReleaseNotesCount(profile.id) : Promise.resolve()
    ]);
  }

  private async loadUnseenReleaseNotesCount(userId: string) {
    this.unseenReleaseNotesCount = await getUnseenChangelogCount(this.supabase, userId);
  }

  private async loadPendingBadge() {
    const { count } = await this.supabase
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new');
    this.newFeedbackCount = count ?? 0;
  }

  /** Re-runs loadStats() after a failed one — the Retry button's handler
   *  (see the template's own loadError branch). */
  retryLoad() {
    void this.loadStats();
  }

  private async loadStats() {
    this.isLoadingStats = true;

    const now = Date.now();
    const weekAgoIso = new Date(now - 7 * 86400000).toISOString();
    const dayAgoIso = new Date(now - 86400000).toISOString();

    const [orgCountResult, newOrgCountResult, errorsResult, orgCreatedAtResult, profileCreatedAtResult] = await Promise.all([
      this.supabase.from('organizations').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      this.supabase.from('organizations').select('id', { count: 'exact', head: true }).gte('created_at', weekAgoIso),
      this.supabase.from('client_error_log').select('app_env').gte('created_at', dayAgoIso),
      this.supabase.from('organizations').select('created_at'),
      this.supabase.from('profiles').select('created_at')
    ]);

    const error = orgCountResult.error?.message ?? newOrgCountResult.error?.message
      ?? errorsResult.error?.message
      ?? orgCreatedAtResult.error?.message ?? profileCreatedAtResult.error?.message ?? null;
    if (error) {
      this.loadError = error;
      this.isLoadingStats = false;
      return;
    }
    this.loadError = null;

    this.totalOrgCount = orgCountResult.count ?? 0;
    this.newOrgCount = newOrgCountResult.count ?? 0;
    this.recentErrorCount = (errorsResult.data ?? []).filter(row => row.app_env !== 'development').length;
    this.orgSignupTrend = bucketByWeek((orgCreatedAtResult.data ?? []).map(row => row.created_at), 12);
    this.userSignupTrend = bucketByWeek((profileCreatedAtResult.data ?? []).map(row => row.created_at), 12);
    this.isLoadingStats = false;
  }
}
