import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { Profile } from '../../../core/auth.service';
import { Database } from '../../../shared/models/database.types';
import { profileDisplayName } from '../../../shared/utils/profile-label';
import { isProfileOnline, formatLastSeen } from '../../../shared/utils/presence';
import { FEEDBACK_STATUS_LABELS, FEEDBACK_TYPE_LABELS, FeedbackStatus, FeedbackType } from '../../../shared/models/feedback';

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
 *  data" convention ModalTableComponent's own reservations summary already uses. */
@Component({
  selector: 'app-org-detail-modal',
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './org-detail-modal.component.html',
  styleUrl: './org-detail-modal.component.scss',
})
export class OrgDetailModalComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  dialogRef = inject(MatDialogRef<OrgDetailModalComponent>);
  data = inject<OrgDetailModalData>(MAT_DIALOG_DATA);

  readonly feedbackTypeLabels = FEEDBACK_TYPE_LABELS;
  readonly feedbackStatusLabels = FEEDBACK_STATUS_LABELS;

  isLoading = true;
  members: Profile[] = [];
  recentFeedback: FeedbackRow[] = [];
  recentErrors: ClientErrorLogRow[] = [];

  get organization(): OrganizationRow {
    return this.data.organization;
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
    this.isLoading = false;
  }

  close() {
    this.dialogRef.close();
  }
}
