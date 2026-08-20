import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
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
import { profileDisplayName, resolveProfileName } from '../../shared/utils/profile-label';
import { logActivity } from '../../shared/utils/activity-log';
import { formatLastSeen, isProfileOnline } from '../../shared/utils/presence';

type Task = Database['public']['Tables']['tasks']['Row'];

interface TeamMember {
  profile: Profile;
  /** Sorted by due date (earliest/soonest first, undated tasks last) — see
   *  loadTeamTasks()'s query, which already orders it that way, so this
   *  list doesn't need its own sort. No longer grouped by status; each
   *  member's expanded accordion panel just shows one flat "Tasks" list. */
  tasks: Task[];
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
    MatSlideToggleModule,
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
  private destroyRef = inject(DestroyRef);

  protected currentUserId: string | null = null;
  /** Approved members only — pendingMembers (below) holds the rest, kept
   *  separate since they haven't got real task/team standing to show yet. */
  private assignableProfiles: Profile[] = [];
  pendingMembers: Profile[] = [];
  isProcessingMembership = false;
  membershipError: string | null = null;

  teamMembers: TeamMember[] = [];
  isLoadingTeam = true;

  teamSearchTerm = '';
  showOnlineOnly = false;

  /** Matches against full_name (covers first *and* last name — profiles
   *  doesn't split them into separate columns, so a substring match on the
   *  combined name already covers searching by either) and nickname
   *  separately, not just whichever one profileLabel() happens to display —
   *  AND'd with showOnlineOnly (isOnline(), same helper the per-member dot/
   *  "Online" text already use) when that toggle is on, rather than two
   *  independent passes. */
  get filteredTeamMembers(): TeamMember[] {
    const term = this.teamSearchTerm.trim().toLowerCase();
    return this.teamMembers.filter(member => {
      const profile = member.profile;
      const matchesSearch = !term
        || !!profile.full_name?.toLowerCase().includes(term)
        || !!profile.nickname?.toLowerCase().includes(term);
      const matchesOnlineFilter = !this.showOnlineOnly || this.isOnline(profile);
      return matchesSearch && matchesOnlineFilter;
    });
  }

  /** Distinguishes "nothing matches the search" from "nobody's online right
   *  now" (and the combination of both) rather than one flat message for
   *  every reason filteredTeamMembers could come up empty. */
  get emptyTeamMessage(): string {
    if (this.teamSearchTerm && this.showOnlineOnly) {
      return 'No online team members match your search.';
    }
    if (this.showOnlineOnly) {
      return 'No team members are online right now.';
    }
    return 'No team members match your search.';
  }

  onTeamSearchChange(value: string) {
    this.teamSearchTerm = value;
  }

  toggleShowOnlineOnly(checked: boolean) {
    this.showOnlineOnly = checked;
  }

  clearTeamFilters() {
    this.teamSearchTerm = '';
    this.showOnlineOnly = false;
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

    // Keeps "online now"/"last seen" current while this page stays open —
    // a narrower poll than re-running loadProfiles()/loadTeamTasks() (which
    // together toggle isLoadingTeam, swapping the whole accordion for a
    // spinner) so it can run in the background without any visible flicker.
    const presenceIntervalId = window.setInterval(() => void this.refreshPresence(), 30_000);
    this.destroyRef.onDestroy(() => window.clearInterval(presenceIntervalId));
  }

  /** Patches last_active_at onto the already-loaded profile objects in
   *  place rather than reassigning teamMembers/pendingMembers — cheap
   *  (one narrow query, just id + last_active_at) and doesn't disturb
   *  anything else on the page (search term, expanded accordion panels,
   *  in-flight edits) the way a full reload would. */
  private async refreshPresence() {
    const { data } = await this.supabase.from('profiles').select('id, last_active_at');
    if (!data) {
      return;
    }
    const lastActiveById = new Map(data.map(row => [row.id, row.last_active_at]));
    for (const member of this.teamMembers) {
      const lastActiveAt = lastActiveById.get(member.profile.id);
      if (lastActiveAt !== undefined) {
        member.profile.last_active_at = lastActiveAt;
      }
    }
    for (const profile of this.pendingMembers) {
      const lastActiveAt = lastActiveById.get(profile.id);
      if (lastActiveAt !== undefined) {
        profile.last_active_at = lastActiveAt;
      }
    }
  }

  isOnline(profile: Profile): boolean {
    return isProfileOnline(profile.last_active_at);
  }

  lastSeenLabel(profile: Profile): string {
    return formatLastSeen(profile.last_active_at);
  }

  /** "Online" or a "Last seen …" string — always some text, unlike the
   *  online dot (shown only when online), so a row's role badge lines up
   *  at the same spot whether the member next to it is online or not,
   *  rather than that text just disappearing for online members. */
  presenceLabel(profile: Profile): string {
    return this.isOnline(profile) ? 'Online' : this.lastSeenLabel(profile);
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

    this.teamMembers = this.assignableProfiles.map(profile => ({
      profile,
      tasks: tasksByUser.get(profile.id) ?? []
    }));

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

  createdByLabel(task: Task): string {
    return resolveProfileName(task.created_by, this.assignableProfiles) || 'Unknown user';
  }

  openEditProfile(profile: Profile) {
    // Narrower than the app's usual 'clamp(75%, 25rem, 60%)' small-dialog
    // width (which, with min > max, actually always resolves to a flat
    // 60vw) — this form is just four stacked full-width fields, so it
    // doesn't need anywhere near that much room. Matches the width other
    // simple single-column dialogs elsewhere already use (e.g.
    // RequestRetirementModalComponent).
    const dialogRef = this.dialog.open(EditProfileModalComponent, {
      data: profile,
      width: 'clamp(24rem, 45vw, 30rem)',
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
