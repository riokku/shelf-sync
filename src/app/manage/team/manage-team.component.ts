import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDialog } from '@angular/material/dialog';
import { SupabaseService } from '../../core/supabase.service';
import { NotificationService } from '../../core/notification.service';
import { AuthService, Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { TaskCardComponent } from '../../tasks/task-card/task-card.component';
import { TaskDetailModalComponent } from '../../shared/components/task-detail-modal/task-detail-modal.component';
import { EditProfileModalComponent } from '../../shared/components/edit-profile-modal/edit-profile-modal.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { Database } from '../../shared/models/database.types';
import { TASK_STATUSES, TASK_STATUS_LABELS, TaskStatus } from '../../shared/models/task-status';
import { profileDisplayName } from '../../shared/utils/profile-label';
import { logActivity } from '../../shared/utils/activity-log';

type Task = Database['public']['Tables']['tasks']['Row'];

interface TeamMember {
  profile: Profile;
  tasksByStatus: Record<TaskStatus, Task[]>;
}

@Component({
  selector: 'app-manage-team',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    BreadcrumbsComponent,
    UserAvatarComponent,
    TaskCardComponent,
    EmptyStateComponent
  ],
  templateUrl: './manage-team.component.html',
  styleUrl: './manage-team.component.scss',
})
export class ManageTeamComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  protected authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);

  protected currentUserId: string | null = null;
  /** Approved members only — pendingMembers (below) holds the rest, kept
   *  separate since they haven't got real task/team standing to show yet. */
  private assignableProfiles: Profile[] = [];
  pendingMembers: Profile[] = [];
  isProcessingMembership = false;
  membershipError: string | null = null;

  readonly statuses = TASK_STATUSES;
  readonly statusLabels = TASK_STATUS_LABELS;
  teamMembers: TeamMember[] = [];
  isLoadingTeam = true;

  teamSearchTerm = '';

  /** Matches against full_name (covers first *and* last name — profiles
   *  doesn't split them into separate columns, so a substring match on the
   *  combined name already covers searching by either) and nickname
   *  separately, not just whichever one profileLabel() happens to display. */
  get filteredTeamMembers(): TeamMember[] {
    const term = this.teamSearchTerm.trim().toLowerCase();
    if (!term) {
      return this.teamMembers;
    }
    return this.teamMembers.filter(member => {
      const profile = member.profile;
      return !!profile.full_name?.toLowerCase().includes(term)
        || !!profile.nickname?.toLowerCase().includes(term);
    });
  }

  onTeamSearchChange(value: string) {
    this.teamSearchTerm = value;
  }

  inviteLink: string | null = null;
  inviteLinkCopied = false;

  async ngOnInit() {
    const session = await this.authService.getSession();
    this.currentUserId = session?.user.id ?? null;

    await this.loadProfiles();
    await Promise.all([
      this.loadTeamTasks(),
      this.loadInviteLink()
    ]);
  }

  private async loadProfiles() {
    const { data } = await this.supabase.from('profiles').select('*').order('full_name');
    const profiles = data ?? [];
    this.assignableProfiles = profiles.filter(profile => profile.membership_status === 'approved');
    this.pendingMembers = profiles.filter(profile => profile.membership_status === 'pending');
  }

  private async loadTeamTasks() {
    this.isLoadingTeam = true;

    const { data } = await this.supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false });
    const tasks = data ?? [];

    const tasksByUser = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.assigned_to) {
        continue;
      }
      const existing = tasksByUser.get(task.assigned_to) ?? [];
      existing.push(task);
      tasksByUser.set(task.assigned_to, existing);
    }

    this.teamMembers = this.assignableProfiles.map(profile => {
      const userTasks = tasksByUser.get(profile.id) ?? [];
      return {
        profile,
        tasksByStatus: {
          todo: userTasks.filter(task => task.status === 'todo'),
          in_progress: userTasks.filter(task => task.status === 'in_progress'),
          done: userTasks.filter(task => task.status === 'done')
        }
      };
    });

    this.isLoadingTeam = false;
  }

  private async loadInviteLink() {
    const profile = await this.authService.getProfile();
    if (!profile) {
      return;
    }

    const { data } = await this.supabase
      .from('organizations')
      .select('slug')
      .eq('id', profile.organization_id)
      .single();

    if (data) {
      this.inviteLink = `${window.location.origin}/register?org=${data.slug}`;
    }
  }

  async copyInviteLink() {
    if (!this.inviteLink) {
      return;
    }
    await navigator.clipboard.writeText(this.inviteLink);
    this.inviteLinkCopied = true;
    setTimeout(() => (this.inviteLinkCopied = false), 2000);
  }

  profileLabel(profile: Profile): string {
    return profileDisplayName(profile);
  }

  openEditProfile(profile: Profile) {
    const dialogRef = this.dialog.open(EditProfileModalComponent, {
      data: profile,
      width: 'clamp(75%, 25rem, 60%)',
      maxWidth: '90vw',
      panelClass: 'task-details-dialog'
    });

    dialogRef.afterClosed().subscribe(async (updated: Profile | undefined) => {
      if (!updated) {
        return;
      }
      await this.loadProfiles();
      await this.loadTeamTasks();
    });
  }

  /** Deletes the profile row outright (RLS: admins can delete profiles in
   *  their own organization). Their tasks/checked-out items are left intact
   *  — assigned_to/checked_out_to just go null — only their profile and
   *  their own team-membership disappear. The underlying auth.users login
   *  isn't removed (that needs the Supabase Admin API), but every RLS policy
   *  keyed off current_user_role()/current_user_org_id() now fails closed
   *  for them since their profile row is gone. Same mechanism doubles as
   *  "deny" for a pending join request (see denyMember()) — there's no
   *  separate 'denied' status, a denied request just never becomes a row.
   */
  removeMember(profile: Profile) {
    if (profile.id === this.currentUserId) {
      return;
    }

    this.confirmAndDeleteProfile(profile, {
      title: 'Remove team member?',
      message: `Remove ${profileDisplayName(profile)} from your organization? This can't be undone — they'll lose access immediately.`,
      confirmLabel: 'Remove',
      successMessage: 'Member removed',
      activityMessage: `Removed ${profileDisplayName(profile)} from the team`
    });
  }

  denyMember(profile: Profile) {
    this.confirmAndDeleteProfile(profile, {
      title: 'Deny join request?',
      message: `Deny ${profileDisplayName(profile)}'s request to join your organization? Their account will still exist, but they won't be able to join.`,
      confirmLabel: 'Deny',
      successMessage: 'Request denied',
      activityMessage: `Denied ${profileDisplayName(profile)}'s join request`
    });
  }

  private confirmAndDeleteProfile(
    profile: Profile,
    dialogText: { title: string; message: string; confirmLabel: string; successMessage: string; activityMessage: string }
  ) {
    const { successMessage, activityMessage, ...confirmData } = dialogText;
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: { ...confirmData, danger: true },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) {
        return;
      }

      this.membershipError = null;
      const { error } = await this.supabase.from('profiles').delete().eq('id', profile.id);
      if (error) {
        this.membershipError = `Failed: ${error.message}`;
        return;
      }

      // Best-effort, and after the delete (not before) — the profile row
      // being removed is exactly what this event is reporting on.
      if (this.currentUserId) {
        await logActivity(this.supabase, this.currentUserId, 'member', profile.id, activityMessage);
      }

      await this.loadProfiles();
      await this.loadTeamTasks();
      this.notification.success(successMessage);
    });
  }

  async approveMember(profile: Profile) {
    if (this.isProcessingMembership) {
      return;
    }

    this.isProcessingMembership = true;
    this.membershipError = null;

    const { error } = await this.supabase.rpc('admin_approve_member', { target_id: profile.id });

    this.isProcessingMembership = false;

    if (error) {
      this.membershipError = error.message;
      return;
    }

    await this.loadProfiles();
    await this.loadTeamTasks();
    this.notification.success('Member approved');
  }

  openTaskDetail(task: Task) {
    const dialogRef = this.dialog.open(TaskDetailModalComponent, {
      data: task,
      width: 'clamp(75%, 25rem, 60%)',
      panelClass: 'task-details-dialog'
    });

    dialogRef.afterClosed().subscribe((updated: Task | undefined) => {
      if (!updated) {
        return;
      }
      this.loadTeamTasks();
    });
  }
}
