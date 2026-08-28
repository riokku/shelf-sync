import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { BreadcrumbsComponent } from '../../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { SuspendOrganizationModalComponent } from '../../../shared/components/suspend-organization-modal/suspend-organization-modal.component';
import { DeleteOrganizationModalComponent } from '../../../shared/components/delete-organization-modal/delete-organization-modal.component';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
type FeedbackRow = Database['public']['Tables']['feedback']['Row'];
type ClientErrorLogRow = Database['public']['Tables']['client_error_log']['Row'];

/** A dedicated page for one org, reached via a `studio/organizations/:id`
 *  route from either StudioOrganizationsComponent's own table rows or
 *  StudioUsersComponent's own user rows (a user's row links to their org's
 *  page, same as it used to open the same org's popup) — replaces the old
 *  OrgDetailModalComponent popup entirely, per the first "convert Studio's
 *  info drill-downs from popups to real pages" pass. Everything here comes
 *  from tables a platform admin already has cross-org read on (profiles/
 *  feedback/client_error_log/organizations, see add_platform_admin) —
 *  deliberately not inventory/task counts, which would need a new RLS
 *  policy this pass doesn't add.
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

    const [{ data: members }, { data: feedback }, { data: errors }, logoUrl] = await Promise.all([
      this.supabase.from('profiles').select('*').eq('organization_id', id).order('full_name'),
      this.supabase.from('feedback').select('*').eq('organization_id', id).order('created_at', { ascending: false }).limit(5),
      this.supabase.from('client_error_log').select('*').eq('organization_id', id).order('created_at', { ascending: false }).limit(5),
      this.siteSettings.loadLogoUrlForOrganization(id)
    ]);

    this.members = members ?? [];
    this.recentFeedback = feedback ?? [];
    this.recentErrors = errors ?? [];
    this.orgLogoUrl = logoUrl;

    if (organization.suspended_by) {
      const { data: suspender } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', organization.suspended_by)
        .maybeSingle();
      this.suspendedByName = suspender ? profileDisplayName(suspender) : null;
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
