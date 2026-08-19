import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { NotificationService } from '../../../core/notification.service';
import { AuthService, Profile } from '../../../core/auth.service';
import { Database } from '../../models/database.types';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '../../models/task-status';
import { toInventoryItem } from '../../utils/inventory-item.mapper';
import { profileDisplayName, resolveProfileName } from '../../utils/profile-label';
import { loadInventoryImagesByItemId } from '../../utils/inventory-item-images';
import { loadInventoryActivityByItemId } from '../../utils/inventory-item-activity';
import { getTodayIsoDate } from '../../utils/date';
import { ModalTableComponent } from '../modal-table/modal-table.component';

type Task = Database['public']['Tables']['tasks']['Row'];

@Component({
  selector: 'app-task-detail-modal',
  imports: [
    DatePipe,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './task-detail-modal.component.html',
  styleUrl: './task-detail-modal.component.scss',
})
export class TaskDetailModalComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);
  protected authService = inject(AuthService);
  dialogRef = inject(MatDialogRef<TaskDetailModalComponent>);
  task = inject<Task>(MAT_DIALOG_DATA);

  readonly statusLabels = TASK_STATUS_LABELS;
  readonly statuses = TASK_STATUSES;

  selectedStatus: Task['status'] = this.task.status;
  isSaving = false;
  error: string | null = null;

  isLoadingRelatedItem = false;
  relatedItemError: string | null = null;

  taskIdCopied = false;
  linkCopied = false;

  currentUserId: string | null = null;
  orgProfiles: Profile[] = [];

  transferTarget: string | null = null;
  isRequestingTransfer = false;
  isRespondingToTransfer = false;
  transferError: string | null = null;

  /** Starts false so the not-yet-requested case is just a plain "Transfer"
   *  button rather than the recipient picker sitting permanently open
   *  next to the status field — the picker (and its boxed .transfer-panel
   *  styling, same treatment the pending/incoming states already use) only
   *  appears once someone actually means to start one. */
  isPickingTransferTarget = false;

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
    const session = await this.authService.getSession();
    this.currentUserId = session?.user.id ?? null;

    const { data } = await this.supabase.from('profiles').select('*').order('full_name');
    this.orgProfiles = data ?? [];
  }

  profileLabel(profile: Profile): string {
    return profileDisplayName(profile);
  }

  assigneeLabel(): string {
    return resolveProfileName(this.task.assigned_to, this.orgProfiles) || 'Unassigned';
  }

  pendingTransferLabel(): string {
    return resolveProfileName(this.task.pending_transfer_to, this.orgProfiles) || 'Unknown user';
  }

  startTransfer() {
    this.isPickingTransferTarget = true;
  }

  /** Backs out of the picker without touching the server — distinct from
   *  cancelTransfer() below, which cancels a transfer already requested. */
  cancelPickingTransferTarget() {
    this.isPickingTransferTarget = false;
    this.transferTarget = null;
    this.transferError = null;
  }

  async requestTransfer() {
    if (!this.transferTarget || this.isRequestingTransfer) {
      return;
    }

    this.isRequestingTransfer = true;
    this.transferError = null;

    const { error } = await this.supabase.rpc('request_task_transfer', {
      task_id: this.task.id,
      target_id: this.transferTarget
    });

    this.isRequestingTransfer = false;

    if (error) {
      this.transferError = error.message;
      return;
    }

    this.notification.success('Transfer requested');
    this.dialogRef.close({ ...this.task, pending_transfer_to: this.transferTarget });
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
    this.dialogRef.close({ ...this.task, pending_transfer_to: null });
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
    this.dialogRef.close({ ...this.task, assigned_to: this.currentUserId, pending_transfer_to: null });
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
    this.dialogRef.close({ ...this.task, pending_transfer_to: null });
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
      this.supabase.from('profiles').select('*')
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

    this.dialog.open(ModalTableComponent, {
      data: toInventoryItem(
        item,
        imagesByItemId.get(item.id) ?? [],
        resolveProfileName(item.checked_out_to, allProfiles),
        activityByItemId.get(item.id) ?? []
      ),
      width: 'clamp(45rem, 78vw, 70rem)',
      maxWidth: '90vw',
      maxHeight: '95vh',
      panelClass: 'item-details-dialog'
    });
  }

  async saveStatus() {
    if (this.selectedStatus === this.task.status) {
      this.dialogRef.close();
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

    this.dialogRef.close({ ...this.task, status: this.selectedStatus });
  }

  closeModal() {
    this.dialogRef.close();
  }
}
