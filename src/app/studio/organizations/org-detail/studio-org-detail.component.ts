import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { SupabaseService } from '../../../core/supabase.service';
import { NotificationService } from '../../../core/notification.service';
import { SiteSettingsService } from '../../../core/site-settings.service';
import { Profile } from '../../../core/auth.service';
import { Database } from '../../../shared/models/database.types';
import { profileDisplayName } from '../../../shared/utils/profile-label';
import { isProfileOnline, formatLastSeen } from '../../../shared/utils/presence';
import { FEEDBACK_STATUS_LABELS, FEEDBACK_TYPE_LABELS, FeedbackStatus, FeedbackType } from '../../../shared/models/feedback';
import { computeOrgHealthTier, ORG_HEALTH_FEATURES, ORG_HEALTH_TIER_LABELS, OrgHealthTier } from '../../../shared/models/org-health';
import { BreadcrumbsComponent } from '../../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { SuspendOrganizationModalComponent } from '../../../shared/components/suspend-organization-modal/suspend-organization-modal.component';
import { DeleteOrganizationModalComponent } from '../../../shared/components/delete-organization-modal/delete-organization-modal.component';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
type FeedbackRow = Database['public']['Tables']['feedback']['Row'];
type ClientErrorLogRow = Database['public']['Tables']['client_error_log']['Row'];
type PlatformActionLogRow = Database['public']['Tables']['platform_action_log']['Row'];

// Mirrors StudioAuditLogComponent's own ACTION_LABELS — duplicated rather
// than shared, same "not every small presentational pattern gets
// centralized" convention this app's icon-chip gradients/donut-chart
// palettes already follow.
const BYTES_PER_MB = 1024 * 1024;

const ACTION_LABELS: Record<string, string> = {
  suspend: 'Suspended',
  unsuspend: 'Unsuspended',
  retire: 'Retired',
  restore: 'Restored',
  lock: 'Locked',
  unlock: 'Unlocked'
};

/** A dedicated page for one org, reached via a `studio/organizations/:id`
 *  route from either StudioOrganizationsComponent's own table rows or
 *  StudioUsersComponent's own user rows (a user's row links to their org's
 *  page, same as it used to open the same org's popup) — replaces the old
 *  OrgDetailModalComponent popup entirely, per the first "convert Studio's
 *  info drill-downs from popups to real pages" pass. Everything here comes
 *  from tables a platform admin already has cross-org read on (profiles/
 *  feedback/client_error_log/organizations, see add_platform_admin), plus
 *  inventory/task/storage counts resolved via platform_get_organization_usage() —
 *  originally deferred as needing a new cross-org RLS policy, until that
 *  SECURITY DEFINER function turned out to already bypass RLS for its own
 *  leaderboard use on StudioUsageComponent; extending it with a task_count
 *  column and an optional p_organization_id filter was simpler than adding
 *  a second policy pair from scratch. That same usage row also drives
 *  healthTier (Bronze/Silver/Gold — see shared/models/org-health.ts) and
 *  notAdoptedLabels, the same feature-adoption signal
 *  StudioUsageComponent's own "Org health" section and
 *  StudioOrganizationsComponent's table column both show, here explained
 *  rather than just badged.
 *
 *  Also where a platform admin actually acts on an org — suspend/unsuspend
 *  (an immediate, reversible access block for abuse/non-payment, see
 *  add_platform_org_suspension_and_retirement) and retire/restore (the same
 *  soft-delete manage/danger-zone's own "Delete organization" already uses,
 *  just triggerable on any org rather than only that org's own admin on
 *  their own — labeled "Retire" here specifically, a distinct word for a
 *  distinct trigger: a concluded contract, not abuse). Every action mutates
 *  `this.organization` in place on success — same "keep the viewer on the
 *  page, just update what it shows" behavior the old popup already had,
 *  simpler here since there's no longer a caller's own list row to keep in
 *  sync (a page reload of the list picks up the change naturally).
 *
 *  A leaf dialog (SuspendOrganizationModalComponent/ConfirmDialogComponent/
 *  DeleteOrganizationModalComponent) is still the right shape for a small
 *  one-off confirmation/reason prompt — only the *info drill-down* itself
 *  moved from popup to page. Unlike the old OrgDetailModalComponent, this
 *  component is never itself rendered as dialog content, so it needs no
 *  MatDialogModule import at all (just the MatDialog service to open those
 *  three leaf dialogs) — sidesteps that component's own DI-shadowing
 *  footgun entirely rather than working around it (see that component's
 *  history for the full story, preserved in CLAUDE.md).
 *
 *  The page header shows the org's own uploaded logo (see orgLogoUrl's own
 *  doc comment) rather than a fixed icon, when that org has one — this
 *  page's whole identity is a specific org, unlike every other
 *  PageHeaderComponent usage in the app where a generic icon is the right
 *  call because the page itself, not any one entity, is what's being
 *  labeled. */
@Component({
  selector: 'app-studio-org-detail',
  imports: [DatePipe, RouterLink, MatButtonModule, MatExpansionModule, MatIconModule, BreadcrumbsComponent, PageHeaderComponent, EmptyStateComponent],
  templateUrl: './studio-org-detail.component.html',
  styleUrl: './studio-org-detail.component.scss',
})
export class StudioOrgDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SupabaseService).client;
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);
  private siteSettings = inject(SiteSettingsService);

  readonly feedbackTypeLabels = FEEDBACK_TYPE_LABELS;
  readonly feedbackStatusLabels = FEEDBACK_STATUS_LABELS;

  isLoading = true;
  loadError: string | null = null;
  notFound = false;
  /** Repeat-counts for the loading-state skeleton rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonMemberRows = [1, 2, 3];
  readonly skeletonRecentRows = [1, 2];

  organization: OrganizationRow | null = null;
  members: Profile[] = [];
  recentFeedback: FeedbackRow[] = [];
  recentErrors: ClientErrorLogRow[] = [];
  recentActions: PlatformActionLogRow[] = [];
  private actionActorNamesById = new Map<string, string>();

  /** From platform_get_organization_usage(), filtered to just this org's
   *  row — null while that call is still in flight/hasn't resolved (kept
   *  distinct from 0, a real zero-items/zero-tasks/zero-storage org, so the
   *  meta list below can render nothing rather than a misleading "0" during
   *  load). storageMb is rounded from the RPC's raw storage_bytes, same
   *  conversion StudioUsageComponent's/StudioOrganizationsComponent's own
   *  identical (duplicated, not shared) rounding already uses. */
  itemCount: number | null = null;
  taskCount: number | null = null;
  storageMb: number | null = null;
  /** Same source, reduced through computeOrgHealthTier() — see
   *  shared/models/org-health.ts's own doc comment for what the tier means.
   *  notAdoptedLabels names which of the five signals are still at zero, so
   *  this page (unlike the list views) also explains *why* the badge reads
   *  the way it does. */
  healthTier: OrgHealthTier | null = null;
  notAdoptedLabels: string[] = [];
  readonly healthTierLabels = ORG_HEALTH_TIER_LABELS;

  /** The org's own uploaded logo (Settings > Style), if it has one — resolved
   *  via SiteSettingsService.loadLogoUrlForOrganization(), the same
   *  cross-org-by-id lookup the register page's own invite-link preview
   *  already uses (site_settings' branding columns are anon/authenticated
   *  readable regardless of caller's own org, unlike every other org-scoped
   *  table in this schema — see that method's own doc comment). Passed to
   *  PageHeaderComponent's own `logoUrl` input, which falls back to the
   *  plain `apartment` icon whenever this stays null. */
  orgLogoUrl: string | null = null;

  /** Resolved separately from members above — the platform admin who
   *  suspended this org almost certainly isn't one of its own members. */
  suspendedByName: string | null = null;

  isActionPending = false;
  actionError: string | null = null;

  get isRetired(): boolean {
    return !!this.organization?.deleted_at;
  }

  get isSuspended(): boolean {
    return !!this.organization?.suspended_at;
  }

  get approvedCount(): number {
    return this.members.filter(member => member.membership_status === 'approved').length;
  }

  get pendingCount(): number {
    return this.members.filter(member => member.membership_status === 'pending').length;
  }

  get adminCount(): number {
    return this.members.filter(member => member.role === 'admin').length;
  }

  displayName(profile: Profile): string {
    return profileDisplayName(profile);
  }

  isOnline(profile: Profile): boolean {
    return isProfileOnline(profile.last_active_at);
  }

  lastSeenLabel(profile: Profile): string {
    return formatLastSeen(profile.last_active_at);
  }

  /** Navigates to a member's own StudioUserDetailComponent page — same
   *  drill-down destination StudioUsersComponent's own search results link
   *  to, so browsing an org's member list and searching for a person by
   *  name both land on the same place. */
  openUser(member: Profile) {
    this.router.navigate(['/studio/users', member.id]);
  }

  // row.type/row.status are plain `string` at the type level (the DB's own
  // check constraints aren't reflected in the generated Row type) — same
  // cast-through-the-label-map reasoning StudioFeedbackComponent's own
  // typeLabel()/statusLabel() already use.
  typeLabel(row: FeedbackRow): string {
    return this.feedbackTypeLabels[row.type as FeedbackType] ?? row.type;
  }

  statusLabel(row: FeedbackRow): string {
    return this.feedbackStatusLabels[row.status as FeedbackStatus] ?? row.status;
  }

  actionLabel(row: PlatformActionLogRow): string {
    return ACTION_LABELS[row.action] ?? row.action;
  }

  actionActorName(row: PlatformActionLogRow): string {
    if (!row.actor_id) {
      return 'Former platform admin';
    }
    return this.actionActorNamesById.get(row.actor_id) ?? 'Former platform admin';
  }

  async ngOnInit() {
    // Read once — every navigation into this page comes from a genuinely
    // different route (studio/organizations or studio/users), which always
    // recreates the component regardless of Angular's default route-reuse
    // behavior, so there's no "same route, new id" case to react to here.
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound = true;
      this.isLoading = false;
      return;
    }
    await this.loadOrganization(id);
  }

  retryLoad() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      void this.loadOrganization(id);
    }
  }

  private async loadOrganization(id: string) {
    this.isLoading = true;
    this.loadError = null;
    this.notFound = false;

    const { data: organization, error } = await this.supabase.from('organizations').select('*').eq('id', id).maybeSingle();

    if (error) {
      this.loadError = error.message;
      this.isLoading = false;
      return;
    }
    if (!organization) {
      this.notFound = true;
      this.isLoading = false;
      return;
    }
    this.organization = organization;

    // platform_list_profiles()/platform_list_feedback()/platform_list_client_errors()
    // — see add_platform_cross_org_read_rpcs' own doc comment for why every
    // cross-org read of these three tables in Studio goes through a
    // SECURITY DEFINER RPC now rather than a plain `.from(table).select()`
    // relying on a blanket permissive policy. Neither platform_list_feedback()
    // nor platform_list_profiles() takes a limit param (feedback's own
    // 5-row cap is applied client-side below instead) — client_error_log's
    // does, since StudioErrorLogComponent's own 200-row cap already made
    // that one worth pushing down to the database.
    const [{ data: members }, { data: feedback }, { data: errors }, { data: actions }, { data: usage }, logoUrl] = await Promise.all([
      this.supabase.rpc('platform_list_profiles', { p_organization_id: id }),
      this.supabase.rpc('platform_list_feedback', { p_organization_id: id }),
      this.supabase.rpc('platform_list_client_errors', { p_organization_id: id, p_limit: 5 }),
      this.supabase.from('platform_action_log').select('*').eq('target_type', 'organization').eq('target_id', id)
        .order('created_at', { ascending: false }).limit(5),
      this.supabase.rpc('platform_get_organization_usage', { p_organization_id: id }),
      this.siteSettings.loadLogoUrlForOrganization(id)
    ]);

    this.members = (members ?? []).sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''));
    this.recentFeedback = (feedback ?? []).slice(0, 5);
    this.recentErrors = errors ?? [];
    this.recentActions = actions ?? [];
    // Filtered server-side to just this one org, so at most one row comes
    // back — a failed/empty result (a stale cached session mid-permission-
    // change, say) just leaves these null rather than failing the whole
    // page load over what's supplementary info here, not this page's core
    // reason for existing the way organization/members are.
    this.itemCount = usage?.[0]?.item_count ?? null;
    this.taskCount = usage?.[0]?.task_count ?? null;
    this.storageMb = usage?.[0] ? Math.round((usage[0].storage_bytes / BYTES_PER_MB) * 10) / 10 : null;
    if (usage?.[0]) {
      const adoption = {
        containerCount: usage[0].container_count,
        reservationCount: usage[0].reservation_count,
        orderCount: usage[0].order_count,
        broadcastCount: usage[0].broadcast_count,
        completedAuditCount: usage[0].completed_audit_count
      };
      this.healthTier = computeOrgHealthTier(adoption);
      this.notAdoptedLabels = ORG_HEALTH_FEATURES.filter(feature => adoption[feature.key] === 0).map(feature => feature.label);
    } else {
      this.healthTier = null;
      this.notAdoptedLabels = [];
    }
    this.orgLogoUrl = logoUrl;

    // A platform admin almost certainly isn't a member of the org they just
    // acted on, so their name can't be resolved from `members` above — a
    // small follow-up query keyed on just the distinct actor ids this org's
    // own action log actually has, mirroring suspendedByName's own
    // one-off-lookup shape just below rather than a full cross-org profiles
    // fetch StudioAuditLogComponent's own page already does for its
    // whole-platform view.
    const actorIds = [...new Set((actions ?? []).map(action => action.actor_id).filter((id): id is string => !!id))];
    if (actorIds.length > 0) {
      const { data: actors } = await this.supabase.rpc('platform_list_profiles', { p_ids: actorIds });
      this.actionActorNamesById = new Map((actors ?? []).map(actor => [actor.id, profileDisplayName(actor)]));
    }

    if (organization.suspended_by) {
      const { data: suspenders } = await this.supabase.rpc('platform_list_profiles', { p_ids: [organization.suspended_by] });
      this.suspendedByName = suspenders?.[0] ? profileDisplayName(suspenders[0]) : null;
    }

    this.isLoading = false;
  }

  // The four action methods below are only ever invoked from buttons
  // rendered inside the "organization loaded" branch of the template, so
  // `this.organization!` is safe here even though the field's own type
  // stays nullable for the loading/not-found states above.

  suspendOrganization() {
    if (this.isActionPending) {
      return;
    }
    const org = this.organization!;
    const dialogRef = this.dialog.open(SuspendOrganizationModalComponent, {
      data: { organizationName: org.name },
      width: 'clamp(28rem, 50vw, 34rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe(async (reason?: string) => {
      if (!reason) {
        return;
      }
      this.isActionPending = true;
      this.actionError = null;

      const { error } = await this.supabase.rpc('platform_suspend_organization', { org_id: org.id, reason });

      this.isActionPending = false;
      if (error) {
        this.actionError = error.message;
        return;
      }

      Object.assign(org, { suspended_at: new Date().toISOString(), suspension_reason: reason });
      this.suspendedByName = 'you';
      this.notification.success('Organization suspended.');
    });
  }

  unsuspendOrganization() {
    if (this.isActionPending) {
      return;
    }
    const org = this.organization!;
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Unsuspend organization?',
        message: `${org.name} will immediately regain access to ShelfSync.`,
        confirmLabel: 'Unsuspend organization'
      },
      width: 'clamp(24rem, 40vw, 30rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe(async (confirmed?: boolean) => {
      if (!confirmed) {
        return;
      }
      this.isActionPending = true;
      this.actionError = null;

      const { error } = await this.supabase.rpc('platform_unsuspend_organization', { org_id: org.id });

      this.isActionPending = false;
      if (error) {
        this.actionError = error.message;
        return;
      }

      Object.assign(org, { suspended_at: null, suspended_by: null, suspension_reason: null });
      this.suspendedByName = null;
      this.notification.success('Organization unsuspended.');
    });
  }

  retireOrganization() {
    if (this.isActionPending) {
      return;
    }
    const org = this.organization!;
    const dialogRef = this.dialog.open(DeleteOrganizationModalComponent, {
      data: { organizationName: org.name },
      width: 'clamp(28rem, 50vw, 34rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe(async (confirmed?: boolean) => {
      if (!confirmed) {
        return;
      }
      this.isActionPending = true;
      this.actionError = null;

      const { error } = await this.supabase.rpc('platform_retire_organization', { org_id: org.id });

      this.isActionPending = false;
      if (error) {
        this.actionError = error.message;
        return;
      }

      Object.assign(org, { deleted_at: new Date().toISOString() });
      this.notification.success('Organization retired.');
    });
  }

  restoreOrganization() {
    if (this.isActionPending) {
      return;
    }
    const org = this.organization!;
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Restore organization?',
        message: `${org.name} will no longer be scheduled for deletion, and its team will regain access.`,
        confirmLabel: 'Restore organization'
      },
      width: 'clamp(24rem, 40vw, 30rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe(async (confirmed?: boolean) => {
      if (!confirmed) {
        return;
      }
      this.isActionPending = true;
      this.actionError = null;

      const { error } = await this.supabase.rpc('platform_restore_organization', { org_id: org.id });

      this.isActionPending = false;
      if (error) {
        this.actionError = error.message;
        return;
      }

      Object.assign(org, { deleted_at: null });
      this.notification.success('Organization restored.');
    });
  }
}
