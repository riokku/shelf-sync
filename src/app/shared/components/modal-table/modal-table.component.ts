import { Component, OnInit, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { InventoryItem, MAX_INVENTORY_ITEM_IMAGES, isLowStock } from '../../models/inventory-item.model';
import { InventoryItemContainer } from '../../models/inventory-item-container.model';
import { ImageGalleryComponent } from '../image-gallery/image-gallery.component';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { CreateTaskModalComponent } from '../create-task-modal/create-task-modal.component';
import { RequestRetirementModalComponent, RequestRetirementModalResult } from '../request-retirement-modal/request-retirement-modal.component';
import { DiscardModalComponent, DiscardModalResult } from '../discard-modal/discard-modal.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { AuthService, Profile } from '../../../core/auth.service';
import { SupabaseService } from '../../../core/supabase.service';
import { NotificationService } from '../../../core/notification.service';
import { InventoryFieldOptionsService } from '../../../core/inventory-field-options.service';
import { SiteSettingsService } from '../../../core/site-settings.service';
import { SupplierService } from '../../../core/supplier.service';
import { Supplier } from '../../models/supplier.model';
import { toIsoDateString, parseIsoDate } from '../../utils/date';
import { loadInventoryActivityByItemId, logInventoryItemActivity } from '../../utils/inventory-item-activity';
import { logActivity } from '../../utils/activity-log';
import { logInventoryItemDiscard } from '../../utils/inventory-item-discards';
import { profileDisplayName, resolveProfileAvatarKey, resolveProfileName } from '../../utils/profile-label';
import { resolveSupplierName } from '../../utils/supplier-label';
import {
  InventoryItemImageRecord,
  deleteInventoryItemImage,
  loadInventoryItemImageRecords,
  uploadInventoryItemImages
} from '../../utils/inventory-item-images';
import { loadInventoryItemContainers, sumContainerQuantity } from '../../utils/inventory-item-containers';
import { BARCODE_FEATURE_ENABLED } from '../../utils/barcode';
import { loadUpcomingReservationsForItem } from '../../utils/inventory-item-reservations';
import { InventoryItemReservation } from '../../models/inventory-item-reservation.model';

/** Working copy of a container while the item is being edited — id: null
 *  marks a box that doesn't exist in inventory_item_containers yet. */
interface EditableContainer {
  id: string | null;
  quantity: number;
  location: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  barcode: 'Barcode',
  category: 'Category',
  description: 'Description',
  physicalLocation: 'Physical location',
  digitalLocation: 'Digital location',
  applicableYear: 'Applicable year',
  expirationDate: 'Expiration date',
  supplierName: 'Supplier name',
  supplierLeadTime: 'Supplier lead time',
  orderLink: 'Order link',
  checkedOutTo: 'Checked out to',
  quantityTotal: 'Quantity total',
  quantityPerContainer: 'Quantity per container',
  quantityAllocated: 'Quantity allocated',
  quantityRemaining: 'Quantity remaining',
  lowQuantityThreshold: 'Low quantity threshold',
  pricePerUnit: 'Price per unit',
  pricePerContainer: 'Price per container'
};

@Component({
    selector: 'app-modal-table',
    imports: [
        DatePipe,
        CurrencyPipe,
        ReactiveFormsModule,
        FormsModule,
        MatDialogModule,
        MatIconModule,
        MatButtonModule,
        MatTooltipModule,
        MatTabsModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatProgressSpinnerModule,
        MatDatepickerModule,
        ImageGalleryComponent,
        UserAvatarComponent
    ],
    templateUrl: './modal-table.component.html',
    styleUrl: './modal-table.component.scss'
})

export class ModalTableComponent implements OnInit {
  dialogRef = inject(MatDialogRef<ModalTableComponent>);
  data = inject<InventoryItem>(MAT_DIALOG_DATA);
  protected authService = inject(AuthService);
  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);
  protected siteSettings = inject(SiteSettingsService);
  protected supplierService = inject(SupplierService);
  private dialog = inject(MatDialog);
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);

  idCopied = false;
  linkCopied = false;

  /** Template-facing flag for the barcode display row, edit field/scan
   *  button, and QR label button's own kill switch — see
   *  BARCODE_FEATURE_ENABLED's own doc comment. */
  readonly barcodeFeatureEnabled = BARCODE_FEATURE_ENABLED;

  get isLowStock(): boolean {
    return isLowStock(this.data);
  }

  isEditing = false;
  isSaving = false;
  saveError: string | null = null;

  /** Loaded once when the modal opens (not just while editing) since the
   *  container breakdown is shown in view mode too, not only Edit. */
  existingContainers: InventoryItemContainer[] = [];
  editableContainers: EditableContainer[] = [];
  removedContainerIds = new Set<string>();

  /** Read-only — self-loaded here rather than threaded through InventoryItem/
   *  toInventoryItem() by every caller, same "this popup fetches its own
   *  supplementary data" precedent its own profiles queries elsewhere in
   *  this file already follow. Only reserved/picked_up bookings whose end
   *  date hasn't passed — a glance at "is this already spoken for," not an
   *  audit trail (that's what manage/reservations, the page that actually
   *  creates/actions these, is for). */
  upcomingReservations: InventoryItemReservation[] = [];

  async ngOnInit(){
    [this.existingContainers, this.upcomingReservations] = await Promise.all([
      loadInventoryItemContainers(this.supabase, this.data.id),
      loadUpcomingReservationsForItem(this.supabase, this.data.id)
    ]);
  }

  containerSum(containers: { quantity: number }[]): number {
    return sumContainerQuantity(containers);
  }

  /** Whether quantityRemaining/quantityTotal are currently derived from
   *  containers rather than freely editable — true as soon as an item has
   *  (or is being given) at least one container. */
  get quantityDerivedFromContainers(): boolean {
    return this.isEditing ? this.editableContainers.length > 0 : this.existingContainers.length > 0;
  }

  get containerQuantitySum(): number {
    return sumContainerQuantity(this.editableContainers);
  }

  get derivedQuantityTotal(): number {
    return (this.editForm.controls.quantityAllocated.value ?? 0) + this.containerQuantitySum;
  }

  addContainer(){
    const defaultQuantity = this.editForm.controls.quantityPerContainer.value ?? 0;
    this.editableContainers.push({ id: null, quantity: defaultQuantity, location: '' });
  }

  removeContainer(index: number){
    const entry = this.editableContainers[index];
    if (entry.id !== null) {
      this.removedContainerIds.add(entry.id);
    }
    this.editableContainers.splice(index, 1);
  }

  /** Shared across request/cancel/approve/decline — they're all single
   *  short-lived RPC calls, so one flag disabling all four buttons while any
   *  is in flight is enough; no need for a separate one per action. */
  isProcessingRetirement = false;
  retirementError: string | null = null;

  isProcessingLock = false;
  lockError: string | null = null;

  readonly maxInventoryItemImages = MAX_INVENTORY_ITEM_IMAGES;
  existingImages: InventoryItemImageRecord[] = [];
  removedImageIds = new Set<string>();
  newImageFiles: File[] = [];
  newImagePreviews: string[] = [];
  imageLimitError: string | null = null;

  get remainingImageSlots(): number {
    const activeExisting = this.existingImages.length - this.removedImageIds.size;
    return this.maxInventoryItemImages - activeExisting - this.newImageFiles.length;
  }

  /** Approved options plus the item's own current value, even if that value
   *  isn't (or is no longer) on the approved list — otherwise editing an item
   *  whose category/location predates the admin's list would blank it out. */
  get categoryOptions(): string[] {
    return this.withCurrentValue(this.inventoryFieldOptions.optionsFor('category'), this.data.category);
  }

  get physicalLocationOptions(): string[] {
    return this.withCurrentValue(this.inventoryFieldOptions.optionsFor('physical_location'), this.data.physicalLocation);
  }

  /** Same approved physical-location list a container's location picker
   *  draws from — a per-container variant of physicalLocationOptions above,
   *  since each box can have its own already-set value that may not be on
   *  the approved list. */
  containerLocationOptions(current: string): string[] {
    return this.withCurrentValue(this.inventoryFieldOptions.optionsFor('physical_location'), current);
  }

  private withCurrentValue(approved: string[], current: string): string[] {
    return current && !approved.includes(current) ? [current, ...approved] : approved;
  }

  /** Same "approved list plus the item's own current value" shape as
   *  categoryOptions/physicalLocationOptions above, adapted for an id-keyed
   *  list rather than a string one — if the item's supplierId isn't (or is
   *  no longer) in the loaded directory, it's still included here using the
   *  already-resolved data.supplierName label, so editing an item whose
   *  supplier was since deleted doesn't silently blank the field out. */
  get supplierOptions(): Supplier[] {
    const list = this.supplierService.suppliers();
    if (this.data.supplierId && !list.some(s => s.id === this.data.supplierId)) {
      return [
        { id: this.data.supplierId, name: this.data.supplierName, contactName: '', email: '', phone: '', website: '', notes: '' },
        ...list
      ];
    }
    return list;
  }

  /** Org members eligible to be picked in the "Checked out to" selector.
   *  Loaded fresh on every startEdit() — cheap, and keeps this self-sufficient
   *  regardless of whether the parent component already loaded a profile list. */
  orgProfiles: Profile[] = [];

  profileLabel(profile: Profile): string {
    return profileDisplayName(profile);
  }

  editForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    barcode: new FormControl('', { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    physicalLocation: new FormControl('', { nonNullable: true }),
    digitalLocation: new FormControl('', { nonNullable: true }),
    applicableYear: new FormControl('', { nonNullable: true }),
    expirationDate: new FormControl<Date | null>(null),
    supplierId: new FormControl<string | null>(null),
    supplierLeadTime: new FormControl('', { nonNullable: true }),
    orderLink: new FormControl('', { nonNullable: true }),
    checkedOutTo: new FormControl<string | null>(null),
    quantityTotal: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    quantityPerContainer: new FormControl<number | null>(null),
    quantityAllocated: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    quantityRemaining: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    lowQuantityThreshold: new FormControl<number | null>(null),
    pricePerUnit: new FormControl<number | null>(null),
    pricePerContainer: new FormControl<number | null>(null)
  });

  closeModal(){
    this.dialogRef.close();
  }

  createTask(){
    this.dialog.open(CreateTaskModalComponent, {
      data: { relatedItemName: this.data.name },
      width: 'clamp(30rem, 60vw, 40rem)',
      maxWidth: '90vw'
    });
  }

  /** Only offered from inside the edit form (barcode is a plain field like
   *  any other, only ever changed through Save) — decodes straight into
   *  editForm.barcode rather than writing this.data directly.
   *
   *  BarcodeScannerModalComponent/QrLabelModalComponent below are both
   *  dynamically imported rather than top-level imports — the
   *  @zxing/browser + @zxing/library decoding stack and the qrcode
   *  generator are each only needed by whoever actually clicks Scan or
   *  the label icon, so splitting them into their own lazy chunks keeps
   *  that weight out of every item-detail-popup open's bundle. */
  async scanBarcode(){
    const { BarcodeScannerModalComponent } = await import('../barcode-scanner-modal/barcode-scanner-modal.component');
    const dialogRef = this.dialog.open(BarcodeScannerModalComponent, {
      width: 'clamp(24rem, 45vw, 30rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((code: string | undefined) => {
      if (code) {
        this.editForm.controls.barcode.setValue(code);
      }
    });
  }

  /** Read-only regardless of edit mode — generating a label doesn't change
   *  the item, it's just a printable rendering of its id (see
   *  shared/utils/barcode.ts), so there's no reason to gate it on Edit. */
  async openQrLabel(){
    const { QrLabelModalComponent } = await import('../qr-label-modal/qr-label-modal.component');
    this.dialog.open(QrLabelModalComponent, {
      data: { itemId: this.data.id, itemName: this.data.name },
      width: 'clamp(20rem, 40vw, 26rem)',
      maxWidth: '90vw'
    });
  }

  /** Only reachable once stock is actually at zero — same gate the
   *  request_item_retirement RPC enforces server-side, so this is just the
   *  UI-level mirror of it, not the real guard. */
  get canRequestRetirement(): boolean {
    return this.data.status === 'active' && this.data.quantityRemaining <= 0;
  }

  get canCancelRetirementRequest(): boolean {
    if (this.data.status !== 'retirement_pending') {
      return false;
    }
    const profile = this.authService.profile();
    return this.data.retirementRequestedById === profile?.id || this.authService.canManage();
  }

  openRequestRetirement(){
    if (!this.canRequestRetirement || this.isProcessingRetirement) {
      return;
    }

    const dialogRef = this.dialog.open(RequestRetirementModalComponent, {
      data: { itemName: this.data.name },
      width: 'clamp(26rem, 45vw, 32rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((result: RequestRetirementModalResult | undefined) => {
      if (!result) {
        return;
      }
      void this.runRetirementAction(
        () => this.supabase.rpc('request_item_retirement', { item_id: this.data.id, note: result.note || undefined }),
        () => {
          const profile = this.authService.profile();
          this.data.retirementRequestedById = profile?.id ?? null;
          this.data.retirementRequestedByLabel = profile ? profileDisplayName(profile) : '';
          this.data.retirementRequestNote = result.note;
          this.data.retirementRequestedAt = new Date().toISOString();

          // Matches whichever path the RPC actually took server-side (see
          // Settings > Workflow's "Require approval for retirement
          // requests" toggle) — otherwise a request made while approval
          // isn't required would show a stale "pending" state here even
          // though the item was already retired.
          if (this.siteSettings.requireRetirementApproval()) {
            this.data.status = 'retirement_pending';
          } else {
            this.data.status = 'retired';
            this.data.retiredByLabel = profile ? profileDisplayName(profile) : '';
            this.data.retiredAt = new Date().toISOString();
          }
        },
        this.siteSettings.requireRetirementApproval() ? 'Retirement requested' : 'Item retired'
      );
    });
  }

  cancelRetirementRequest(){
    void this.runRetirementAction(
      () => this.supabase.rpc('cancel_item_retirement_request', { item_id: this.data.id }),
      () => this.resetRetirementToActive(),
      'Retirement request cancelled'
    );
  }

  // Confirmed first, unlike the other three retirement actions — this is
  // the one that's actually irreversible (retires the item org-wide, no
  // "cancel" the way a pending request has), same bar as ConfirmDialog's
  // other danger: true uses (delete task, remove member).
  approveRetirement(){
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Approve retirement?',
        message: `Retire "${this.data.name}"? It'll be hidden from the default inventory view. This can't be undone.`,
        confirmLabel: 'Approve',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (!confirmed) {
        return;
      }
      void this.runRetirementAction(
        () => this.supabase.rpc('approve_item_retirement', { item_id: this.data.id }),
        () => {
          const profile = this.authService.profile();
          this.data.status = 'retired';
          this.data.retiredByLabel = profile ? profileDisplayName(profile) : '';
          this.data.retiredAt = new Date().toISOString();
        },
        'Item retired'
      );
    });
  }

  declineRetirement(){
    void this.runRetirementAction(
      () => this.supabase.rpc('decline_item_retirement', { item_id: this.data.id }),
      () => this.resetRetirementToActive(),
      'Retirement request declined'
    );
  }

  private resetRetirementToActive(){
    this.data.status = 'active';
    this.data.retirementRequestedById = null;
    this.data.retirementRequestedByLabel = '';
    this.data.retirementRequestNote = '';
    this.data.retirementRequestedAt = '';
  }

  isDiscarding = false;
  discardError: string | null = null;

  /** Same edit-access gate the Edit button itself uses, plus nothing left
   *  to discard once the item's already at zero and no longer active — same
   *  reasoning canRequestRetirement's own doc comment gives for its own
   *  gate. Deliberately not admin/manager-only: discarding stock is just a
   *  reason-carrying variant of the same quantity edit any authenticated
   *  user can already make directly, not a stricter action. */
  get canDiscard(): boolean {
    return (!this.data.isLocked || this.authService.canManage())
      && this.data.status === 'active'
      && this.data.quantityRemaining > 0;
  }

  /** Mirrors the enforce_price_supplier_edit_restriction() trigger's own
   *  check (Settings > Workflow's "Price & supplier edits" toggle) —
   *  disabling these three controls client-side when this is false is a
   *  UX nicety, not the actual enforcement, so there's no point showing an
   *  editable field that would just bounce off a database exception. The
   *  database is what actually protects these columns regardless of what
   *  this getter returns. */
  get canEditPriceSupplier(): boolean {
    return !this.siteSettings.restrictPriceSupplierEdits() || this.authService.canManage();
  }

  openDiscard(){
    if (!this.canDiscard || this.isDiscarding) {
      return;
    }

    const dialogRef = this.dialog.open(DiscardModalComponent, {
      data: {
        itemName: this.data.name,
        quantityRemaining: this.data.quantityRemaining,
        containers: this.existingContainers
      },
      width: 'clamp(26rem, 45vw, 32rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((result: DiscardModalResult | undefined) => {
      if (result) {
        void this.performDiscard(result);
      }
    });
  }

  /** Unified replacement for the old DiscardInventoryModalComponent — see
   *  DiscardModalComponent's own doc comment. A flat item decrements
   *  quantityRemaining/quantityTotal directly; a container-tracked item
   *  decrements the picked box instead and re-derives both from the
   *  container sum, the exact same derivation saveContainerChanges()/
   *  quantityDerivedFromContainers already enforce for a normal edit. */
  private async performDiscard(result: DiscardModalResult){
    this.isDiscarding = true;
    this.discardError = null;

    const session = await this.authService.getSession();
    if (!session) {
      this.isDiscarding = false;
      this.discardError = 'You must be signed in to discard stock.';
      return;
    }

    let boxLabel = '';

    if (result.containerId) {
      const container = this.existingContainers.find(c => c.id === result.containerId);
      if (!container) {
        this.isDiscarding = false;
        this.discardError = 'That box no longer exists — close and reopen the item, then try again.';
        return;
      }
      boxLabel = `Box ${this.existingContainers.indexOf(container) + 1}`;

      const { error: containerError } = await this.supabase.from('inventory_item_containers')
        .update({ quantity: container.quantity - result.quantity })
        .eq('id', container.id);
      if (containerError) {
        this.isDiscarding = false;
        this.discardError = containerError.message;
        return;
      }

      this.existingContainers = await loadInventoryItemContainers(this.supabase, this.data.id);
      const newRemaining = this.containerSum(this.existingContainers);
      const newTotal = newRemaining + this.data.quantityAllocated;

      const { error: itemError } = await this.supabase.from('inventory_items')
        .update({ quantity_remaining: newRemaining, quantity_total: newTotal })
        .eq('id', this.data.id);
      if (itemError) {
        this.isDiscarding = false;
        this.discardError = itemError.message;
        return;
      }
      this.data.quantityRemaining = newRemaining;
      this.data.quantityTotal = newTotal;
    } else {
      const newRemaining = this.data.quantityRemaining - result.quantity;
      const newTotal = this.data.quantityTotal - result.quantity;

      const { error: itemError } = await this.supabase.from('inventory_items')
        .update({ quantity_remaining: newRemaining, quantity_total: newTotal })
        .eq('id', this.data.id);
      if (itemError) {
        this.isDiscarding = false;
        this.discardError = itemError.message;
        return;
      }
      this.data.quantityRemaining = newRemaining;
      this.data.quantityTotal = newTotal;
    }

    // "Reason:" for one, "Reasons:" for more than one — reads oddly
    // pluralized otherwise ("Reason: Water damage, Wear and tear").
    const reasonLabel = result.reasons.length > 1 ? 'Reasons' : 'Reason';
    const reasonText = result.reasons.join(', ');
    const message = boxLabel
      ? `Discarded ${result.quantity} units from ${boxLabel}. ${reasonLabel}: ${reasonText}`
      : `Discarded ${result.quantity} units. ${reasonLabel}: ${reasonText}`;

    await logInventoryItemActivity(this.supabase, this.data.id, session.user.id, message);
    await logActivity(this.supabase, session.user.id, 'inventory_item', this.data.id, `${this.data.name}: ${message}`);
    // Structured counterpart to the text log line above — see its own doc
    // comment for why manage/reports needs this and the text log alone
    // isn't enough. Best-effort, after the writes that actually matter.
    await logInventoryItemDiscard(this.supabase, this.data.id, session.user.id, result.quantity, result.reasons, result.containerId);
    await this.refreshActivityLog();

    this.isDiscarding = false;
    this.notification.success('Stock discarded');
  }

  /** Shared runner for all four retirement RPCs: applies the known local
   *  effect (rather than reloading the whole item) on success, same
   *  optimistic-update approach performDiscard() above uses, then refreshes
   *  just the activity log — the RPC itself writes that log row server-side,
   *  so it can't be predicted client-side the way the log message can for
   *  edits/discards done directly from here. */
  private async runRetirementAction(
    call: () => PromiseLike<{ error: { message: string } | null }>,
    applyLocalChange: () => void,
    successMessage: string
  ){
    if (this.isProcessingRetirement) {
      return;
    }
    this.isProcessingRetirement = true;
    this.retirementError = null;

    const { error } = await call();

    if (error) {
      this.isProcessingRetirement = false;
      this.retirementError = error.message;
      return;
    }

    applyLocalChange();
    await this.refreshActivityLog();
    this.isProcessingRetirement = false;
    this.notification.success(successMessage);
  }

  private async refreshActivityLog(){
    const { data: profiles } = await this.supabase.from('profiles').select('*').order('full_name');
    const activityByItemId = await loadInventoryActivityByItemId(this.supabase, [this.data.id], profiles ?? []);
    this.data.activityLog = activityByItemId.get(this.data.id) ?? [];
  }

  /** admin/manager only — set_inventory_item_lock() enforces this same
   *  check server-side, this is just the UI-level mirror of it (same
   *  reasoning canRequestRetirement's own doc comment gives). Locking an
   *  item is what actually gates the Edit button/general edit access for
   *  everyone else — see is_locked's own RLS check on inventory_items'
   *  UPDATE policy. */
  async toggleLock(){
    if (!this.authService.canManage() || this.isProcessingLock) {
      return;
    }

    const locking = !this.data.isLocked;
    this.isProcessingLock = true;
    this.lockError = null;

    const { error } = await this.supabase.rpc('set_inventory_item_lock', { item_id: this.data.id, locked: locking });

    if (error) {
      this.isProcessingLock = false;
      this.lockError = error.message;
      return;
    }

    const profile = this.authService.profile();
    this.data.isLocked = locking;
    this.data.lockedByLabel = locking ? (profile ? profileDisplayName(profile) : '') : '';
    this.data.lockedAt = locking ? new Date().toISOString() : '';

    await this.refreshActivityLog();
    this.isProcessingLock = false;
    this.notification.success(locking ? 'Item locked' : 'Item unlocked');
  }

  async copyId(){
    await navigator.clipboard.writeText(this.data.id);
    this.idCopied = true;
    setTimeout(() => this.idCopied = false, 1500);
  }

  /** Deep link straight to this item's detail popup — read by
   *  InventoryComponent's ?item= handling in ngOnInit(). */
  async copyLink(){
    const url = `${window.location.origin}/inventory?item=${this.data.id}`;
    await navigator.clipboard.writeText(url);
    this.linkCopied = true;
    setTimeout(() => this.linkCopied = false, 1500);
  }

  activityIcon(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('checked out')) {
      return 'logout';
    }
    if (lower.includes('checked in')) {
      return 'login';
    }
    if (lower.includes('created')) {
      return 'add_circle';
    }
    if (lower.includes('allocated')) {
      return 'inventory_2';
    }
    if (lower.includes('discarded')) {
      return 'delete_sweep';
    }
    if (lower.includes('updated')) {
      return 'edit';
    }
    return 'history';
  }

  async startEdit(){
    this.saveError = null;
    this.editForm.setValue({
      name: this.data.name,
      barcode: this.data.barcode,
      category: this.data.category,
      description: this.data.description,
      physicalLocation: this.data.physicalLocation,
      digitalLocation: this.data.digitalLocation,
      applicableYear: this.data.applicableYear,
      expirationDate: parseIsoDate(this.data.expirationDate),
      supplierId: this.data.supplierId,
      supplierLeadTime: this.data.supplierLeadTime,
      orderLink: this.data.orderLink,
      checkedOutTo: this.data.checkedOutToId,
      quantityTotal: this.data.quantityTotal,
      quantityPerContainer: this.data.quantityPerContainer,
      quantityAllocated: this.data.quantityAllocated,
      quantityRemaining: this.data.quantityRemaining,
      lowQuantityThreshold: this.data.lowQuantityThreshold,
      pricePerUnit: this.data.pricePerUnit,
      pricePerContainer: this.data.pricePerContainer
    });
    // Disabled (not omitted) controls still round-trip their current value
    // via getRawValue() at save time, so this can't accidentally null out
    // an existing price/supplier for someone who isn't allowed to change
    // it — the database trigger is the actual enforcement either way.
    const priceSupplierControls = ['supplierId', 'pricePerUnit', 'pricePerContainer'] as const;
    for (const key of priceSupplierControls) {
      if (this.canEditPriceSupplier) {
        this.editForm.get(key)?.enable();
      } else {
        this.editForm.get(key)?.disable();
      }
    }
    this.removedImageIds.clear();
    this.clearNewImages();
    this.editableContainers = this.existingContainers.map(container => ({ ...container }));
    this.removedContainerIds.clear();
    const [existingImages, { data: profiles }] = await Promise.all([
      loadInventoryItemImageRecords(this.supabase, this.data.id),
      this.supabase.from('profiles').select('*').order('full_name'),
      this.inventoryFieldOptions.load(),
      this.supplierService.load()
    ]);
    this.existingImages = existingImages;
    this.orgProfiles = profiles ?? [];
    this.isEditing = true;
  }

  cancelEdit(){
    this.isEditing = false;
    this.saveError = null;
    this.removedImageIds.clear();
    this.clearNewImages();
    this.editableContainers = [];
    this.removedContainerIds.clear();
  }

  onNewImagesSelected(event: Event){
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    const room = this.remainingImageSlots;
    this.imageLimitError = files.length > room
      ? `You can have up to ${this.maxInventoryItemImages} photos total; only the first ${room} of the ${files.length} you picked were added.`
      : null;

    for (const file of files.slice(0, room)) {
      this.newImageFiles.push(file);
      this.newImagePreviews.push(URL.createObjectURL(file));
    }
  }

  removeNewImage(index: number){
    URL.revokeObjectURL(this.newImagePreviews[index]);
    this.newImagePreviews.splice(index, 1);
    this.newImageFiles.splice(index, 1);
    this.imageLimitError = null;
  }

  toggleRemoveExistingImage(image: InventoryItemImageRecord){
    if (this.removedImageIds.has(image.id)) {
      this.removedImageIds.delete(image.id);
    } else {
      this.removedImageIds.add(image.id);
    }
    this.imageLimitError = null;
  }

  private clearNewImages(){
    for (const preview of this.newImagePreviews) {
      URL.revokeObjectURL(preview);
    }
    this.newImageFiles = [];
    this.newImagePreviews = [];
    this.imageLimitError = null;
  }

  async saveEdit(){
    if (this.isSaving) {
      return;
    }
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.saveError = null;

    const session = await this.authService.getSession();
    if (!session) {
      this.isSaving = false;
      this.saveError = 'You must be signed in to save changes.';
      return;
    }

    const rawValue = this.editForm.getRawValue();
    // Once an item has at least one container, quantityRemaining/quantityTotal
    // stop being freely editable and are always derived from the containers
    // instead (see quantityDerivedFromContainers) — overriding them here
    // before describeChanges()/the update payload/Object.assign run below
    // means the rest of this method's diff-logging and persistence logic
    // doesn't need its own separate container-aware path.
    const value = this.editableContainers.length > 0
      ? {
          ...rawValue,
          quantityRemaining: this.containerQuantitySum,
          quantityTotal: rawValue.quantityAllocated + this.containerQuantitySum
        }
      : rawValue;
    const changes = this.describeChanges(value);

    const { error } = await this.supabase.from('inventory_items').update({
      name: value.name,
      barcode: value.barcode || null,
      category: value.category || null,
      description: value.description || null,
      physical_location: value.physicalLocation || null,
      digital_location: value.digitalLocation || null,
      applicable_year: value.applicableYear || null,
      expiration_date: toIsoDateString(value.expirationDate),
      supplier_id: value.supplierId,
      supplier_lead_time: value.supplierLeadTime || null,
      order_link: value.orderLink || null,
      checked_out_to: value.checkedOutTo,
      is_checked_out: value.checkedOutTo !== null,
      quantity_total: value.quantityTotal,
      quantity_per_container: value.quantityPerContainer,
      quantity_allocated: value.quantityAllocated,
      quantity_remaining: value.quantityRemaining,
      low_quantity_threshold: value.lowQuantityThreshold,
      price_per_unit: value.pricePerUnit,
      price_per_container: value.pricePerContainer
    }).eq('id', this.data.id);

    if (error) {
      this.isSaving = false;
      this.saveError = error.message;
      return;
    }

    Object.assign(this.data, {
      name: value.name,
      barcode: value.barcode,
      category: value.category,
      description: value.description,
      physicalLocation: value.physicalLocation,
      digitalLocation: value.digitalLocation,
      applicableYear: value.applicableYear,
      expirationDate: toIsoDateString(value.expirationDate) ?? '',
      supplierId: value.supplierId,
      supplierName: resolveSupplierName(value.supplierId, this.supplierService.suppliers()),
      supplierLeadTime: value.supplierLeadTime,
      orderLink: value.orderLink,
      isCheckedOut: value.checkedOutTo !== null,
      checkedOutTo: resolveProfileName(value.checkedOutTo, this.orgProfiles),
      checkedOutToId: value.checkedOutTo,
      checkedOutToAvatarKey: resolveProfileAvatarKey(value.checkedOutTo, this.orgProfiles),
      quantityTotal: value.quantityTotal,
      quantityPerContainer: value.quantityPerContainer ?? 0,
      quantityAllocated: value.quantityAllocated,
      quantityRemaining: value.quantityRemaining,
      lowQuantityThreshold: value.lowQuantityThreshold ?? 0,
      pricePerUnit: value.pricePerUnit ?? 0,
      pricePerContainer: value.pricePerContainer ?? 0
    });

    // Image operations run after the text-field update has already
    // committed, so a failure here shouldn't discard or unlog the changes
    // above — just append whatever image summary did succeed and surface
    // the failure, keeping edit mode open so the user can retry the photos.
    const { summary: imageSummary, error: imageError } = await this.saveImageChanges();
    if (imageSummary) {
      changes.push(imageSummary);
    }

    // Container operations run independently of the image ones above — a
    // failure in one shouldn't block the other from being attempted, so
    // both always run and their errors are combined afterward.
    const { summary: containerSummary, error: containerError } = await this.saveContainerChanges();
    if (containerSummary) {
      changes.push(containerSummary);
    }

    if (changes.length > 0) {
      const profile = this.authService.profile();
      const userLabel = profile ? profileDisplayName(profile) : (session.user.email ?? 'Unknown user');
      const message = `Updated ${changes.join(', ')}`;

      const logError = await logInventoryItemActivity(this.supabase, this.data.id, session.user.id, message);
      if (!logError) {
        this.data.activityLog = [
          { timestamp: new Date().toISOString(), user: userLabel, userAvatarKey: profile?.avatar_key ?? null, message },
          ...this.data.activityLog
        ];
      }
      // Mirrors the per-item log above into the org-wide activity feed —
      // prefixed with the item name since that feed spans many items.
      await logActivity(this.supabase, session.user.id, 'inventory_item', this.data.id, `${this.data.name}: ${message}`);
    }

    this.isSaving = false;

    if (imageError || containerError) {
      this.saveError = imageError ?? containerError;
      return;
    }

    this.isEditing = false;
  }

  private async saveImageChanges(): Promise<{ summary: string | null; error: string | null }> {
    const summaries: string[] = [];

    for (const id of this.removedImageIds) {
      const image = this.existingImages.find(img => img.id === id);
      if (!image) {
        continue;
      }
      const error = await deleteInventoryItemImage(this.supabase, image);
      if (error) {
        return { summary: summaries.length > 0 ? summaries.join(', ') : null, error: `Failed to remove a photo: ${error}` };
      }
    }
    if (this.removedImageIds.size > 0) {
      summaries.push(`removed ${this.removedImageIds.size} photo(s)`);
    }

    if (this.newImageFiles.length > 0) {
      const remainingExistingCount = this.existingImages.length - this.removedImageIds.size;
      const uploadError = await uploadInventoryItemImages(this.supabase, this.data.id, this.newImageFiles, remainingExistingCount);
      if (uploadError) {
        return { summary: summaries.length > 0 ? summaries.join(', ') : null, error: `Failed to upload a photo: ${uploadError}` };
      }
      summaries.push(`added ${this.newImageFiles.length} photo(s)`);
    }

    if (summaries.length > 0) {
      this.existingImages = await loadInventoryItemImageRecords(this.supabase, this.data.id);
      const urls = this.existingImages.map(record => record.url);
      this.data.images = urls;
      this.data.image = urls[0] ?? '';
    }

    this.removedImageIds.clear();
    this.clearNewImages();

    return { summary: summaries.length > 0 ? summaries.join(', ') : null, error: null };
  }

  /** Mirrors saveImageChanges() above: diffs editableContainers against
   *  existingContainers (the state startEdit() seeded it from), writes only
   *  what actually changed (deletes/updates/inserts), and builds a
   *  human-readable summary of each change. Box numbers in that summary are
   *  each box's 1-based index within existingContainers at the *start* of
   *  this edit — stable labels for the diff even though nothing is actually
   *  persisted as a "box number" (display order is just created_at asc). */
  private async saveContainerChanges(): Promise<{ summary: string | null; error: string | null }> {
    const summaries: string[] = [];
    const labelFor = (container: InventoryItemContainer) => `Box ${this.existingContainers.indexOf(container) + 1}`;

    for (const id of this.removedContainerIds) {
      const original = this.existingContainers.find(container => container.id === id);
      const { error } = await this.supabase.from('inventory_item_containers').delete().eq('id', id);
      if (error) {
        return { summary: summaries.length > 0 ? summaries.join(', ') : null, error: `Failed to remove a container: ${error.message}` };
      }
      if (original) {
        summaries.push(`Removed ${labelFor(original)}`);
      }
    }

    for (const entry of this.editableContainers) {
      if (entry.id === null) {
        const { error } = await this.supabase.from('inventory_item_containers').insert({
          item_id: this.data.id,
          quantity: entry.quantity,
          location: entry.location || null
        });
        if (error) {
          return { summary: summaries.length > 0 ? summaries.join(', ') : null, error: `Failed to add a container: ${error.message}` };
        }
        summaries.push(`Added a container (${entry.quantity}${entry.location ? `, ${entry.location}` : ''})`);
        continue;
      }

      const original = this.existingContainers.find(container => container.id === entry.id);
      if (!original || (original.quantity === entry.quantity && original.location === entry.location)) {
        continue;
      }

      const { error } = await this.supabase.from('inventory_item_containers').update({
        quantity: entry.quantity,
        location: entry.location || null
      }).eq('id', entry.id);
      if (error) {
        return { summary: summaries.length > 0 ? summaries.join(', ') : null, error: `Failed to update a container: ${error.message}` };
      }

      const label = labelFor(original);
      if (original.quantity !== entry.quantity) {
        summaries.push(`${label} (${original.quantity} → ${entry.quantity})`);
      }
      if (original.location !== entry.location) {
        summaries.push(`${label} location (${original.location || '—'} → ${entry.location || '—'})`);
      }
    }

    if (summaries.length > 0) {
      this.existingContainers = await loadInventoryItemContainers(this.supabase, this.data.id);
    }
    this.removedContainerIds.clear();

    return { summary: summaries.length > 0 ? summaries.join(', ') : null, error: null };
  }

  private describeChanges(value: ReturnType<ModalTableComponent['editForm']['getRawValue']>): string[] {
    const before: Record<string, unknown> = {
      name: this.data.name,
      barcode: this.data.barcode,
      category: this.data.category,
      description: this.data.description,
      physicalLocation: this.data.physicalLocation,
      digitalLocation: this.data.digitalLocation,
      applicableYear: this.data.applicableYear,
      expirationDate: this.data.expirationDate,
      supplierName: this.data.supplierName,
      supplierLeadTime: this.data.supplierLeadTime,
      orderLink: this.data.orderLink,
      checkedOutTo: this.data.checkedOutTo,
      quantityTotal: this.data.quantityTotal,
      quantityPerContainer: this.data.quantityPerContainer,
      quantityAllocated: this.data.quantityAllocated,
      quantityRemaining: this.data.quantityRemaining,
      lowQuantityThreshold: this.data.lowQuantityThreshold,
      pricePerUnit: this.data.pricePerUnit,
      pricePerContainer: this.data.pricePerContainer
    };
    const after: Record<string, unknown> = {
      ...value,
      expirationDate: toIsoDateString(value.expirationDate) ?? '',
      checkedOutTo: resolveProfileName(value.checkedOutTo, this.orgProfiles),
      // Diffed by name, not the raw id `value` otherwise spreads in under
      // this same key — "Supplier name (Old Co. → New Co.)" reads far
      // better than a pair of uuids.
      supplierName: resolveSupplierName(value.supplierId, this.supplierService.suppliers())
    };

    const changes: string[] = [];
    for (const key of Object.keys(FIELD_LABELS)) {
      if (before[key] !== after[key]) {
        const beforeLabel = before[key] === '' || before[key] == null ? '—' : String(before[key]);
        const afterLabel = after[key] === '' || after[key] == null ? '—' : String(after[key]);
        changes.push(`${FIELD_LABELS[key]} (${beforeLabel} → ${afterLabel})`);
      }
    }
    return changes;
  }
}
