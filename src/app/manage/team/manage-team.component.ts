import { Component, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDialog } from '@angular/material/dialog';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService, Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { TaskCardComponent } from '../../tasks/task-card/task-card.component';
import { TaskDetailModalComponent } from '../../shared/components/task-detail-modal/task-detail-modal.component';
import { EditProfileModalComponent } from '../../shared/components/edit-profile-modal/edit-profile-modal.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { Database } from '../../shared/models/database.types';
import { TASK_STATUSES, TASK_STATUS_LABELS, TaskStatus } from '../../shared/models/task-status';
import { profileDisplayName } from '../../shared/utils/profile-label';

type Task = Database['public']['Tables']['tasks']['Row'];

interface TeamMember {
  profile: Profile;
  tasksByStatus: Record<TaskStatus, Task[]>;
}

@Component({
  selector: 'app-manage-team',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    BreadcrumbsComponent,
    UserAvatarComponent,
    TaskCardComponent
  ],
  templateUrl: './manage-team.component.html',
  styleUrl: './manage-team.component.scss',
})
export class ManageTeamComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  protected authService = inject(AuthService);
  private dialog = inject(MatDialog);

  protected currentUserId: string | null = null;
  private assignableProfiles: Profile[] = [];

  readonly statuses = TASK_STATUSES;
  readonly statusLabels = TASK_STATUS_LABELS;
  teamMembers: TeamMember[] = [];
  isLoadingTeam = true;

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
    this.assignableProfiles = data ?? [];
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
   *  for them since their profile row is gone. */
  removeMember(profile: Profile) {
    if (profile.id === this.currentUserId) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Remove team member?',
        message: `Remove ${profileDisplayName(profile)} from your organization? This can't be undone — they'll lose access immediately.`,
        confirmLabel: 'Remove',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) {
        return;
      }

      const { error } = await this.supabase.from('profiles').delete().eq('id', profile.id);
      if (error) {
        alert(`Failed to remove team member: ${error.message}`);
        return;
      }

      await this.loadProfiles();
      await this.loadTeamTasks();
    });
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
