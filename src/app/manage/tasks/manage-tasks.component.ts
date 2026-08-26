import { Component, DestroyRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule, FormControl, FormGroup, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { NotificationService } from '../../core/notification.service';
import { AuthService, Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { BulkActionToolbarComponent } from '../../shared/components/bulk-action-toolbar/bulk-action-toolbar.component';
import { TaskDetailModalComponent } from '../../shared/components/task-detail-modal/task-detail-modal.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { Database } from '../../shared/models/database.types';
import { TASK_STATUSES, TASK_STATUS_LABELS, TaskStatus } from '../../shared/models/task-status';
import { toIsoDateString, getTodayIsoDate } from '../../shared/utils/date';
import { profileDisplayName, resolveProfileAvatarKey, resolveProfileName } from '../../shared/utils/profile-label';
import { logActivity } from '../../shared/utils/activity-log';
import { subscribeToTableChanges } from '../../shared/utils/realtime';
import { debounce } from '../../shared/utils/debounce';
import { FlashTracker } from '../../shared/utils/flash-tracker';
import { HasUnsavedChanges } from '../../core/guards/unsaved-changes.guard';

type Task = Database['public']['Tables']['tasks']['Row'];
type RelatedItemOption = Pick<Database['public']['Tables']['inventory_items']['Row'], 'id' | 'name'>;

@Component({
  selector: 'app-manage-tasks',
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatDatepickerModule,
    BreadcrumbsComponent,
    UserAvatarComponent,
    EmptyStateComponent,
    BulkActionToolbarComponent
  ],
  templateUrl: './manage-tasks.component.html',
  styleUrl: './manage-tasks.component.scss',
})
export class ManageTasksComponent implements OnInit, HasUnsavedChanges {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  private currentUserId: string | null = null;
  assignableProfiles: Profile[] = [];

  // Which rows should currently show the brief "someone else just changed
  // this" pulse (see shared/utils/flash-tracker.ts and its own
  // shared/styles/_realtime-flash.scss) — read from the template via
  // isFlashing(task.id). Ids land here as raw postgres_changes events come
  // in (see ngOnInit's subscription below) and get flashed once
  // reloadAndFlashChangedTasks()'s reload actually reflects them.
  private flashTracker = new FlashTracker();
  private pendingFlashIds = new Set<string>();

  // Collapses a burst of postgres_changes events (e.g. an accept/decline
  // touching more than one row) into one reload — see debounce()'s own
  // doc comment.
  private readonly debouncedReloadTasks = debounce(() => void this.reloadAndFlashChangedTasks(), 300);

  readonly statuses = TASK_STATUSES;
  readonly statusLabels = TASK_STATUS_LABELS;
  allTasks: Task[] = [];
  isLoadingTasks = true;
  /** Set when loadTasks()'s own query fails — see InventoryComponent's
   *  identical loadError field for the full reasoning. Left in place across
   *  a failed background refresh (e.g. a realtime-triggered reload) rather
   *  than clearing allTasks, so the page keeps showing its last
   *  successfully loaded list instead of going blank. */
  loadError: string | null = null;
  deleteTaskError: string | null = null;

  viewMode: 'create' | 'all' = 'create';

  private isViewMode(value: string | null): value is 'create' | 'all' {
    return value === 'create' || value === 'all';
  }

  // Mirrors SettingsComponent's own setViewMode()/?tab= handling — see its
  // doc comment for the full reasoning. replaceUrl avoids piling up a
  // history entry per tab click.
  //
  // Confirms first if leaving 'create' would lose real unsaved input — a
  // tab switch is plain component state, not a route change, so
  // unsavedChangesGuard (route-level) never sees it; this is that same
  // protection's in-page counterpart. Split into this public gate +
  // applyViewMode() below so applyViewMode() stays directly testable
  // without faking the confirm dialog — same reasoning
  // performBulkDelete()'s own doc comment gives for splitting a
  // confirm-gated action out of its trigger. Not reachable from the
  // ?task= deep link in ngOnInit below, which sets viewMode directly — a
  // freshly loaded page can't have a dirty create form yet.
  setViewMode(mode: 'create' | 'all') {
    if (mode === this.viewMode) {
      return;
    }
    if (!this.hasUnsavedChanges()) {
      this.applyViewMode(mode);
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Leave without saving?',
        message: 'You have unsaved changes on the create form that will be lost if you leave it.',
        confirmLabel: 'Leave',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.applyViewMode(mode);
      }
    });
  }

  private applyViewMode(mode: 'create' | 'all') {
    this.viewMode = mode;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: mode },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  /** Real, would-actually-lose-data input sitting in the create form right
   *  now. Backs both the route-level unsavedChangesGuard (navigating off
   *  this page entirely) and setViewMode() above (switching to All tasks)
   *  — see unsaved-changes.guard.ts's own doc comment for why this checks
   *  the underlying state directly rather than also requiring `viewMode
   *  === 'create'`: the data doesn't stop being unsaved just because a
   *  different tab happens to be showing at the moment.
   *  relatedItemSearchControl (the autocomplete's own search box, not a
   *  submitted field) deliberately isn't checked — typing in it without
   *  picking anything isn't real unsaved data. */
  hasUnsavedChanges(): boolean {
    return this.taskForm.dirty;
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

  taskFilterSearch = '';
  taskFilterAssignee: string | null = null;
  taskFilterStatus: TaskStatus | null = null;
  taskFilterDueBefore: Date | null = null;

  // Excludes pending join requests — the insert policy rejects an
  // unapproved assignee server-side (see require_approved_task_assignee
  // migration), so this just keeps the "Assign to" dropdown from offering
  // someone who can't act on the task yet. assignableProfiles itself stays
  // unfiltered since it also backs the "Team member" filter dropdown
  // (browsing existing tasks, not assigning a new one) and the
  // assignee/pending-transfer label lookups above.
  get approvedAssignableProfiles(): Profile[] {
    return this.assignableProfiles.filter(profile => profile.membership_status === 'approved');
  }

  get hasActiveTaskFilters(): boolean {
    return !!this.taskFilterSearch || !!this.taskFilterAssignee || !!this.taskFilterStatus || !!this.taskFilterDueBefore;
  }

  get filteredAllTasks(): Task[] {
    const dueBefore = toIsoDateString(this.taskFilterDueBefore);
    const searchTerm = this.taskFilterSearch.trim().toLowerCase();

    return this.allTasks.filter(task => {
      if (searchTerm && !task.title.toLowerCase().includes(searchTerm) && !task.id.toLowerCase().includes(searchTerm)) {
        return false;
      }
      if (this.taskFilterAssignee && task.assigned_to !== this.taskFilterAssignee) {
        return false;
      }
      if (this.taskFilterStatus && task.status !== this.taskFilterStatus) {
        return false;
      }
      if (dueBefore && (!task.due_date || task.due_date > dueBefore)) {
        return false;
      }
      return true;
    });
  }

  // Off by default — an explicit "Bulk edit" toggle rather than always
  // showing a checkbox on every row, so ordinary browsing of "All tasks"
  // isn't cluttered with a control most visits never use, same reasoning
  // InventoryComponent's own bulkEditEnabled has. Turning it off clears
  // whatever was selected (see toggleBulkEdit() below) rather than leaving
  // a stale selection sitting around unseen until it's turned back on.
  bulkEditEnabled = false;

  toggleBulkEdit(enabled: boolean) {
    this.bulkEditEnabled = enabled;
    if (!enabled) {
      this.clearTaskSelection();
    }
  }

  // Bulk selection — a plain Set of ids, not scoped to any particular
  // filter state (unlike InventoryComponent's own page-scoped selection):
  // this page has no pagination, and selectedVisibleTaskIds below already
  // derives what's actually shown/acted on by intersecting with
  // filteredAllTasks, so a task that's momentarily filtered out just drops
  // out of that visible count rather than needing an explicit clear on
  // every filter change.
  selectedTaskIds = new Set<string>();
  bulkStatusValue: TaskStatus | null = null;
  isBulkProcessing = false;
  bulkActionError: string | null = null;

  /** What the bulk toolbar actually shows/acts on — selectedTaskIds
   *  intersected with whatever the current filters leave visible. Keeps
   *  the toolbar's "N selected" count honest (a hidden-but-still-selected
   *  task would otherwise silently inflate it) and means a bulk action
   *  never touches a task the user can't currently see and verify. */
  get selectedVisibleTaskIds(): Set<string> {
    const visibleIds = new Set(this.filteredAllTasks.map(task => task.id));
    return new Set([...this.selectedTaskIds].filter(id => visibleIds.has(id)));
  }

  /** Backs the compact "Select all" checkbox up in .tasks-header-row (next
   *  to the Bulk edit toggle) — same shape as InventoryComponent's own
   *  allSelectableItemsSelected/someSelectableItemsSelected, just without a
   *  lock-style "can this row even be selected" filter (tasks have no
   *  such concept), so every filtered task is fair game here. */
  get allVisibleTasksSelected(): boolean {
    return this.filteredAllTasks.length > 0
      && this.filteredAllTasks.every(task => this.selectedTaskIds.has(task.id));
  }

  get someVisibleTasksSelected(): boolean {
    return this.selectedVisibleTaskIds.size > 0 && !this.allVisibleTasksSelected;
  }

  isTaskSelected(taskId: string): boolean {
    return this.selectedTaskIds.has(taskId);
  }

  toggleTaskSelection(taskId: string, checked: boolean) {
    const next = new Set(this.selectedTaskIds);
    if (checked) {
      next.add(taskId);
    } else {
      next.delete(taskId);
    }
    this.selectedTaskIds = next;
  }

  toggleSelectAllFiltered(checked: boolean) {
    const next = new Set(this.selectedTaskIds);
    for (const task of this.filteredAllTasks) {
      if (checked) {
        next.add(task.id);
      } else {
        next.delete(task.id);
      }
    }
    this.selectedTaskIds = next;
  }

  clearTaskSelection() {
    this.selectedTaskIds = new Set();
    this.bulkStatusValue = null;
    this.bulkActionError = null;
  }

  async applyBulkStatusChange() {
    const status = this.bulkStatusValue;
    if (!status || this.isBulkProcessing) {
      return;
    }
    const ids = [...this.selectedVisibleTaskIds];
    if (ids.length === 0) {
      return;
    }

    this.isBulkProcessing = true;
    this.bulkActionError = null;

    const results = await Promise.all(
      ids.map(id => this.supabase.rpc('update_task_status', { task_id: id, new_status: status }))
    );
    const failedCount = results.filter(result => result.error).length;
    const succeededCount = ids.length - failedCount;

    this.isBulkProcessing = false;
    await this.loadTasks();

    if (succeededCount > 0) {
      this.notification.success(`Updated ${succeededCount} task${succeededCount === 1 ? '' : 's'}`);
    }
    // Not clearTaskSelection() — that also nulls bulkActionError, which
    // would erase the message set right below before anyone could read it.
    this.selectedTaskIds = new Set();
    this.bulkStatusValue = null;
    if (failedCount > 0) {
      this.bulkActionError = `${failedCount} of ${ids.length} task${ids.length === 1 ? '' : 's'} couldn't be updated.`;
    }
  }

  applyBulkDelete() {
    const ids = [...this.selectedVisibleTaskIds];
    if (ids.length === 0) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: `Delete ${ids.length} task${ids.length === 1 ? '' : 's'}?`,
        message: `Delete ${ids.length} task${ids.length === 1 ? '' : 's'}? This can't be undone.`,
        confirmLabel: 'Delete',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        void this.performBulkDelete(ids);
      }
    });
  }

  /** The actual delete/tally work, split out of applyBulkDelete() above so
   *  it's directly testable without needing to fake the confirm dialog
   *  itself (no spec in this app fakes MatDialog.open() — every
   *  ConfirmDialogComponent caller elsewhere is only tested up to "was the
   *  dialog opened with the right data"). */
  private async performBulkDelete(ids: string[]) {
    this.isBulkProcessing = true;
    this.bulkActionError = null;

    const results = await Promise.all(ids.map(id => this.supabase.from('tasks').delete().eq('id', id)));
    const failedCount = results.filter(result => result.error).length;
    const succeededCount = ids.length - failedCount;

    this.isBulkProcessing = false;
    await this.loadTasks();

    if (succeededCount > 0) {
      this.notification.success(`Deleted ${succeededCount} task${succeededCount === 1 ? '' : 's'}`);
    }
    this.selectedTaskIds = new Set();
    if (failedCount > 0) {
      this.bulkActionError = `${failedCount} of ${ids.length} task${ids.length === 1 ? '' : 's'} couldn't be deleted.`;
    }
  }

  private relatedItemOptions: RelatedItemOption[] = [];

  // Bound to the <form>'s #taskFormDirective template ref (FormGroupDirective's
  // exportAs is 'ngForm', same as template-driven forms). Needed because
  // FormGroup.reset() only clears each control's value/dirty/touched state —
  // it doesn't know about the *directive's* own `submitted` flag, which the
  // default ErrorStateMatcher also treats as "show errors" regardless of
  // touched. Without resetting via the directive, a freshly-reset form would
  // still show "required" errors for empty fields because `submitted` stuck
  // true from the prior successful submit.
  @ViewChild('taskFormDirective') private taskFormDirective!: FormGroupDirective;

  taskForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    status: new FormControl<'todo' | 'in_progress' | 'done'>('todo', { nonNullable: true }),
    assignedTo: new FormControl<string | null>(null),
    dueDate: new FormControl<Date | null>(null),
    relatedItemName: new FormControl<string | null>(null)
  });

  relatedItemSearchControl = new FormControl('', { nonNullable: true });

  get filteredInventoryItemsForTask(): RelatedItemOption[] {
    const term = this.relatedItemSearchControl.value.trim().toLowerCase();
    if (!term) {
      return this.relatedItemOptions;
    }
    return this.relatedItemOptions.filter(item =>
      item.name.toLowerCase().includes(term) || item.id.toLowerCase().includes(term)
    );
  }

  onRelatedItemSelected(event: MatAutocompleteSelectedEvent) {
    const name = event.option.value as string | null;
    this.taskForm.controls.relatedItemName.setValue(name);
    this.relatedItemSearchControl.setValue(name ?? 'Not item-specific', { emitEvent: false });
  }

  isSavingTask = false;
  taskError: string | null = null;

  async ngOnInit() {
    const session = await this.authService.getSession();
    this.currentUserId = session?.user.id ?? null;

    await this.loadProfiles();
    await Promise.all([
      this.loadTasks(),
      this.loadRelatedItemOptions()
    ]);

    // Reflects the active tab in the URL (?tab=all) — see
    // SettingsComponent's own ?tab= handling for the full reasoning. Read
    // before the ?task= deep link below, so a deep-linked task (which
    // always lives on the "All tasks" tab) still wins over whatever ?tab=
    // says.
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (this.isViewMode(tabParam)) {
      this.viewMode = tabParam;
    }

    // Supports deep links (?task=<id>) — either landed on directly (a
    // manager+ user's own copied link) or arrived via TasksComponent's own
    // ?task= fallback for a task that wasn't in *that* viewer's personal
    // list. Read once from the snapshot, same as InventoryComponent's own
    // ?item= handling. Switches off the create-form default view so
    // closing the dialog doesn't leave the deep-linked task's context
    // behind a blank "create task" form.
    const taskId = this.route.snapshot.queryParamMap.get('task');
    if (taskId) {
      const task = this.allTasks.find(candidate => candidate.id === taskId);
      if (task) {
        this.viewMode = 'all';
        this.openTaskDetail(task);
      }
    }

    // Live updates from other users/tabs — a transfer someone else sends or
    // responds to, or a plain assignee's own status change, shows up here
    // without a manual refresh. Reuses loadTasks() itself (debounced) rather
    // than patching a single row, matching openTaskDetail()'s own reasoning:
    // a transfer can move a task, which a full reload already handles
    // correctly. No client-side organization_id filter — see
    // subscribeToTableChanges()'s own comment for why RLS alone is the right
    // boundary here.
    const channel = subscribeToTableChanges(this.supabase, 'tasks', payload => {
      // DELETE isn't tracked — there's no row left to flash once the reload
      // below completes, so it'd never actually be visible.
      if (payload.eventType !== 'DELETE' && payload.new.id) {
        this.pendingFlashIds.add(payload.new.id);
      }
      this.debouncedReloadTasks();
    });
    this.destroyRef.onDestroy(() => {
      this.debouncedReloadTasks.cancel();
      this.flashTracker.clear();
      void this.supabase.removeChannel(channel);
    });
  }

  isFlashing(taskId: string): boolean {
    return this.flashTracker.isFlashing(taskId);
  }

  private async reloadAndFlashChangedTasks() {
    await this.loadTasks();
    for (const id of this.pendingFlashIds) {
      this.flashTracker.flash(id);
    }
    this.pendingFlashIds.clear();
  }

  private async loadProfiles() {
    const { data } = await this.supabase.from('profiles').select('*').order('full_name');
    this.assignableProfiles = data ?? [];
  }

  private async loadRelatedItemOptions() {
    const { data } = await this.supabase.from('inventory_items').select('id, name').order('name');
    this.relatedItemOptions = data ?? [];
  }

  /** Re-runs loadTasks() after a failed load — the "All tasks" tab's Retry
   *  button handler (see the template's loadError branch). */
  retryLoad() {
    void this.loadTasks();
  }

  private async loadTasks() {
    this.isLoadingTasks = true;

    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false });

    if (error) {
      this.loadError = error.message;
      this.isLoadingTasks = false;
      return;
    }
    this.loadError = null;
    this.allTasks = data ?? [];

    this.isLoadingTasks = false;
  }

  profileLabel(profile: Profile): string {
    return profileDisplayName(profile);
  }

  assigneeLabel(assignedTo: string | null): string {
    return resolveProfileName(assignedTo, this.assignableProfiles) || 'Unassigned';
  }

  assigneeAvatarKey(assignedTo: string | null): string | null {
    return resolveProfileAvatarKey(assignedTo, this.assignableProfiles);
  }

  pendingTransferLabel(task: Task): string | null {
    return task.pending_transfer_to
      ? (resolveProfileName(task.pending_transfer_to, this.assignableProfiles) || 'someone')
      : null;
  }

  createdByLabel(task: Task): string {
    return resolveProfileName(task.created_by, this.assignableProfiles) || 'Unknown user';
  }

  isTaskOverdue(task: Task): boolean {
    return !!task.due_date && task.status !== 'done' && task.due_date < getTodayIsoDate();
  }

  /** Which colored left-rule a row gets — same 3-tier convention
   *  HomeComponent.taskRowSeverity() and TaskCardComponent.severity() both
   *  use: overdue (red) outranks due-today (amber), which outranks 'ok' (a
   *  calm tertiary tone for everything else). */
  taskSeverity(task: Task): 'danger' | 'warn' | 'ok' {
    if (this.isTaskOverdue(task)) {
      return 'danger';
    }
    if (task.due_date === getTodayIsoDate() && task.status !== 'done') {
      return 'warn';
    }
    return 'ok';
  }

  clearTaskFilters() {
    this.taskFilterSearch = '';
    this.taskFilterAssignee = null;
    this.taskFilterStatus = null;
    this.taskFilterDueBefore = null;
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
      this.loadTasks();
    });
  }

  deleteTask(task: Task) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete task?',
        message: `Delete "${task.title}"? This can't be undone.`,
        confirmLabel: 'Delete',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) {
        return;
      }

      this.deleteTaskError = null;
      const { error } = await this.supabase.from('tasks').delete().eq('id', task.id);
      if (error) {
        this.deleteTaskError = `Failed to delete task: ${error.message}`;
        return;
      }

      await this.loadTasks();
      this.notification.success('Task deleted');
    });
  }

  async submitTask() {
    if (this.isSavingTask || !this.currentUserId) {
      return;
    }
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }

    // Captured up front (rather than re-reading this.currentUserId after
    // the await below) so its non-null narrowing from the guard above holds.
    const userId = this.currentUserId;

    this.isSavingTask = true;
    this.taskError = null;

    const value = this.taskForm.getRawValue();
    const { error } = await this.supabase.from('tasks').insert({
      title: value.title,
      description: value.description || null,
      status: value.status,
      assigned_to: value.assignedTo,
      due_date: toIsoDateString(value.dueDate),
      related_item_name: value.relatedItemName,
      created_by: userId
    });

    this.isSavingTask = false;

    if (error) {
      this.taskError = error.message;
      return;
    }

    // Best-effort — a failed log write shouldn't block the task having
    // already been created.
    const assigneeLabel = value.assignedTo ? resolveProfileName(value.assignedTo, this.assignableProfiles) : null;
    await logActivity(
      this.supabase,
      userId,
      'task',
      null,
      assigneeLabel ? `Created task "${value.title}" (assigned to ${assigneeLabel})` : `Created task "${value.title}"`
    );

    this.notification.success('Task created');
    this.taskFormDirective.resetForm();
    this.relatedItemSearchControl.setValue('');
    await this.loadTasks();
  }
}
