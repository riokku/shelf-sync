import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule, FormControl, FormGroup, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { SupabaseService } from '../../core/supabase.service';
import { NotificationService } from '../../core/notification.service';
import { AuthService, Profile } from '../../core/auth.service';
import { InventoryFieldOptionsService } from '../../core/inventory-field-options.service';
import { SiteSettingsService } from '../../core/site-settings.service';
import { InventoryFormFieldKey } from '../../shared/models/inventory-form-field';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { ModalTableComponent } from '../../shared/components/modal-table/modal-table.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { Database } from '../../shared/models/database.types';
import { ActivityLogEntry, MAX_INVENTORY_ITEM_IMAGES } from '../../shared/models/inventory-item.model';
import { toIsoDateString } from '../../shared/utils/date';
import { toInventoryItem } from '../../shared/utils/inventory-item.mapper';
import { resolveProfileAvatarKey, resolveProfileName } from '../../shared/utils/profile-label';
import { loadInventoryImagesByItemId, uploadInventoryItemImages } from '../../shared/utils/inventory-item-images';
import { loadInventoryActivityByItemId } from '../../shared/utils/inventory-item-activity';
import { sumContainerQuantity } from '../../shared/utils/inventory-item-containers';
import { logActivity } from '../../shared/utils/activity-log';
import { parseItemQrValue } from '../../shared/utils/barcode';

type InventoryItemRow = Database['public']['Tables']['inventory_items']['Row'];

@Component({
  selector: 'app-manage-inventory',
  imports: [
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
    MatTooltipModule,
    BreadcrumbsComponent,
    EmptyStateComponent
  ],
  templateUrl: './manage-inventory.component.html',
  styleUrl: './manage-inventory.component.scss',
})
export class ManageInventoryComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);
  protected siteSettings = inject(SiteSettingsService);
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);

  /** Whether an admin-optional field is shown on the "Create item" form
   *  below (Customize > Data's "Inventory data" section) — name and
   *  quantity tracking aren't gated by this since they're never optional,
   *  see shared/models/inventory-form-field.ts's own doc comment. */
  fieldEnabled(key: InventoryFormFieldKey): boolean {
    return this.siteSettings.inventoryFormFields().includes(key);
  }

  private assignableProfiles: Profile[] = [];

  viewMode: 'create' | 'retirements' = 'create';
  // Still the full list, not just pending-retirement items — beyond
  // pendingRetirementItems below, this also backs refreshInventoryItem()'s
  // patch-in-place after the detail popup closes and the barcode-scan
  // duplicate check in submitInventoryItem() (see their own comments), both
  // of which need every item, not just the ones with a pending request.
  allInventoryItems: InventoryItemRow[] = [];
  isLoadingInventoryList = true;
  private inventoryImagesByItemId = new Map<string, string[]>();
  private inventoryActivityByItemId = new Map<string, ActivityLogEntry[]>();

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

  // Bound to the <form>'s #inventoryFormDirective template ref (FormGroupDirective's
  // exportAs is 'ngForm', same as template-driven forms). Needed because
  // FormGroup.reset() only clears each control's value/dirty/touched state —
  // it doesn't know about the *directive's* own `submitted` flag, which the
  // default ErrorStateMatcher also treats as "show errors" regardless of
  // touched. Without resetting via the directive, a freshly-reset form would
  // still show "required" errors for empty fields because `submitted` stuck
  // true from the prior successful submit.
  @ViewChild('inventoryFormDirective') private inventoryFormDirective!: FormGroupDirective;

  inventoryForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    barcode: new FormControl('', { nonNullable: true }),
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

  /** Whether the new item's stock is a single flat quantity (the original
   *  behavior — quantityTotal is typed directly) or broken into individual
   *  containers/boxes from the start (mirrors ModalTableComponent's edit-mode
   *  "Container breakdown" — see shared/utils/inventory-item-containers.ts).
   *  Plain field rather than part of inventoryForm, same pattern as
   *  viewMode above, since it only ever toggles which section of the form
   *  is shown/used, not a value that's itself submitted. */
  trackingMode: 'single' | 'containers' = 'single';
  newContainers: { quantity: number; location: string }[] = [];

  get newContainerQuantitySum(): number {
    return sumContainerQuantity(this.newContainers);
  }

  addNewContainer(){
    const defaultQuantity = this.inventoryForm.controls.quantityPerContainer.value ?? 0;
    this.newContainers.push({ quantity: defaultQuantity, location: '' });
  }

  removeNewContainer(index: number){
    this.newContainers.splice(index, 1);
  }

  isSavingItem = false;
  itemError: string | null = null;

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

  retirementRequesterLabel(item: InventoryItemRow): string {
    return resolveProfileName(item.retirement_requested_by, this.assignableProfiles) || 'Unknown user';
  }

  // Confirmed first, unlike declineRetirement() below — this is the one
  // that's actually irreversible (retires the item org-wide, no "cancel"
  // the way a pending request has), same bar as ConfirmDialog's other
  // danger: true uses (delete task, remove member).
  approveRetirement(item: InventoryItemRow){
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Approve retirement?',
        message: `Retire "${item.name}"? It'll be hidden from the default inventory view. This can't be undone.`,
        confirmLabel: 'Approve',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(async confirmed => {
      if (!confirmed) {
        return;
      }
      await this.runRetirementAction(
        this.supabase.rpc('approve_item_retirement', { item_id: item.id }),
        'Item retired'
      );
    });
  }

  async declineRetirement(item: InventoryItemRow){
    await this.runRetirementAction(
      this.supabase.rpc('decline_item_retirement', { item_id: item.id }),
      'Retirement request declined'
    );
  }

  private async runRetirementAction(call: PromiseLike<{ error: { message: string } | null }>, successMessage: string){
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
    this.notification.success(successMessage);
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
        resolveProfileName(row.retired_by, this.assignableProfiles),
        resolveProfileName(row.locked_by, this.assignableProfiles)
      ),
      width: 'clamp(45rem, 78vw, 70rem)',
      maxWidth: '90vw',
      maxHeight: '95vh',
      panelClass: 'item-details-dialog'
    });

    // Just this one row, not the whole list — unlike InventoryComponent
    // (whose showDetails() passes the same InventoryItem instance that's
    // still sitting in its list, so edits already show up live with no
    // reload at all), toInventoryItem() above builds ModalTableComponent a
    // disconnected InventoryItem; allInventoryItems here holds the raw DB
    // rows that fed it, so nothing keeps them in sync automatically and a
    // refetch is genuinely needed — just not of every other row too.
    dialogRef.afterClosed().subscribe(() => this.refreshInventoryItem(row.id));
  }

  private async refreshInventoryItem(itemId: string) {
    const { data: row } = await this.supabase.from('inventory_items').select('*').eq('id', itemId).maybeSingle();

    const index = this.allInventoryItems.findIndex(item => item.id === itemId);
    if (!row) {
      // Not expected from this dialog (it never deletes items), but handle
      // it gracefully rather than leaving a stale row behind.
      if (index !== -1) {
        this.allInventoryItems = this.allInventoryItems.filter(item => item.id !== itemId);
      }
      return;
    }

    this.allInventoryItems = index === -1
      ? [...this.allInventoryItems, row]
      : this.allInventoryItems.map((item, i) => (i === index ? row : item));

    const [imagesByItemId, activityByItemId] = await Promise.all([
      loadInventoryImagesByItemId(this.supabase, [itemId]),
      loadInventoryActivityByItemId(this.supabase, [itemId], this.assignableProfiles)
    ]);
    this.inventoryImagesByItemId.set(itemId, imagesByItemId.get(itemId) ?? []);
    this.inventoryActivityByItemId.set(itemId, activityByItemId.get(itemId) ?? []);
  }

  /** Scans either a manufacturer barcode (matched against
   *  inventory_items.barcode) or a ShelfSync-generated QR label (matched
   *  by item id — see shared/utils/barcode.ts). A match opens that item's
   *  detail instead of prefilling the create form, so scanning something
   *  you already have in inventory can't create an accidental duplicate;
   *  no match prefills the new item's barcode field and lets the person
   *  keep filling in the rest. Checked against allInventoryItems (already
   *  loaded for the "All Inventory" tab) rather than a fresh query.
   *
   *  BarcodeScannerModalComponent is dynamically imported rather than a
   *  top-level import — it (and the @zxing/browser + @zxing/library
   *  decoding stack behind it) is only needed by whoever actually clicks
   *  Scan, so splitting it into its own lazy chunk keeps that ~500kb+ out
   *  of every visit's initial bundle. */
  async scanBarcodeForNewItem() {
    const { BarcodeScannerModalComponent } = await import(
      '../../shared/components/barcode-scanner-modal/barcode-scanner-modal.component'
    );
    const dialogRef = this.dialog.open(BarcodeScannerModalComponent, {
      width: 'clamp(24rem, 45vw, 30rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((code: string | undefined) => {
      if (!code) {
        return;
      }

      const scannedItemId = parseItemQrValue(code);
      const existing = scannedItemId
        ? this.allInventoryItems.find(item => item.id === scannedItemId)
        : this.allInventoryItems.find(item => item.barcode === code);

      if (existing) {
        this.notification.success(`"${existing.name}" is already in inventory — opening it.`);
        this.openInventoryDetail(existing);
        return;
      }

      this.inventoryForm.controls.barcode.setValue(code);
    });
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
    if (this.isSavingItem) {
      return;
    }
    if (this.inventoryForm.invalid) {
      this.inventoryForm.markAllAsTouched();
      return;
    }
    if (this.trackingMode === 'containers' && this.newContainers.length === 0) {
      this.itemError = 'Add at least one container, or switch to a single quantity.';
      return;
    }

    this.isSavingItem = true;
    this.itemError = null;

    const value = this.inventoryForm.getRawValue();
    // In container mode, quantityTotal isn't user-entered (see the template
    // — that field is hidden) and is instead the sum of the boxes below,
    // same derivation ModalTableComponent's edit flow uses once an item has
    // any containers.
    const quantityTotal = this.trackingMode === 'containers' ? this.newContainerQuantitySum : value.quantityTotal;
    const { data: inserted, error } = await this.supabase.from('inventory_items').insert({
      name: value.name,
      barcode: value.barcode || null,
      category: value.category || null,
      description: value.description || null,
      physical_location: value.physicalLocation || null,
      digital_location: value.digitalLocation || null,
      applicable_year: value.applicableYear || null,
      expiration_date: toIsoDateString(value.expirationDate),
      supplier_name: value.supplierName || null,
      supplier_lead_time: value.supplierLeadTime || null,
      order_link: value.orderLink || null,
      quantity_total: quantityTotal,
      quantity_allocated: 0,
      quantity_remaining: quantityTotal,
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

    if (this.trackingMode === 'containers') {
      const { error: containerError } = await this.supabase.from('inventory_item_containers').insert(
        this.newContainers.map(container => ({
          item_id: inserted.id,
          quantity: container.quantity,
          location: container.location || null
        }))
      );
      if (containerError) {
        this.itemError = `Item created, but container setup failed: ${containerError.message}`;
      }
    }

    if (this.selectedImageFiles.length > 0) {
      const uploadError = await uploadInventoryItemImages(this.supabase, inserted.id, this.selectedImageFiles, 0);
      if (uploadError) {
        this.itemError = `Item created, but image upload failed: ${uploadError}`;
      }
    }

    // Best-effort — a failed log write shouldn't block the item having
    // already been created, same reasoning modal-table.component.ts's edit
    // flow uses for logInventoryItemActivity().
    const session = await this.authService.getSession();
    if (session) {
      await logActivity(this.supabase, session.user.id, 'inventory_item', inserted.id, `Created item "${inserted.name}"`);
    }

    this.isSavingItem = false;
    this.notification.success('Item created');
    this.inventoryFormDirective.resetForm();
    this.trackingMode = 'single';
    this.newContainers = [];
    this.clearSelectedImages();
    await this.loadInventoryItems();
  }
}
