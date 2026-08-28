import { Component, DestroyRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { SupabaseService } from '../../core/supabase.service';
import { NotificationService } from '../../core/notification.service';
import { AuthService, Profile } from '../../core/auth.service';
import { HasUnsavedChanges } from '../../core/guards/unsaved-changes.guard';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { TaskCardComponent } from '../../tasks/task-card/task-card.component';
import { TaskDetailModalComponent } from '../../shared/components/task-detail-modal/task-detail-modal.component';
import { EditProfileModalComponent } from '../../shared/components/edit-profile-modal/edit-profile-modal.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { BulkActionToolbarComponent } from '../../shared/components/bulk-action-toolbar/bulk-action-toolbar.component';
import { Database } from '../../shared/models/database.types';
import { profileDisplayName, resolveProfileName } from '../../shared/utils/profile-label';
import { logActivity } from '../../shared/utils/activity-log';
import { formatLastSeen, isProfileOnline } from '../../shared/utils/presence';
import { subscribeToTableChanges } from '../../shared/utils/realtime';
import { debounce } from '../../shared/utils/debounce';
import { FlashTracker } from '../../shared/utils/flash-tracker';

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
    MatCheckboxModule,
    BreadcrumbsComponent,
    PageHeaderComponent,
    UserAvatarComponent,
    TaskCardComponent,
    TaskDetailModalComponent,
    EmptyStateComponent,
    BulkActionToolbarComponent
  ],
  templateUrl: './manage-team.component.html',
  styleUrl: './manage-team.component.scss',
})
export class ManageTeamComponent implements OnInit, HasUnsavedChanges {
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

  // Bulk selection — scoped to pendingMembers only (the "Current team"
  // accordion isn't part of this feature; removing multiple active members
  // in bulk is a much more sensitive operation, and its expansion-panel
  // layout doesn't fit a row-checkbox UX the way this plain list does).
  // No search/filter on this section, so — unlike ManageTasksComponent's
  // own selectedVisibleTaskIds — there's nothing to intersect against here;
  // a plain Set is enough. Reuses isProcessingMembership/membershipError
  // rather than its own separate flag/error field, since this component
  // already treats "a membership action is in flight" as one thing
  // regardless of whether it's a single action or a bulk one.
  selectedPendingMemberIds = new Set<string>();

  teamMembers: TeamMember[] = [];
  isLoadingTeam = true;
  /** Repeat-count for the loading-state skeleton accordion rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3, 4];
  /** Set when loadProfiles()'s own query fails — see InventoryComponent's
   *  identical loadError field for the full reasoning. */
  loadError: string | null = null;

  /** Set by openTaskDetail() below — while non-null, the template swaps the
   *  whole team list out for this task's detail view instead, with a Back
   *  button (right below the breadcrumbs) returning here. Mirrors
   *  ManageInventoryComponent.selectedItemDetail's own doc comment — no
   *  ?task= URL sync here, unlike TasksComponent/ManageTasksComponent's own
   *  task views, since opening a task from here never supported a deep link
   *  before either. */
  selectedTask: Task | null = null;
  /** Mirrors TaskDetailModalComponent's own relatedItemViewChange output —
   *  see TasksComponent.viewingRelatedItem's own doc comment for the full
   *  reasoning (redirects this page's own back-row button rather than
   *  hiding it, so it stays in one consistent spot below the breadcrumbs). */
  viewingRelatedItem = false;
  /** Only ever populated while selectedTask is set (see the template's own
   *  @if) — queried so the back-row button can reach closeRelatedItem()
   *  directly; see viewingRelatedItem's own doc comment. */
  @ViewChild(TaskDetailModalComponent) taskDetailModal?: TaskDetailModalComponent;

  /** Bound to app-breadcrumbs' own [labelOverride] — see
   *  ManageTasksComponent.breadcrumbLabel's own doc comment for the full
   *  reasoning (identical shape: this route's own fixed "Manage" parent
   *  leaves no second slot free, so the static "Team" label is what gets
   *  replaced by the task's own title, or the related item's name while
   *  viewingRelatedItem). */
  get breadcrumbLabel(): string | undefined {
    if (!this.selectedTask) {
      return undefined;
    }
    if (this.viewingRelatedItem) {
      return this.taskDetailModal?.selectedRelatedItem?.name;
    }
    return this.selectedTask.title;
  }

  /** Bound to app-breadcrumbs' own [secondaryLabel] — see
   *  ManageTasksComponent.breadcrumbSecondaryLabel's own doc comment for the
   *  full reasoning; identical shape. */
  get breadcrumbSecondaryLabel(): string | undefined {
    return this.viewingRelatedItem ? this.selectedTask?.title : undefined;
  }

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

  // Which rows should currently show the brief "someone else just changed
  // this" pulse (see shared/utils/flash-tracker.ts and its own
  // shared/styles/_realtime-flash.scss) — read from the template via
  // isFlashing(task.id). Ids land here as raw postgres_changes events come
  // in (see ngOnInit's subscription below) and get flashed once
  // reloadAndFlashChangedTeamTasks()'s reload actually reflects them.
  private flashTracker = new FlashTracker();
  private pendingFlashIds = new Set<string>();

  // Collapses a burst of postgres_changes events (e.g. an accept/decline
  // touching more than one row) into one reload — see debounce()'s own
  // doc comment.
  private readonly debouncedReloadTeamTasks = debounce(() => void this.reloadAndFlashChangedTeamTasks(), 300);

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

    // Live updates from other users/tabs — a status change, transfer, or
    // deletion elsewhere shows up in each member's task list without a
    // manual refresh. Reuses loadTeamTasks() itself (debounced), same
    // reasoning as TasksComponent/ManageTasksComponent. Deliberately kept
    // separate from the presence-poll interval above rather than merged
    // into it — that code is a distinct, already-settled concern (see its
    // own comment) this feature shouldn't disturb. No client-side
    // organization_id filter — see subscribeToTableChanges()'s own comment
    // for why RLS alone is the right boundary here.
    const channel = subscribeToTableChanges(this.supabase, 'tasks', payload => {
      // DELETE isn't tracked — there's no row left to flash once the reload
      // below completes, so it'd never actually be visible.
      if (payload.eventType !== 'DELETE' && payload.new.id) {
        this.pendingFlashIds.add(payload.new.id);
      }
      this.debouncedReloadTeamTasks();
    });
    this.destroyRef.onDestroy(() => {
      this.debouncedReloadTeamTasks.cancel();
      this.flashTracker.clear();
      void this.supabase.removeChannel(channel);
    });
  }

  isFlashing(taskId: string): boolean {
    return this.flashTracker.isFlashing(taskId);
  }

  private async reloadAndFlashChangedTeamTasks() {
    await this.loadTeamTasks();
    for (const id of this.pendingFlashIds) {
      this.flashTracker.flash(id);
    }
    this.pendingFlashIds.clear();
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

  /** Re-runs both loadProfiles() and loadTeamTasks() after a failed load —
   *  the "Current team" section's Retry button handler (see the template's
   *  loadError branch). Both, not just loadProfiles(), since teamMembers is
   *  itself derived from assignableProfiles inside loadTeamTasks(). */
  retryLoad() {
    void (async () => {
      await this.loadProfiles();
      await this.loadTeamTasks();
    })();
  }

  private async loadProfiles() {
    const { data, error } = await this.supabase.from('profiles').select('*').order('full_name');
    if (error) {
      this.loadError = error.message;
      return;
    }
    this.loadError = null;
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

  isPendingSelected(profileId: string): boolean {
    return this.selectedPendingMemberIds.has(profileId);
  }

  togglePendingSelection(profileId: string, checked: boolean) {
    const next = new Set(this.selectedPendingMemberIds);
    if (checked) {
      next.add(profileId);
    } else {
      next.delete(profileId);
    }
    this.selectedPendingMemberIds = next;
  }

  toggleSelectAllPending(checked: boolean) {
    const next = new Set(this.selectedPendingMemberIds);
    for (const profile of this.pendingMembers) {
      if (checked) {
        next.add(profile.id);
      } else {
        next.delete(profile.id);
      }
    }
    this.selectedPendingMemberIds = next;
  }

  clearPendingSelection() {
    this.selectedPendingMemberIds = new Set();
    this.membershipError = null;
  }

  async applyBulkApprove() {
    if (this.isProcessingMembership) {
      return;
    }
    const ids = [...this.selectedPendingMemberIds];
    if (ids.length === 0) {
      return;
    }

    this.isProcessingMembership = true;
    this.membershipError = null;

    const results = await Promise.all(ids.map(id => this.supabase.rpc('admin_approve_member', { target_id: id })));
    const failedCount = results.filter(result => result.error).length;
    const succeededCount = ids.length - failedCount;

    this.isProcessingMembership = false;
    await this.loadProfiles();
    await this.loadTeamTasks();

    if (succeededCount > 0) {
      this.notification.success(`Approved ${succeededCount} member${succeededCount === 1 ? '' : 's'}`);
    }
    // Not clearPendingSelection() — that also nulls membershipError, which
    // would erase the message set right below before anyone could read it.
    this.selectedPendingMemberIds = new Set();
    if (failedCount > 0) {
      this.membershipError = `${failedCount} of ${ids.length} member${ids.length === 1 ? '' : 's'} couldn't be approved.`;
    }
  }

  applyBulkDeny() {
    if (this.isProcessingMembership) {
      return;
    }
    const ids = [...this.selectedPendingMemberIds];
    if (ids.length === 0) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: `Deny ${ids.length} join request${ids.length === 1 ? '' : 's'}?`,
        message: `Deny ${ids.length} join request${ids.length === 1 ? '' : 's'}? Their account(s) will still exist, but they won't be able to join.`,
        confirmLabel: 'Deny',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        void this.performBulkDeny(ids);
      }
    });
  }

  /** The actual deny/tally work, split out of applyBulkDeny() above so it's
   *  directly testable without needing to fake the confirm dialog itself
   *  (no spec in this app fakes MatDialog.open() — every
   *  ConfirmDialogComponent caller elsewhere is only tested up to "was the
   *  dialog opened with the right data"). Mirrors confirmAndDeleteProfile()'s
   *  single-deny shape: a raw profiles delete (no RPC exists for this —
   *  there's no separate "denied" status, denying just never lets the row
   *  become an approved member) plus a best-effort per-profile activity log. */
  private async performBulkDeny(ids: string[]) {
    this.isProcessingMembership = true;
    this.membershipError = null;

    const results = await Promise.all(ids.map(async id => {
      const { error } = await this.supabase.from('profiles').delete().eq('id', id);
      if (!error && this.currentUserId) {
        const profile = this.pendingMembers.find(candidate => candidate.id === id);
        const label = profile ? profileDisplayName(profile) : 'a user';
        await logActivity(this.supabase, this.currentUserId, 'member', id, `Denied ${label}'s join request`);
      }
      return { error };
    }));
    const failedCount = results.filter(result => result.error).length;
    const succeededCount = ids.length - failedCount;

    this.isProcessingMembership = false;
    await this.loadProfiles();
    await this.loadTeamTasks();

    if (succeededCount > 0) {
      this.notification.success(`Denied ${succeededCount} join request${succeededCount === 1 ? '' : 's'}`);
    }
    this.selectedPendingMemberIds = new Set();
    if (failedCount > 0) {
      this.membershipError = `${failedCount} of ${ids.length} request${ids.length === 1 ? '' : 's'} couldn't be denied.`;
    }
  }

  openTaskDetail(task: Task) {
    this.selectedTask = task;
  }

  /** The detail view's own Back button, and (back) handler for
   *  TaskDetailModalComponent itself — see closeTaskDetail's own reasoning
   *  in TasksComponent, mirrored here without the URL sync it doesn't need. */
  closeTaskDetail(changed = false) {
    this.selectedTask = null;
    this.viewingRelatedItem = false;
    if (changed) {
      void this.loadTeamTasks();
    }
  }

  /** The single back-row button's own click handler — see
   *  viewingRelatedItem's own doc comment for why this branches instead of
   *  binding closeTaskDetail() directly. */
  handleBackClick() {
    if (this.viewingRelatedItem) {
      this.taskDetailModal?.closeRelatedItem();
    } else {
      this.closeTaskDetail();
    }
  }

  /** Real, would-actually-lose-data input sitting in a related-item edit
   *  right now — see TasksComponent.hasUnsavedChanges()'s own doc comment
   *  for the identical reasoning. Backs both the route-level
   *  unsavedChangesGuard (navigating off this page entirely) and the
   *  beforeunload listener below. */
  hasUnsavedChanges(): boolean {
    return this.taskDetailModal?.hasUnsavedChanges() ?? false;
  }

  /** CanDeactivate guards never run for a tab close/refresh — only this
   *  catches that case. Modern browsers ignore the custom message and show
   *  their own generic "leave site?" wording; setting returnValue is what
   *  actually triggers that prompt at all (an empty/unset handler does
   *  nothing). */
  @HostListener('window:beforeunload', ['$event'])
  confirmBeforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
