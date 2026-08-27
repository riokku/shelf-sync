import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatDialog, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { NotificationService } from '../../../core/notification.service';
import { Profile } from '../../../core/auth.service';
import { Database } from '../../../shared/models/database.types';
import { profileDisplayName } from '../../../shared/utils/profile-label';
import { isProfileOnline, formatLastSeen } from '../../../shared/utils/presence';
import { FEEDBACK_STATUS_LABELS, FEEDBACK_TYPE_LABELS, FeedbackStatus, FeedbackType } from '../../../shared/models/feedback';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { SuspendOrganizationModalComponent } from '../../../shared/components/suspend-organization-modal/suspend-organization-modal.component';
import { DeleteOrganizationModalComponent } from '../../../shared/components/delete-organization-modal/delete-organization-modal.component';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
type FeedbackRow = Database['public']['Tables']['feedback']['Row'];
type ClientErrorLogRow = Database['public']['Tables']['client_error_log']['Row'];

export interface OrgDetailModalData {
  organization: OrganizationRow;
}

/** Support/debugging drill-down for a single org from StudioOrganizationsComponent's
 *  own flat table — everything here comes from tables a platform admin already has
 *  cross-org read on (profiles/feedback/client_error_log, see add_platform_admin),
 *  deliberately not inventory_items/tasks counts, which would need a new RLS policy
 *  this pass doesn't add. Self-loaded in ngOnInit() from just the org row passed in,
 *  same "caller hands over the minimum, this component fetches its own supplementary
 *  data" convention ModalTableComponent's own reservations summary already uses.
 *
 *  Also where a platform admin actually acts on an org — suspend/unsuspend
 *  (an immediate, reversible access block for abuse/non-payment, see
 *  add_platform_org_suspension_and_retirement) and retire/restore (the same
 *  soft-delete manage/danger-zone's own "Delete organization" already uses,
 *  just triggerable on any org rather than only that org's own admin on
 *  their own — labeled "Retire" here specifically, a distinct word for a
 *  distinct trigger: a concluded contract, not abuse). Every action mutates
 *  `data.organization` in place on success rather than closing/reopening
 *  the dialog or emitting an event back to the caller — the exact same
 *  "shared object reference" convention InventoryComponent.showDetails()
 *  already relies on for ModalTableComponent's own edits, since
 *  StudioOrganizationsComponent/StudioUsersComponent both hand this
 *  component the very row object sitting in their own list.
 *
 *  Deliberately imports the individual MatDialogTitle/MatDialogContent/
 *  MatDialogActions directives rather than the full MatDialogModule —
 *  MatDialogModule's own NgModule declaration carries `providers:
 *  [MatDialog]`, which (for a standalone component with further dialogs of
 *  its own to open, unlike a plain leaf dialog like
 *  DeleteOrganizationModalComponent) creates a second, module-scoped
 *  MatDialog instance shadowing the app-wide root one for this component's
 *  own `inject(MatDialog)` — harmless in the running app (each dialog still
 *  opens/tracks itself correctly) but breaks spying on the root instance
 *  from a test, which is what actually surfaced this. */
@Component({
  selector: 'app-org-detail-modal',
  imports: [DatePipe, MatDialogTitle, MatDialogContent, MatDialogActions, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './org-detail-modal.component.html',
  styleUrl: './org-detail-modal.component.scss',
})
export class OrgDetailModalComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);
  dialogRef = inject(MatDialogRef<OrgDetailModalComponent>);
  data = inject<OrgDetailModalData>(MAT_DIALOG_DATA);

  readonly feedbackTypeLabels = FEEDBACK_TYPE_LABELS;
  readonly feedbackStatusLabels = FEEDBACK_STATUS_LABELS;

  isLoading = true;
  members: Profile[] = [];
  recentFeedback: FeedbackRow[] = [];
  recentErrors: ClientErrorLogRow[] = [];

  /** Resolved separately from members above — the platform admin who
   *  suspended this org almost certainly isn't one of its own members. */
  suspendedByName: string | null = null;

  isActionPending = false;
  actionError: string | null = null;

  get organization(): OrganizationRow {
    return this.data.organization;
  }

  get isRetired(): boolean {
    return !!this.organization.deleted_at;
  }

  get isSuspended(): boolean {
    return !!this.organization.suspended_at;
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
    const orgId = this.organization.id;

    const [{ data: members }, { data: feedback }, { data: errors }] = await Promise.all([
      this.supabase.from('profiles').select('*').eq('organization_id', orgId).order('full_name'),
      this.supabase.from('feedback').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5),
      this.supabase.from('client_error_log').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5)
    ]);

    this.members = members ?? [];
    this.recentFeedback = feedback ?? [];
    this.recentErrors = errors ?? [];

    if (this.organization.suspended_by) {
      const { data: suspender } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', this.organization.suspended_by)
        .maybeSingle();
      this.suspendedByName = suspender ? profileDisplayName(suspender) : null;
    }

    this.isLoading = false;
  }

  suspendOrganization() {
    if (this.isActionPending) {
      return;
    }
    const dialogRef = this.dialog.open(SuspendOrganizationModalComponent, {
      data: { organizationName: this.organization.name },
      width: 'clamp(28rem, 50vw, 34rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe(async (reason?: string) => {
      if (!reason) {
        return;
      }
      this.isActionPending = true;
      this.actionError = null;

      const { error } = await this.supabase.rpc('platform_suspend_organization', { org_id: this.organization.id, reason });

      this.isActionPending = false;
      if (error) {
        this.actionError = error.message;
        return;
      }

      Object.assign(this.data.organization, { suspended_at: new Date().toISOString(), suspension_reason: reason });
      this.suspendedByName = 'you';
      this.notification.success('Organization suspended.');
    });
  }

  unsuspendOrganization() {
    if (this.isActionPending) {
      return;
    }
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Unsuspend organization?',
        message: `${this.organization.name} will immediately regain access to ShelfSync.`,
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

      const { error } = await this.supabase.rpc('platform_unsuspend_organization', { org_id: this.organization.id });

      this.isActionPending = false;
      if (error) {
        this.actionError = error.message;
        return;
      }

      Object.assign(this.data.organization, { suspended_at: null, suspended_by: null, suspension_reason: null });
      this.suspendedByName = null;
      this.notification.success('Organization unsuspended.');
    });
  }

  retireOrganization() {
    if (this.isActionPending) {
      return;
    }
    const dialogRef = this.dialog.open(DeleteOrganizationModalComponent, {
      data: { organizationName: this.organization.name },
      width: 'clamp(28rem, 50vw, 34rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe(async (confirmed?: boolean) => {
      if (!confirmed) {
        return;
      }
      this.isActionPending = true;
      this.actionError = null;

      const { error } = await this.supabase.rpc('platform_retire_organization', { org_id: this.organization.id });

      this.isActionPending = false;
      if (error) {
        this.actionError = error.message;
        return;
      }

      Object.assign(this.data.organization, { deleted_at: new Date().toISOString() });
      this.notification.success('Organization retired.');
    });
  }

  restoreOrganization() {
    if (this.isActionPending) {
      return;
    }
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Restore organization?',
        message: `${this.organization.name} will no longer be scheduled for deletion, and its team will regain access.`,
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

      const { error } = await this.supabase.rpc('platform_restore_organization', { org_id: this.organization.id });

      this.isActionPending = false;
      if (error) {
        this.actionError = error.message;
        return;
      }

      Object.assign(this.data.organization, { deleted_at: null });
      this.notification.success('Organization restored.');
    });
  }

  close() {
    this.dialogRef.close();
  }
}
