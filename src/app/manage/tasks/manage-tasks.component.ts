import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule, FormControl, FormGroup, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { NotificationService } from '../../core/notification.service';
import { AuthService, Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar/user-avatar.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { TaskDetailModalComponent } from '../../shared/components/task-detail-modal/task-detail-modal.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { Database } from '../../shared/models/database.types';
import { TASK_STATUSES, TASK_STATUS_LABELS, TaskStatus } from '../../shared/models/task-status';
import { toIsoDateString, getTodayIsoDate } from '../../shared/utils/date';
import { profileDisplayName, resolveProfileAvatarKey, resolveProfileName } from '../../shared/utils/profile-label';
import { logActivity } from '../../shared/utils/activity-log';

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
    MatIconModule,
    MatProgressSpinnerModule,
    MatDatepickerModule,
    BreadcrumbsComponent,
    UserAvatarComponent,
    EmptyStateComponent
  ],
  templateUrl: './manage-tasks.component.html',
  styleUrl: './manage-tasks.component.scss',
})
export class ManageTasksComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);
  private route = inject(ActivatedRoute);

  private currentUserId: string | null = null;
  assignableProfiles: Profile[] = [];

  readonly statuses = TASK_STATUSES;
  readonly statusLabels = TASK_STATUS_LABELS;
  allTasks: Task[] = [];
  isLoadingTasks = true;
  deleteTaskError: string | null = null;

  viewMode: 'create' | 'all' = 'create';
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
  taskSaved = false;

  async ngOnInit() {
    const session = await this.authService.getSession();
    this.currentUserId = session?.user.id ?? null;

    await this.loadProfiles();
    await Promise.all([
      this.loadTasks(),
      this.loadRelatedItemOptions()
    ]);

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
  }

  private async loadProfiles() {
    const { data } = await this.supabase.from('profiles').select('*').order('full_name');
    this.assignableProfiles = data ?? [];
  }

  private async loadRelatedItemOptions() {
    const { data } = await this.supabase.from('inventory_items').select('id, name').order('name');
    this.relatedItemOptions = data ?? [];
  }

  private async loadTasks() {
    this.isLoadingTasks = true;

    const { data } = await this.supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false });
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
    this.taskSaved = false;

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

    this.taskSaved = true;
    this.taskFormDirective.resetForm();
    this.relatedItemSearchControl.setValue('');
    await this.loadTasks();
  }
}
