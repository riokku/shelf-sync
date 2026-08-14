import { Component, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { ImageGalleryComponent } from '../image-gallery/image-gallery.component';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { CreateTaskModalComponent } from '../create-task-modal/create-task-modal.component';
import { DiscardInventoryModalComponent, DiscardInventoryModalResult } from '../discard-inventory-modal/discard-inventory-modal.component';
import { RequestRetirementModalComponent, RequestRetirementModalResult } from '../request-retirement-modal/request-retirement-modal.component';
import { AuthService, Profile } from '../../../core/auth.service';
import { SupabaseService } from '../../../core/supabase.service';
import { InventoryFieldOptionsService } from '../../../core/inventory-field-options.service';
import { toIsoDateString, parseIsoDate } from '../../utils/date';
import { loadInventoryActivityByItemId, logInventoryItemActivity } from '../../utils/inventory-item-activity';
import { profileDisplayName, resolveProfileAvatarKey, resolveProfileName } from '../../utils/profile-label';
import {
  InventoryItemImageRecord,
  deleteInventoryItemImage,
  loadInventoryItemImageRecords,
  uploadInventoryItemImages
} from '../../utils/inventory-item-images';

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
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

export class ModalTableComponent {
  dialogRef = inject(MatDialogRef<ModalTableComponent>);
  data = inject<InventoryItem>(MAT_DIALOG_DATA);
  protected authService = inject(AuthService);
  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);
  private dialog = inject(MatDialog);
  private supabase = inject(SupabaseService).client;

  idCopied = false;
  linkCopied = false;

  get isLowStock(): boolean {
    return isLowStock(this.data);
  }

  isEditing = false;
  isSaving = false;
  saveError: string | null = null;

  isDiscarding = false;
  discardError: string | null = null;

  /** Shared across request/cancel/approve/decline — they're all single
   *  short-lived RPC calls, so one flag disabling all four buttons while any
   *  is in flight is enough; no need for a separate one per action. */
  isProcessingRetirement = false;
  retirementError: string | null = null;

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

  private withCurrentValue(approved: string[], current: string): string[] {
    return current && !approved.includes(current) ? [current, ...approved] : approved;
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
    category: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    physicalLocation: new FormControl('', { nonNullable: true }),
    digitalLocation: new FormControl('', { nonNullable: true }),
    applicableYear: new FormControl('', { nonNullable: true }),
    expirationDate: new FormControl<Date | null>(null),
    supplierName: new FormControl('', { nonNullable: true }),
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

  /** Open with any authenticated user, mirroring the edit flow above — same
   *  RLS widened-to-any-authenticated-user policy backs both. Splits the
   *  quantity/notes prompt (this dialog) from the actual write (below) so
   *  the persistence + local-state-sync logic can stay next to saveEdit()'s,
   *  which it closely mirrors. */
  openDiscard(){
    if (this.data.quantityRemaining <= 0 || this.isDiscarding) {
      return;
    }

    const dialogRef = this.dialog.open(DiscardInventoryModalComponent, {
      data: { itemName: this.data.name, quantityRemaining: this.data.quantityRemaining },
      width: 'clamp(28rem, 50vw, 34rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((result: DiscardInventoryModalResult | undefined) => {
      if (result) {
        void this.performDiscard(result.quantity, result.notes);
      }
    });
  }

  private async performDiscard(quantity: number, notes: string){
    this.isDiscarding = true;
    this.discardError = null;

    const session = await this.authService.getSession();
    if (!session) {
      this.isDiscarding = false;
      this.discardError = 'You must be signed in to discard inventory.';
      return;
    }

    const beforeRemaining = this.data.quantityRemaining;
    const beforeTotal = this.data.quantityTotal;
    const afterRemaining = Math.max(beforeRemaining - quantity, 0);
    const afterTotal = Math.max(beforeTotal - quantity, 0);

    const { error } = await this.supabase.from('inventory_items').update({
      quantity_remaining: afterRemaining,
      quantity_total: afterTotal
    }).eq('id', this.data.id);

    if (error) {
      this.isDiscarding = false;
      this.discardError = error.message;
      return;
    }

    this.data.quantityRemaining = afterRemaining;
    this.data.quantityTotal = afterTotal;

    const profile = this.authService.profile();
    const userLabel = profile ? profileDisplayName(profile) : (session.user.email ?? 'Unknown user');
    const message = `Discarded ${quantity} unit(s) (Quantity remaining ${beforeRemaining} → ${afterRemaining}). Reason: ${notes}`;

    const logError = await logInventoryItemActivity(this.supabase, this.data.id, session.user.id, message);
    if (!logError) {
      this.data.activityLog = [
        { timestamp: new Date().toISOString(), user: userLabel, userAvatarKey: profile?.avatar_key ?? null, message },
        ...this.data.activityLog
      ];
    }

    this.isDiscarding = false;
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
          this.data.status = 'retirement_pending';
          this.data.retirementRequestedById = profile?.id ?? null;
          this.data.retirementRequestedByLabel = profile ? profileDisplayName(profile) : '';
          this.data.retirementRequestNote = result.note;
          this.data.retirementRequestedAt = new Date().toISOString();
        }
      );
    });
  }

  cancelRetirementRequest(){
    void this.runRetirementAction(
      () => this.supabase.rpc('cancel_item_retirement_request', { item_id: this.data.id }),
      () => this.resetRetirementToActive()
    );
  }

  approveRetirement(){
    void this.runRetirementAction(
      () => this.supabase.rpc('approve_item_retirement', { item_id: this.data.id }),
      () => {
        const profile = this.authService.profile();
        this.data.status = 'retired';
        this.data.retiredByLabel = profile ? profileDisplayName(profile) : '';
        this.data.retiredAt = new Date().toISOString();
      }
    );
  }

  declineRetirement(){
    void this.runRetirementAction(
      () => this.supabase.rpc('decline_item_retirement', { item_id: this.data.id }),
      () => this.resetRetirementToActive()
    );
  }

  private resetRetirementToActive(){
    this.data.status = 'active';
    this.data.retirementRequestedById = null;
    this.data.retirementRequestedByLabel = '';
    this.data.retirementRequestNote = '';
    this.data.retirementRequestedAt = '';
  }

  /** Shared runner for all four retirement RPCs: applies the known local
   *  effect (rather than reloading the whole item) on success, same
   *  optimistic-update approach performDiscard() uses above, then refreshes
   *  just the activity log — the RPC itself writes that log row server-side,
   *  so it can't be predicted client-side the way the log message can for
   *  edits/discards done directly from here. */
  private async runRetirementAction(
    call: () => PromiseLike<{ error: { message: string } | null }>,
    applyLocalChange: () => void
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
  }

  private async refreshActivityLog(){
    const { data: profiles } = await this.supabase.from('profiles').select('*').order('full_name');
    const activityByItemId = await loadInventoryActivityByItemId(this.supabase, [this.data.id], profiles ?? []);
    this.data.activityLog = activityByItemId.get(this.data.id) ?? [];
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
      category: this.data.category,
      description: this.data.description,
      physicalLocation: this.data.physicalLocation,
      digitalLocation: this.data.digitalLocation,
      applicableYear: this.data.applicableYear,
      expirationDate: parseIsoDate(this.data.expirationDate),
      supplierName: this.data.supplierName,
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
    this.removedImageIds.clear();
    this.clearNewImages();
    const [existingImages, { data: profiles }] = await Promise.all([
      loadInventoryItemImageRecords(this.supabase, this.data.id),
      this.supabase.from('profiles').select('*').order('full_name'),
      this.inventoryFieldOptions.load()
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
    if (this.editForm.invalid || this.isSaving) {
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

    const value = this.editForm.getRawValue();
    const changes = this.describeChanges(value);

    const { error } = await this.supabase.from('inventory_items').update({
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
      category: value.category,
      description: value.description,
      physicalLocation: value.physicalLocation,
      digitalLocation: value.digitalLocation,
      applicableYear: value.applicableYear,
      expirationDate: toIsoDateString(value.expirationDate) ?? '',
      supplierName: value.supplierName,
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
    }

    this.isSaving = false;

    if (imageError) {
      this.saveError = imageError;
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

  private describeChanges(value: ReturnType<ModalTableComponent['editForm']['getRawValue']>): string[] {
    const before: Record<string, unknown> = {
      name: this.data.name,
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
      checkedOutTo: resolveProfileName(value.checkedOutTo, this.orgProfiles)
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
