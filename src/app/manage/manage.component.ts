import { Component, OnInit, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { SupabaseService } from '../core/supabase.service';
import { AuthService, Profile } from '../core/auth.service';
import { InventoryFieldOptionsService } from '../core/inventory-field-options.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { TaskDetailModalComponent } from '../shared/components/task-detail-modal/task-detail-modal.component';
import { ModalTableComponent } from '../shared/components/modal-table/modal-table.component';
import { EditProfileModalComponent } from '../shared/components/edit-profile-modal/edit-profile-modal.component';
import { Database } from '../shared/models/database.types';
import { TASK_STATUSES, TASK_STATUS_LABELS, TaskStatus } from '../shared/models/task-status';
import { ActivityLogEntry, MAX_INVENTORY_ITEM_IMAGES } from '../shared/models/inventory-item.model';
import { toIsoDateString, getTodayIsoDate } from '../shared/utils/date';
import { toInventoryItem } from '../shared/utils/inventory-item.mapper';
import { profileDisplayName, resolveProfileName } from '../shared/utils/profile-label';
import { loadInventoryImagesByItemId, uploadInventoryItemImages } from '../shared/utils/inventory-item-images';
import { loadInventoryActivityByItemId } from '../shared/utils/inventory-item-activity';

type Task = Database['public']['Tables']['tasks']['Row'];
type InventoryItemRow = Database['public']['Tables']['inventory_items']['Row'];

interface TeamMember {
  profile: Profile;
  tasksByStatus: Record<TaskStatus, Task[]>;
}

@Component({
  selector: 'app-manage',
  imports: [
    DatePipe,
    CurrencyPipe,
    FormsModule,
    ReactiveFormsModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    MatDatepickerModule,
    BreadcrumbsComponent
  ],
  templateUrl: './manage.component.html',
  styleUrl: './manage.component.scss',
})
export class ManageComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  protected authService = inject(AuthService);
  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);
  private dialog = inject(MatDialog);

  private currentUserId: string | null = null;
  assignableProfiles: Profile[] = [];

  inviteLink: string | null = null;
  inviteLinkCopied = false;

  readonly statuses = TASK_STATUSES;
  readonly statusLabels = TASK_STATUS_LABELS;
  teamMembers: TeamMember[] = [];
  allTasks: Task[] = [];
  isLoadingTeam = true;

  taskViewMode: 'create' | 'all' = 'create';
  taskFilterSearch = '';
  taskFilterAssignee: string | null = null;
  taskFilterStatus: TaskStatus | null = null;
  taskFilterDueBefore: Date | null = null;

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

  inventoryViewMode: 'create' | 'all' = 'create';
  allInventoryItems: InventoryItemRow[] = [];
  isLoadingInventoryList = true;
  private inventoryImagesByItemId = new Map<string, string[]>();
  private inventoryActivityByItemId = new Map<string, ActivityLogEntry[]>();

  readonly maxInventoryItemImages = MAX_INVENTORY_ITEM_IMAGES;
  selectedImageFiles: File[] = [];
  imagePreviews: string[] = [];
  imageLimitError: string | null = null;

  inventoryForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    physicalLocation: new FormControl('', { nonNullable: true }),
    digitalLocation: new FormControl('', { nonNullable: true }),
    applicableYear: new FormControl('', { nonNullable: true }),
    expirationDate: new FormControl<Date | null>(null),
    supplierName: new FormControl('', { nonNullable: true }),
    supplierLeadTime: new FormControl('', { nonNullable: true }),
    orderLink: new FormControl('', { nonNullable: true }),
    quantityTotal: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    quantityPerContainer: new FormControl<number | null>(null),
    lowQuantityThreshold: new FormControl<number | null>(null),
    pricePerUnit: new FormControl<number | null>(null),
    pricePerContainer: new FormControl<number | null>(null)
  });

  isSavingItem = false;
  itemError: string | null = null;
  itemSaved = false;

  taskForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    status: new FormControl<'todo' | 'in_progress' | 'done'>('todo', { nonNullable: true }),
    assignedTo: new FormControl<string | null>(null),
    dueDate: new FormControl<Date | null>(null),
    relatedItemName: new FormControl<string | null>(null)
  });

  relatedItemSearchControl = new FormControl('', { nonNullable: true });

  get filteredInventoryItemsForTask(): InventoryItemRow[] {
    const term = this.relatedItemSearchControl.value.trim().toLowerCase();
    if (!term) {
      return this.allInventoryItems;
    }
    return this.allInventoryItems.filter(item =>
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
      this.loadTeamTasks(),
      this.loadInventoryItems(),
      this.loadInviteLink(),
      this.inventoryFieldOptions.load()
    ]);
  }

  private async loadProfiles() {
    const { data } = await this.supabase.from('profiles').select('*').order('full_name');
    this.assignableProfiles = data ?? [];
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

  profileLabel(profile: Profile): string {
    return profileDisplayName(profile);
  }

  assigneeLabel(assignedTo: string | null): string {
    return resolveProfileName(assignedTo, this.assignableProfiles) || 'Unassigned';
  }

  isTaskOverdue(task: Task): boolean {
    return !!task.due_date && task.status !== 'done' && task.due_date < getTodayIsoDate();
  }

  isInventoryItemLowStock(item: InventoryItemRow): boolean {
    return item.low_quantity_threshold != null && item.quantity_remaining < item.low_quantity_threshold;
  }

  openInventoryDetail(row: InventoryItemRow) {
    const images = this.inventoryImagesByItemId.get(row.id) ?? [];
    const activityLog = this.inventoryActivityByItemId.get(row.id) ?? [];
    const dialogRef = this.dialog.open(ModalTableComponent, {
      data: toInventoryItem(row, images, resolveProfileName(row.checked_out_to, this.assignableProfiles), activityLog),
      width: 'clamp(45rem, 78vw, 70rem)',
      maxWidth: '90vw',
      maxHeight: '95vh',
      panelClass: 'item-details-dialog'
    });

    dialogRef.afterClosed().subscribe(() => this.loadInventoryItems());
  }

  onImagesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    const room = this.maxInventoryItemImages - this.selectedImageFiles.length;
    this.imageLimitError = files.length > room
      ? `You can attach up to ${this.maxInventoryItemImages} images total; only the first ${room} of the ${files.length} you picked were added.`
      : null;

    for (const file of files.slice(0, room)) {
      this.selectedImageFiles.push(file);
      this.imagePreviews.push(URL.createObjectURL(file));
    }
  }

  removeSelectedImage(index: number) {
    URL.revokeObjectURL(this.imagePreviews[index]);
    this.imagePreviews.splice(index, 1);
    this.selectedImageFiles.splice(index, 1);
    this.imageLimitError = null;
  }

  private clearSelectedImages() {
    for (const preview of this.imagePreviews) {
      URL.revokeObjectURL(preview);
    }
    this.selectedImageFiles = [];
    this.imagePreviews = [];
    this.imageLimitError = null;
  }

  private async loadInventoryItems() {
    this.isLoadingInventoryList = true;

    const { data } = await this.supabase
      .from('inventory_items')
      .select('*')
      .order('name');

    this.allInventoryItems = data ?? [];
    const itemIds = this.allInventoryItems.map(item => item.id);
    const [imagesByItemId, activityByItemId] = await Promise.all([
      loadInventoryImagesByItemId(this.supabase, itemIds),
      loadInventoryActivityByItemId(this.supabase, itemIds, this.assignableProfiles)
    ]);
    this.inventoryImagesByItemId = imagesByItemId;
    this.inventoryActivityByItemId = activityByItemId;
    this.isLoadingInventoryList = false;
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
      maxWidth: '90vw',
      panelClass: 'task-details-dialog'
    });

    dialogRef.afterClosed().subscribe((updated: Task | undefined) => {
      if (!updated) {
        return;
      }
      this.loadTeamTasks();
    });
  }

  async deleteTask(task: Task) {
    const confirmed = confirm(`Delete "${task.title}"? This can't be undone.`);
    if (!confirmed) {
      return;
    }

    const { error } = await this.supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      alert(`Failed to delete task: ${error.message}`);
      return;
    }

    await this.loadTeamTasks();
  }

  private async loadTeamTasks() {
    this.isLoadingTeam = true;

    const { data } = await this.supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false });
    const tasks = data ?? [];
    this.allTasks = tasks;

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

  async submitInventoryItem() {
    if (this.inventoryForm.invalid || this.isSavingItem) {
      return;
    }

    this.isSavingItem = true;
    this.itemError = null;
    this.itemSaved = false;

    const value = this.inventoryForm.getRawValue();
    const { data: inserted, error } = await this.supabase.from('inventory_items').insert({
      name: value.name,
      category: value.category || null,
      description: value.description || null,
      physical_location: value.physicalLocation || null,
      digital_location: value.digitalLocation || null,
      applicable_year: value.applicableYear || null,
      expiration_date: toIsoDateString(value.expirationDate),
      supplier_name: value.supplierName || null,
      supplier_lead_time: value.supplierLeadTime || null,
      order_link: value.orderLink || null,
      quantity_total: value.quantityTotal,
      quantity_allocated: 0,
      quantity_remaining: value.quantityTotal,
      quantity_per_container: value.quantityPerContainer,
      low_quantity_threshold: value.lowQuantityThreshold,
      price_per_unit: value.pricePerUnit,
      price_per_container: value.pricePerContainer
    }).select().single();

    if (error || !inserted) {
      this.isSavingItem = false;
      this.itemError = error?.message ?? 'Failed to create item.';
      return;
    }

    if (this.selectedImageFiles.length > 0) {
      const uploadError = await uploadInventoryItemImages(this.supabase, inserted.id, this.selectedImageFiles, 0);
      if (uploadError) {
        this.itemError = `Item created, but image upload failed: ${uploadError}`;
      }
    }

    this.isSavingItem = false;
    this.itemSaved = true;
    this.inventoryForm.reset();
    this.clearSelectedImages();
    await this.loadInventoryItems();
  }

  async submitTask() {
    if (this.taskForm.invalid || this.isSavingTask || !this.currentUserId) {
      return;
    }

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
      created_by: this.currentUserId
    });

    this.isSavingTask = false;

    if (error) {
      this.taskError = error.message;
      return;
    }

    this.taskSaved = true;
    this.taskForm.reset();
    this.relatedItemSearchControl.setValue('');
    await this.loadTeamTasks();
  }
}
