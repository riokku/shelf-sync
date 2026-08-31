import { Component, EventEmitter, Input, OnInit, Output, ViewChild, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogContent, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { NotificationService } from '../../../core/notification.service';
import { AuthService, Profile } from '../../../core/auth.service';
import { Database } from '../../models/database.types';
import { InventoryItem } from '../../models/inventory-item.model';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '../../models/task-status';
import { toInventoryItem } from '../../utils/inventory-item.mapper';
import { resolveProfileName } from '../../utils/profile-label';
import { loadInventoryImagesByItemId } from '../../utils/inventory-item-images';
import { loadInventoryActivityByItemId } from '../../utils/inventory-item-activity';
import { getTodayIsoDate } from '../../utils/date';
import { confirmLeaveWithoutSaving } from '../../utils/confirm-leave';
import { ModalTableComponent } from '../modal-table/modal-table.component';
import { PageHeaderComponent } from '../page-header/page-header.component';
import { TransferTaskModalComponent } from '../transfer-task-modal/transfer-task-modal.component';

type Task = Database['public']['Tables']['tasks']['Row'];

@Component({
  selector: 'app-task-detail-modal',
  imports: [
    DatePipe,
    FormsModule,
    // Just the one directive still needed (mat-dialog-content, for its
    // CdkScrollable host + CSS hook — see the padding/overflow override in
    // this component's own stylesheet) rather than the whole
    // MatDialogModule — mat-dialog-title/-actions are no longer used
    // anywhere in this template, replaced by app-page-header below. Same
    // "avoid importing provider baggage this component doesn't need"
    // reasoning ModalTableComponent's own identical switch already
    // documents.
    MatDialogContent,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    ModalTableComponent,
    PageHeaderComponent
  ],
  templateUrl: './task-detail-modal.component.html',
  styleUrl: './task-detail-modal.component.scss',
})
export class TaskDetailModalComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  protected authService = inject(AuthService);
  // The plain service, not the whole MatDialogModule (see this component's
  // own imports array comment above) — importing that module would provide
  // a second MatDialog instance that shadows the root singleton for this
  // exact inject() call, the dialog-in-dialog footgun CLAUDE.md documents.
  private dialog = inject(MatDialog);
  // Both optional — every real caller now embeds this component inline with
  // a plain [task] binding (TasksComponent, ManageTeamComponent,
  // ManageTasksComponent — see each's own doc comment) rather than opening
  // it as its own top-level MatDialog, so neither token resolves to
  // anything in practice any more. Kept (rather than dropped in favor of a
  // plain required @Input()) so this can still be opened as a real dialog
  // if some future caller wants that, and so the existing spec's
  // MAT_DIALOG_DATA/MatDialogRef-based TestBed setup keeps working
  // unmodified — same shape ModalTableComponent's own dialogRef/data
  // already establishes.
  dialogRef = inject(MatDialogRef<TaskDetailModalComponent>, { optional: true });
  private dialogData = inject<Task | null>(MAT_DIALOG_DATA, { optional: true });
  /** The task being shown. Defaults to whatever MAT_DIALOG_DATA resolved to
   *  (null when there's no enclosing dialog) — an inline caller's [task]
   *  binding overwrites this before ngOnInit runs, same as any other
   *  @Input(). */
  @Input() task: Task = this.dialogData as Task;
  /** Emits once this task's own detail view should close — true when
   *  something about the task actually changed (a status save, or any
   *  transfer action), so the caller knows to reload its own list; false
   *  for a plain "leave without changing anything" (mirrors each of this
   *  component's own dialogRef.close(...) calls from when this was a real
   *  dialog — see this file's own git history — just via an @Output()
   *  instead, now that no real caller opens this as a dialog any more). */
  @Output() back = new EventEmitter<boolean>();
  /** Mirrors whether selectedRelatedItem is set — lets whichever host page
   *  embeds this component (TasksComponent/ManageTasksComponent/
   *  ManageTeamComponent, all three of which render one "Back" row above
   *  this component, in the same spot below the breadcrumbs, for as long as
   *  a task is selected) redirect that single button's click to
   *  closeRelatedItem() instead of the host's own "leave the task" handler
   *  while this related-item view is showing — see selectedRelatedItem's own
   *  doc comment for why the button itself lives up there rather than in
   *  ModalTableComponent. */
  @Output() relatedItemViewChange = new EventEmitter<boolean>();

  readonly statusLabels = TASK_STATUS_LABELS;
  readonly statuses = TASK_STATUSES;

  // Set in ngOnInit(), not here — a field initializer runs during
  // construction, which is *before* Angular applies an inline caller's
  // [task] binding (that only happens between construction and
  // ngOnChanges/ngOnInit). Reading this.task.status this early crashed the
  // component outright for every real caller (TasksComponent/
  // ManageTasksComponent/ManageTeamComponent), all of which now provide
  // `task` via a plain @Input() rather than MAT_DIALOG_DATA — this.task
  // was still null (dialogData's own default) when this line ran during
  // construction, throwing "Cannot read properties of null (reading
  // 'status')" and leaving the whole detail view blank.
  selectedStatus!: Task['status'];
  isSaving = false;
  error: string | null = null;

  isLoadingRelatedItem = false;
  relatedItemError: string | null = null;
  /** Set by openRelatedItem() below — while non-null, the template swaps
   *  this dialog's own task-detail content out for the item's detail view
   *  instead (embedded inline via ModalTableComponent's own [data] input —
   *  see its own doc comment). Avoids stacking a second dialog on top of
   *  this one, which is also what originally surfaced the MatDialog
   *  DI-shadowing footgun documented in CLAUDE.md for dialog-in-dialog
   *  components like this one. ModalTableComponent's own [showBackButton] is
   *  turned off here — the "Back" button returning to the task lives in
   *  whichever host page embeds this component instead (TasksComponent/
   *  ManageTasksComponent/ManageTeamComponent, via relatedItemViewChange
   *  below), so it renders in one consistent spot below the breadcrumbs
   *  regardless of whether "back" means leaving the task list or just this
   *  item view — same convention InventoryComponent/ManageInventoryComponent
   *  already established for their own selectedItem/selectedItemDetail. */
  selectedRelatedItem: InventoryItem | null = null;
  /** Only ever populated while selectedRelatedItem is set (see the
   *  template's own @if) — queried so hasUnsavedChanges() below can check
   *  for a dirty in-place edit on the item view before whichever host page
   *  lets its own Back button leave it. */
  @ViewChild(ModalTableComponent) modalTable?: ModalTableComponent;

  /** Delegates to the embedded ModalTableComponent's own hasUnsavedChanges()
   *  — false whenever selectedRelatedItem isn't set at all, since modalTable
   *  is only ever populated while it is. Called both by whichever host page
   *  embeds this component (folded into its own hasUnsavedChanges(), for its
   *  route-level guard/beforeunload listener) and by closeRelatedItem()
   *  below, before actually discarding the related-item view. */
  hasUnsavedChanges(): boolean {
    return this.modalTable?.hasUnsavedChanges() ?? false;
  }

  taskIdCopied = false;
  linkCopied = false;

  currentUserId: string | null = null;
  orgProfiles: Profile[] = [];

  isRequestingTransfer = false;
  isRespondingToTransfer = false;
  transferError: string | null = null;

  // Same rule TaskCardComponent/ManageTasksComponent already badge list
  // rows with — flags it here too now that opening the dialog is the other
  // place someone finds out a task needs attention, not just the list.
  get isOverdue(): boolean {
    return !!this.task.due_date
      && this.task.status !== 'done'
      && this.task.due_date < getTodayIsoDate();
  }

  /** True once the recipient of an incoming transfer, rather than the
   *  task's current owner, has this open — they get Accept/Decline instead
   *  of the usual edit affordances. */
  get isPendingRecipient(): boolean {
    return this.currentUserId !== null && this.task.pending_transfer_to === this.currentUserId;
  }

  /** Same set of people who can already update this task via the two
   *  UPDATE policies on tasks (its assignee, or an admin/manager) — the
   *  request/cancel-transfer RPCs enforce the identical check server-side. */
  get canManageTransfer(): boolean {
    return this.currentUserId === this.task.assigned_to || this.authService.canManage();
  }

  /** Gates the whole transfer panel, not just the "request a new transfer"
   *  form — a done task shouldn't offer to start a transfer, but a transfer
   *  already in flight (started before the task was marked done) still
   *  needs a way to resolve, so this stays true for an already-pending one
   *  even once done. */
  get canShowTransferPanel(): boolean {
    return this.canManageTransfer && (!!this.task.pending_transfer_to || this.task.status !== 'done');
  }

  // Excludes pending join requests as well as the current assignee —
  // request_task_transfer() rejects an unapproved target server-side
  // (see require_approved_task_transfer_target migration), so this keeps
  // the dropdown from offering someone who can't yet accept it anyway.
  get transferablePeople(): Profile[] {
    return this.orgProfiles.filter(
      profile => profile.id !== this.task.assigned_to && profile.membership_status === 'approved'
    );
  }

  async ngOnInit() {
    this.selectedStatus = this.task.status;

    const session = await this.authService.getSession();
    this.currentUserId = session?.user.id ?? null;

    const { data } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('organization_id', this.authService.organizationId()!)
      .order('full_name');
    this.orgProfiles = data ?? [];
  }

  assigneeLabel(): string {
    return resolveProfileName(this.task.assigned_to, this.orgProfiles) || 'Unassigned';
  }

  createdByLabel(): string {
    return resolveProfileName(this.task.created_by, this.orgProfiles) || 'Unknown user';
  }

  pendingTransferLabel(): string {
    return resolveProfileName(this.task.pending_transfer_to, this.orgProfiles) || 'Unknown user';
  }

  /** Opens the picker as its own popup (TransferTaskModalComponent) rather
   *  than expanding an inline panel next to the status field — a pure
   *  data-collector, same pattern ModalTableComponent.openRequestRetirement()
   *  already establishes: it just returns the picked target's id (or
   *  nothing, on Cancel), and requestTransfer() below still owns the actual
   *  RPC call/error state once the dialog closes. */
  startTransfer() {
    const dialogRef = this.dialog.open(TransferTaskModalComponent, {
      data: { people: this.transferablePeople },
      width: 'clamp(24rem, 45vw, 30rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((targetId: string | undefined) => {
      if (targetId) {
        void this.requestTransfer(targetId);
      }
    });
  }

  async requestTransfer(targetId: string) {
    if (this.isRequestingTransfer) {
      return;
    }

    this.isRequestingTransfer = true;
    this.transferError = null;

    const { error } = await this.supabase.rpc('request_task_transfer', {
      task_id: this.task.id,
      target_id: targetId
    });

    this.isRequestingTransfer = false;

    if (error) {
      this.transferError = error.message;
      return;
    }

    this.notification.success('Transfer requested');
    this.back.emit(true);
  }

  async cancelTransfer() {
    if (this.isRequestingTransfer) {
      return;
    }

    this.isRequestingTransfer = true;
    this.transferError = null;

    const { error } = await this.supabase.rpc('cancel_task_transfer', { task_id: this.task.id });

    this.isRequestingTransfer = false;

    if (error) {
      this.transferError = error.message;
      return;
    }

    this.notification.success('Transfer cancelled');
    this.back.emit(true);
  }

  async acceptTransfer() {
    if (this.isRespondingToTransfer || !this.currentUserId) {
      return;
    }

    this.isRespondingToTransfer = true;
    this.transferError = null;

    const { error } = await this.supabase.rpc('accept_task_transfer', { task_id: this.task.id });

    this.isRespondingToTransfer = false;

    if (error) {
      this.transferError = error.message;
      return;
    }

    this.notification.success('Task accepted');
    this.back.emit(true);
  }

  async declineTransfer() {
    if (this.isRespondingToTransfer) {
      return;
    }

    this.isRespondingToTransfer = true;
    this.transferError = null;

    const { error } = await this.supabase.rpc('decline_task_transfer', { task_id: this.task.id });

    this.isRespondingToTransfer = false;

    if (error) {
      this.transferError = error.message;
      return;
    }

    this.notification.success('Transfer declined');
    this.back.emit(true);
  }

  async copyTaskId() {
    await navigator.clipboard.writeText(this.task.id);
    this.taskIdCopied = true;
    setTimeout(() => (this.taskIdCopied = false), 2000);
  }

  /** Always /tasks?task=<id> — never /manage/tasks — since /tasks is
   *  reachable by any approved org member (just approvedGuard) where
   *  /manage/tasks would flatly deny a plain staff member via manageGuard.
   *  TasksComponent falls back to /manage/tasks itself, but only for a
   *  viewer who can actually manage — see its own ?task= handling. Mirrors
   *  ModalTableComponent.copyLink()'s /inventory?item=<id>. */
  async copyLink() {
    const url = `${window.location.origin}/tasks?task=${this.task.id}`;
    await navigator.clipboard.writeText(url);
    this.linkCopied = true;
    setTimeout(() => (this.linkCopied = false), 2000);
  }

  /** related_item_name is plain text (not a foreign key), so the linked item
   *  is resolved by name lookup on demand rather than being preloaded. */
  async openRelatedItem() {
    const name = this.task.related_item_name;
    if (!name || this.isLoadingRelatedItem) {
      return;
    }

    this.isLoadingRelatedItem = true;
    this.relatedItemError = null;

    const [{ data: item }, { data: profiles }] = await Promise.all([
      this.supabase.from('inventory_items').select('*').eq('name', name).limit(1).maybeSingle(),
      this.supabase.from('profiles').select('*').eq('organization_id', this.authService.organizationId()!)
    ]);

    if (!item) {
      this.isLoadingRelatedItem = false;
      this.relatedItemError = 'This item could not be found — it may have been renamed or deleted.';
      return;
    }

    const allProfiles = profiles ?? [];
    const [imagesByItemId, activityByItemId] = await Promise.all([
      loadInventoryImagesByItemId(this.supabase, [item.id]),
      loadInventoryActivityByItemId(this.supabase, [item.id], allProfiles)
    ]);

    this.isLoadingRelatedItem = false;

    this.selectedRelatedItem = toInventoryItem(
      item,
      imagesByItemId.get(item.id) ?? [],
      resolveProfileName(item.checked_out_to, allProfiles),
      activityByItemId.get(item.id) ?? []
    );
    this.relatedItemViewChange.emit(true);
  }

  /** The related-item view's own Back button — see selectedRelatedItem's own
   *  doc comment. Confirms first if the item's own edit form is actually
   *  dirty, same "public gate + private apply" split
   *  InventoryComponent.closeDetails() uses for the identical check. */
  closeRelatedItem() {
    if (!this.hasUnsavedChanges()) {
      this.applyCloseRelatedItem();
      return;
    }

    void confirmLeaveWithoutSaving(
      this.dialog,
      'You have unsaved changes on this item that will be lost if you leave it.'
    ).then(confirmed => {
      if (confirmed) {
        this.applyCloseRelatedItem();
      }
    });
  }

  private applyCloseRelatedItem() {
    this.selectedRelatedItem = null;
    this.relatedItemViewChange.emit(false);
  }

  /** The Save button itself is disabled whenever selectedStatus hasn't
   *  actually diverged from task.status (see the template's own
   *  [disabled] binding) — there's nothing to save yet, so the button
   *  shouldn't invite a click. The guard below is defense-in-depth for
   *  this method itself rather than the primary gate: it's what makes
   *  reverting the dropdown back to the original value re-disable the
   *  button too, and protects any future caller of this method directly. */
  async saveStatus() {
    if (this.selectedStatus === this.task.status) {
      this.back.emit(false);
      return;
    }

    this.isSaving = true;
    this.error = null;

    // Goes through update_task_status() rather than a raw table update — a
    // plain assignee (not admin/manager) no longer has any direct UPDATE
    // access to tasks at all, only this RPC, which is column-scoped to
    // status alone. See close_task_assignee_column_gap migration.
    const { error } = await this.supabase.rpc('update_task_status', {
      task_id: this.task.id,
      new_status: this.selectedStatus
    });

    this.isSaving = false;

    if (error) {
      this.error = error.message;
      return;
    }

    this.back.emit(true);
  }
}
