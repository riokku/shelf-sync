import { Component, DestroyRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { NotificationService } from '../../core/notification.service';
import { AuthService, Profile } from '../../core/auth.service';
import { InventoryFieldOptionsService } from '../../core/inventory-field-options.service';
import { SiteSettingsService } from '../../core/site-settings.service';
import { SupplierService } from '../../core/supplier.service';
import { InventoryFormFieldKey } from '../../shared/models/inventory-form-field';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { ModalTableComponent } from '../../shared/components/modal-table/modal-table.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { BulkActionToolbarComponent } from '../../shared/components/bulk-action-toolbar/bulk-action-toolbar.component';
import { Database } from '../../shared/models/database.types';
import { ActivityLogEntry, MAX_INVENTORY_ITEM_IMAGES } from '../../shared/models/inventory-item.model';
import { toIsoDateString } from '../../shared/utils/date';
import { toInventoryItem } from '../../shared/utils/inventory-item.mapper';
import { resolveProfileAvatarKey, resolveProfileName } from '../../shared/utils/profile-label';
import { resolveSupplierName } from '../../shared/utils/supplier-label';
import { loadInventoryImagesByItemId, uploadInventoryItemImages } from '../../shared/utils/inventory-item-images';
import { loadInventoryActivityByItemId } from '../../shared/utils/inventory-item-activity';
import { sumContainerQuantity } from '../../shared/utils/inventory-item-containers';
import { logActivity } from '../../shared/utils/activity-log';
import { BARCODE_FEATURE_ENABLED, parseItemQrValue } from '../../shared/utils/barcode';
import { HasUnsavedChanges } from '../../core/guards/unsaved-changes.guard';
import { subscribeToTableChanges } from '../../shared/utils/realtime';
import { FlashTracker } from '../../shared/utils/flash-tracker';
import { buildInventoryExportCsv, downloadCsv } from '../../shared/utils/inventory-export';

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
    MatCheckboxModule,
    BreadcrumbsComponent,
    EmptyStateComponent,
    BulkActionToolbarComponent
  ],
  templateUrl: './manage-inventory.component.html',
  styleUrl: './manage-inventory.component.scss',
})
export class ManageInventoryComponent implements OnInit, HasUnsavedChanges {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);
  protected siteSettings = inject(SiteSettingsService);
  protected supplierService = inject(SupplierService);
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /** Whether an admin-optional field is shown on the "Create item" form
   *  below (Settings > Data's "Inventory data" section) — name and
   *  quantity tracking aren't gated by this since they're never optional,
   *  see shared/models/inventory-form-field.ts's own doc comment. */
  fieldEnabled(key: InventoryFormFieldKey): boolean {
    return this.siteSettings.inventoryFormFields().includes(key);
  }

  /** Template-facing flag for the barcode field's own kill switch (see
   *  BARCODE_FEATURE_ENABLED's own doc comment) — ANDed with fieldEnabled()
   *  rather than folded into it, since fieldEnabled() is a general-purpose
   *  "does this org's site_settings enable this field" check, not the place
   *  for a temporary, product-wide feature gate. An org whose stored
   *  settings already include 'barcode' (the default before this flag
   *  existed) still needs the field hidden, which fieldEnabled() alone
   *  can't guarantee. */
  readonly barcodeFeatureEnabled = BARCODE_FEATURE_ENABLED;

  private assignableProfiles: Profile[] = [];

  viewMode: 'create' | 'retirements' = 'create';

  private isViewMode(value: string | null): value is 'create' | 'retirements' {
    return value === 'create' || value === 'retirements';
  }

  // Mirrors SettingsComponent's own setViewMode()/?tab= handling — see its
  // doc comment for the full reasoning. replaceUrl avoids piling up a
  // history entry per tab click.
  //
  // Confirms first if leaving 'create' would lose real unsaved input — a
  // tab switch is plain component state, not a route change, so
  // unsavedChangesGuard (route-level) never sees it; this is that same
  // protection's in-page counterpart. Split into this public gate +
  // applyViewMode() below (rather than doing the mode switch inline in the
  // dialog's subscribe callback) so applyViewMode() stays directly
  // testable without faking the confirm dialog — same reasoning
  // ManageTasksComponent.performBulkDelete()'s own doc comment gives for
  // splitting a confirm-gated action out of its trigger.
  setViewMode(mode: 'create' | 'retirements') {
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

  private applyViewMode(mode: 'create' | 'retirements') {
    this.viewMode = mode;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: mode },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  /** Real, would-actually-lose-data input sitting in the create form right
   *  now — a dirty field, a photo picked but not yet uploaded, or a
   *  container/box added but not yet saved. Backs both the route-level
   *  unsavedChangesGuard (navigating off this page entirely) and
   *  setViewMode() above (switching to the Requests tab) — see
   *  unsaved-changes.guard.ts's own doc comment for why this checks the
   *  underlying state directly rather than also requiring `viewMode ===
   *  'create'`: the data doesn't stop being unsaved just because a
   *  different tab happens to be showing at the moment. */
  hasUnsavedChanges(): boolean {
    return this.inventoryForm.dirty || this.selectedImageFiles.length > 0 || this.newContainers.length > 0;
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

  // Still the full list, not just pending-retirement items — beyond
  // pendingRetirementItems below, this also backs refreshInventoryItem()'s
  // patch-in-place after the detail popup closes and the barcode-scan
  // duplicate check in submitInventoryItem() (see their own comments), both
  // of which need every item, not just the ones with a pending request.
  allInventoryItems: InventoryItemRow[] = [];
  isLoadingInventoryList = true;
  /** Set when loadInventoryItems()'s own query fails — see
   *  InventoryComponent's identical loadError field for the full reasoning.
   *  Left set (rather than cleared) across a later successful reload
   *  attempt only via retryLoad(); a failed *background* refresh (e.g.
   *  after approving a retirement) doesn't clear allInventoryItems, so the
   *  page keeps showing whatever it last successfully loaded rather than
   *  going blank. */
  loadError: string | null = null;
  private inventoryImagesByItemId = new Map<string, string[]>();
  private inventoryActivityByItemId = new Map<string, ActivityLogEntry[]>();
  // Which rows should currently show the brief "someone else just changed
  // this" pulse (see shared/utils/flash-tracker.ts and its own
  // shared/styles/_realtime-flash.scss) — read from the template via
  // isFlashing(item.id).
  private flashTracker = new FlashTracker();

  get pendingRetirementItems(): InventoryItemRow[] {
    return this.allInventoryItems
      .filter(item => item.status === 'retirement_pending')
      .sort((a, b) => (a.retirement_requested_at ?? '').localeCompare(b.retirement_requested_at ?? ''));
  }

  get pendingRetirementCount(): number {
    return this.pendingRetirementItems.length;
  }

  // Bulk selection for the Requests tab — CLAUDE.md's own bulk-edit
  // documentation flagged this tab as "out of scope for this pass, a
  // natural future extension of the same shared toolbar" when the
  // Inventory/Manage Tasks/Manage Team bulk actions first shipped; this is
  // that extension. No search/filter here (same as Manage Team's own
  // pending-join-requests list), so a plain Set is enough — nothing to
  // intersect against the way ManageTasksComponent's filtered "All tasks"
  // selection needs to.
  selectedRetirementItemIds = new Set<string>();

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
    supplierId: new FormControl<string | null>(null),
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
    // Reflects the active tab in the URL (?tab=retirements) — see
    // SettingsComponent's own ?tab= handling for the full reasoning.
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (this.isViewMode(tabParam)) {
      this.viewMode = tabParam;
    }

    await Promise.all([
      this.loadProfiles(),
      this.inventoryFieldOptions.load(),
      this.supplierService.load()
    ]);
    await this.loadInventoryItems();

    // Live updates from other users/tabs — reuses refreshInventoryItem()
    // verbatim (already handles insert/update/delete correctly, since
    // openInventoryDetail()'s own afterClosed() already relies on it for
    // exactly that shape of single-row refresh). No client-side
    // organization_id filter — see subscribeToTableChanges()'s own comment
    // for why RLS alone is the right boundary here, same as every other
    // query on this page.
    const channel = subscribeToTableChanges(this.supabase, 'inventory_items', payload => {
      const itemId = payload.eventType === 'DELETE' ? payload.old.id : payload.new.id;
      if (!itemId) {
        return;
      }
      // Flash only once the patched row is actually reflected — not on
      // DELETE, since the row's about to disappear rather than update, and
      // not from openInventoryDetail()'s own afterClosed() call below
      // (that's this user's own edit, already visible to them without a
      // flash to draw their eye to it).
      void this.refreshInventoryItem(itemId).then(() => {
        if (payload.eventType !== 'DELETE') {
          this.flashTracker.flash(itemId);
        }
      });
    });
    this.destroyRef.onDestroy(() => {
      this.flashTracker.clear();
      void this.supabase.removeChannel(channel);
    });
  }

  isFlashing(itemId: string): boolean {
    return this.flashTracker.isFlashing(itemId);
  }

  private async loadProfiles() {
    const { data } = await this.supabase.from('profiles').select('*').order('full_name');
    this.assignableProfiles = data ?? [];
  }

  /** Re-runs loadInventoryItems() after a failed load — the Requests tab's
   *  Retry button handler (see the template's loadError branch). */
  retryLoad() {
    void this.loadInventoryItems();
  }

  private async loadInventoryItems() {
    this.isLoadingInventoryList = true;

    const { data, error } = await this.supabase
      .from('inventory_items')
      .select('*')
      .order('name');

    if (error) {
      this.loadError = error.message;
      this.isLoadingInventoryList = false;
      return;
    }
    this.loadError = null;

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

  /** Every item in the org, active/pending/retired alike — not just what's
   *  currently visible on this page (this page has no filter/search of its
   *  own to scope by) — with its full data plus complete activity history
   *  folded into one row each, via toInventoryItem() + buildInventoryExportCsv()
   *  (see that util's own doc comment for the CSV shape). Synchronous: every
   *  input (allInventoryItems, the images/activity maps, profiles,
   *  suppliers) is already loaded by the time this page is interactive. */
  exportInventoryCsv() {
    const suppliers = this.supplierService.suppliers();
    const items = this.allInventoryItems.map(row =>
      toInventoryItem(
        row,
        this.inventoryImagesByItemId.get(row.id) ?? [],
        resolveProfileName(row.checked_out_to, this.assignableProfiles),
        this.inventoryActivityByItemId.get(row.id) ?? [],
        resolveProfileAvatarKey(row.checked_out_to, this.assignableProfiles),
        resolveProfileName(row.retirement_requested_by, this.assignableProfiles),
        resolveProfileName(row.retired_by, this.assignableProfiles),
        resolveProfileName(row.locked_by, this.assignableProfiles),
        resolveSupplierName(row.supplier_id, suppliers)
      )
    );

    const csv = buildInventoryExportCsv(items);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`shelfsync-inventory-export-${date}.csv`, csv);
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

  isRetirementSelected(itemId: string): boolean {
    return this.selectedRetirementItemIds.has(itemId);
  }

  toggleRetirementSelection(itemId: string, checked: boolean) {
    const next = new Set(this.selectedRetirementItemIds);
    if (checked) {
      next.add(itemId);
    } else {
      next.delete(itemId);
    }
    this.selectedRetirementItemIds = next;
  }

  toggleSelectAllRetirements(checked: boolean) {
    const next = new Set(this.selectedRetirementItemIds);
    for (const item of this.pendingRetirementItems) {
      if (checked) {
        next.add(item.id);
      } else {
        next.delete(item.id);
      }
    }
    this.selectedRetirementItemIds = next;
  }

  clearRetirementSelection() {
    this.selectedRetirementItemIds = new Set();
    this.retirementError = null;
  }

  // Confirmed first, same reasoning as the single-item approveRetirement()
  // above — irreversible, no "cancel" the way a pending request has.
  applyBulkApproveRetirement() {
    if (this.isProcessingRetirement) {
      return;
    }
    const ids = [...this.selectedRetirementItemIds];
    if (ids.length === 0) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: `Approve ${ids.length} retirement request${ids.length === 1 ? '' : 's'}?`,
        message: `Retire ${ids.length} item${ids.length === 1 ? '' : 's'}? They'll be hidden from the default inventory view. This can't be undone.`,
        confirmLabel: 'Approve',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        void this.performBulkApproveRetirement(ids);
      }
    });
  }

  /** The actual approve/tally work, split out of applyBulkApproveRetirement()
   *  above so it's directly testable without faking the confirm dialog —
   *  same split ManageTeamComponent's applyBulkApprove()/performBulkDeny()
   *  pair (and this page's own setViewMode()/applyViewMode()) already use.
   *  No RPC here accepts an array of ids, so this loops the existing
   *  single-item RPC client-side (Promise.all) and tallies success/failure,
   *  same "no all-or-nothing assumption" shape every other bulk action in
   *  this app already follows. */
  private async performBulkApproveRetirement(ids: string[]) {
    this.isProcessingRetirement = true;
    this.retirementError = null;

    const results = await Promise.all(ids.map(id => this.supabase.rpc('approve_item_retirement', { item_id: id })));
    const failedCount = results.filter(result => result.error).length;
    const succeededCount = ids.length - failedCount;

    await this.loadInventoryItems();
    this.isProcessingRetirement = false;
    this.selectedRetirementItemIds = new Set();

    if (succeededCount > 0) {
      this.notification.success(`Retired ${succeededCount} item${succeededCount === 1 ? '' : 's'}`);
    }
    if (failedCount > 0) {
      this.retirementError = `${failedCount} of ${ids.length} item${ids.length === 1 ? '' : 's'} couldn't be retired.`;
    }
  }

  // No confirm dialog, same as the single-item declineRetirement() above —
  // declining just leaves the item active, nothing destructive to guard.
  async applyBulkDeclineRetirement() {
    if (this.isProcessingRetirement) {
      return;
    }
    const ids = [...this.selectedRetirementItemIds];
    if (ids.length === 0) {
      return;
    }

    this.isProcessingRetirement = true;
    this.retirementError = null;

    const results = await Promise.all(ids.map(id => this.supabase.rpc('decline_item_retirement', { item_id: id })));
    const failedCount = results.filter(result => result.error).length;
    const succeededCount = ids.length - failedCount;

    await this.loadInventoryItems();
    this.isProcessingRetirement = false;
    this.selectedRetirementItemIds = new Set();

    if (succeededCount > 0) {
      this.notification.success(`Declined ${succeededCount} retirement request${succeededCount === 1 ? '' : 's'}`);
    }
    if (failedCount > 0) {
      this.retirementError = `${failedCount} of ${ids.length} request${ids.length === 1 ? '' : 's'} couldn't be declined.`;
    }
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
        resolveProfileName(row.locked_by, this.assignableProfiles),
        resolveSupplierName(row.supplier_id, this.supplierService.suppliers())
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

  // Also the realtime change handler wired up in ngOnInit() — a single-row
  // refresh already covers insert (index === -1 below), update, and delete
  // (row comes back null), which is exactly the three postgres_changes
  // event types.
  private async refreshInventoryItem(itemId: string) {
    const { data: row } = await this.supabase.from('inventory_items').select('*').eq('id', itemId).maybeSingle();

    const index = this.allInventoryItems.findIndex(item => item.id === itemId);
    if (!row) {
      // Not expected from openInventoryDetail()'s own dialog (it never
      // deletes items) and inventory_items has no hard-delete path in the
      // app today either — but the realtime handler above will still see a
      // DELETE if a row is ever removed some other way (Studio, a future
      // feature), so this stays handled gracefully rather than assuming
      // it can't happen.
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
      supplier_id: value.supplierId,
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
