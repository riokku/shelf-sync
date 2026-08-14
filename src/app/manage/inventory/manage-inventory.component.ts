import { Component, OnInit, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { SupabaseService } from '../../core/supabase.service';
import { Profile } from '../../core/auth.service';
import { InventoryFieldOptionsService } from '../../core/inventory-field-options.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { ModalTableComponent } from '../../shared/components/modal-table/modal-table.component';
import { Database } from '../../shared/models/database.types';
import { ActivityLogEntry, MAX_INVENTORY_ITEM_IMAGES } from '../../shared/models/inventory-item.model';
import { toIsoDateString } from '../../shared/utils/date';
import { toInventoryItem } from '../../shared/utils/inventory-item.mapper';
import { resolveProfileAvatarKey, resolveProfileName } from '../../shared/utils/profile-label';
import { loadInventoryImagesByItemId, uploadInventoryItemImages } from '../../shared/utils/inventory-item-images';
import { loadInventoryActivityByItemId } from '../../shared/utils/inventory-item-activity';

type InventoryItemRow = Database['public']['Tables']['inventory_items']['Row'];
type StatusFilter = 'active' | 'include_retired' | 'retired_only';

@Component({
  selector: 'app-manage-inventory',
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDatepickerModule,
    BreadcrumbsComponent
  ],
  templateUrl: './manage-inventory.component.html',
  styleUrl: './manage-inventory.component.scss',
})
export class ManageInventoryComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);
  private dialog = inject(MatDialog);

  private assignableProfiles: Profile[] = [];

  viewMode: 'create' | 'all' | 'retirements' = 'create';
  allInventoryItems: InventoryItemRow[] = [];
  isLoadingInventoryList = true;
  statusFilter: StatusFilter = 'active';
  private inventoryImagesByItemId = new Map<string, string[]>();
  private inventoryActivityByItemId = new Map<string, ActivityLogEntry[]>();

  /** Derived from the same allInventoryItems load rather than a second
   *  query — "all inventory" already fetches every item regardless of
   *  status, so filtering it down (or the pending-retirement queue below)
   *  is just a client-side filter of data that's already there. */
  get visibleInventoryItems(): InventoryItemRow[] {
    if (this.statusFilter === 'retired_only') {
      return this.allInventoryItems.filter(item => item.status === 'retired');
    }
    if (this.statusFilter === 'include_retired') {
      return this.allInventoryItems;
    }
    return this.allInventoryItems.filter(item => item.status !== 'retired');
  }

  get pendingRetirementItems(): InventoryItemRow[] {
    return this.allInventoryItems
      .filter(item => item.status === 'retirement_pending')
      .sort((a, b) => (a.retirement_requested_at ?? '').localeCompare(b.retirement_requested_at ?? ''));
  }

  get pendingRetirementCount(): number {
    return this.pendingRetirementItems.length;
  }

  isProcessingRetirement = false;
  retirementError: string | null = null;

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

  async ngOnInit() {
    await Promise.all([
      this.loadProfiles(),
      this.inventoryFieldOptions.load()
    ]);
    await this.loadInventoryItems();
  }

  private async loadProfiles() {
    const { data } = await this.supabase.from('profiles').select('*').order('full_name');
    this.assignableProfiles = data ?? [];
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

  isInventoryItemLowStock(item: InventoryItemRow): boolean {
    return item.low_quantity_threshold != null && item.quantity_remaining < item.low_quantity_threshold;
  }

  isInventoryItemOutOfStock(item: InventoryItemRow): boolean {
    return item.quantity_remaining <= 0;
  }

  retirementRequesterLabel(item: InventoryItemRow): string {
    return resolveProfileName(item.retirement_requested_by, this.assignableProfiles) || 'Unknown user';
  }

  async approveRetirement(item: InventoryItemRow){
    await this.runRetirementAction(
      this.supabase.rpc('approve_item_retirement', { item_id: item.id })
    );
  }

  async declineRetirement(item: InventoryItemRow){
    await this.runRetirementAction(
      this.supabase.rpc('decline_item_retirement', { item_id: item.id })
    );
  }

  private async runRetirementAction(call: PromiseLike<{ error: { message: string } | null }>){
    if (this.isProcessingRetirement) {
      return;
    }
    this.isProcessingRetirement = true;
    this.retirementError = null;

    const { error } = await call;

    if (error) {
      this.retirementError = error.message;
      this.isProcessingRetirement = false;
      return;
    }

    await this.loadInventoryItems();
    this.isProcessingRetirement = false;
  }

  openInventoryDetail(row: InventoryItemRow) {
    const images = this.inventoryImagesByItemId.get(row.id) ?? [];
    const activityLog = this.inventoryActivityByItemId.get(row.id) ?? [];
    const dialogRef = this.dialog.open(ModalTableComponent, {
      data: toInventoryItem(
        row,
        images,
        resolveProfileName(row.checked_out_to, this.assignableProfiles),
        activityLog,
        resolveProfileAvatarKey(row.checked_out_to, this.assignableProfiles),
        resolveProfileName(row.retirement_requested_by, this.assignableProfiles),
        resolveProfileName(row.retired_by, this.assignableProfiles)
      ),
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
}
