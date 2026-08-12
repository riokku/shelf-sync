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
import { AuthService, Profile } from '../../../core/auth.service';
import { Database } from '../../models/database.types';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '../../models/task-status';
import { toInventoryItem } from '../../utils/inventory-item.mapper';
import { profileDisplayName, resolveProfileName } from '../../utils/profile-label';
import { loadInventoryImagesByItemId } from '../../utils/inventory-item-images';
import { loadInventoryActivityByItemId } from '../../utils/inventory-item-activity';
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

  currentUserId: string | null = null;
  orgProfiles: Profile[] = [];

  transferTarget: string | null = null;
  isRequestingTransfer = false;
  isRespondingToTransfer = false;
  transferError: string | null = null;

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

  get transferablePeople(): Profile[] {
    return this.orgProfiles.filter(profile => profile.id !== this.task.assigned_to);
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

    this.dialogRef.close({ ...this.task, pending_transfer_to: null });
  }

  async copyTaskId() {
    await navigator.clipboard.writeText(this.task.id);
    this.taskIdCopied = true;
    setTimeout(() => (this.taskIdCopied = false), 2000);
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

    const { error } = await this.supabase
      .from('tasks')
      .update({ status: this.selectedStatus })
      .eq('id', this.task.id);

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
