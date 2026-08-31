import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InventoryItem, isCheckoutOverdue, isLowStock, isOutOfStock } from '../shared/models/inventory-item.model';
import { ModalTableComponent } from '../shared/components/modal-table/modal-table.component';
import { BreadcrumbParent, BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { EmptyStateComponent } from '../shared/components/empty-state/empty-state.component';
import { BulkActionToolbarComponent } from '../shared/components/bulk-action-toolbar/bulk-action-toolbar.component';
import { PageIntroComponent } from '../shared/components/page-intro/page-intro.component';
import { BulkReassignModalComponent, BulkReassignModalResult } from '../shared/components/bulk-reassign-modal/bulk-reassign-modal.component';
import { HasUnsavedChanges } from '../core/guards/unsaved-changes.guard';
import { confirmLeaveWithoutSaving } from '../shared/utils/confirm-leave';
import { SupabaseService } from '../core/supabase.service';
import { SiteSettingsService } from '../core/site-settings.service';
import { InventoryFieldOptionsService } from '../core/inventory-field-options.service';
import { NotificationService } from '../core/notification.service';
import { SupplierService } from '../core/supplier.service';
import { INVENTORY_TABLE_COLUMN_OPTIONS } from '../shared/models/inventory-table-column';
import { toInventoryItem } from '../shared/utils/inventory-item.mapper';
import { resolveProfileAvatarKey, resolveProfileName } from '../shared/utils/profile-label';
import { resolveSupplierName } from '../shared/utils/supplier-label';
import { loadInventoryImagesByItemId } from '../shared/utils/inventory-item-images';
import { loadInventoryActivityByItemId, logInventoryItemActivity } from '../shared/utils/inventory-item-activity';
import { logActivity } from '../shared/utils/activity-log';
import { subscribeToTableChanges } from '../shared/utils/realtime';
import { FlashTracker } from '../shared/utils/flash-tracker';
import { AuthService, Profile } from '../core/auth.service';

type StockLevel = 'out_of_stock' | 'low_stock' | 'sufficient_stock';
type StatusFilter = 'active' | 'include_retired' | 'retired_only';

@Component({
    selector: 'app-inventory',
    imports: [
        CommonModule,
        FormsModule,
        MatIconModule,
        MatFormFieldModule,
        MatInputModule,
        MatExpansionModule,
        MatCheckboxModule,
        MatRadioModule,
        MatCardModule,
        MatButtonModule,
        MatButtonToggleModule,
        MatSlideToggleModule,
        MatProgressSpinnerModule,
        MatPaginatorModule,
        MatTableModule,
        MatSortModule,
        MatTooltipModule,
        RouterLink,
        BreadcrumbsComponent,
        EmptyStateComponent,
        BulkActionToolbarComponent,
        PageIntroComponent,
        ModalTableComponent
    ],
    templateUrl: './inventory.component.html',
    styleUrl: './inventory.component.scss'
})
export class InventoryComponent implements OnInit, HasUnsavedChanges{

  private supabase = inject(SupabaseService).client;
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected siteSettings = inject(SiteSettingsService);
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private inventoryFieldOptions = inject(InventoryFieldOptionsService);
  private notification = inject(NotificationService);
  private supplierService = inject(SupplierService);

  inventoryList: InventoryItem[] = [];
  /** Set by showDetails() below — while non-null, the template swaps the
   *  whole browsing UI (search bar, filter sidebar, bulk-edit toggle,
   *  card/table grid) out for this item's detail view instead, with a Back
   *  button (rendered here, right below the breadcrumbs — see
   *  ModalTableComponent's own [showBackButton] doc comment for why it's
   *  positioned here rather than by that component itself) returning here.
   *  Every filter/search/sort/page field below stays untouched the whole
   *  time (this is a plain @if swap, not a route change), so Back lands
   *  right back on the same filtered view. */
  selectedItem: InventoryItem | null = null;
  /** Only ever populated while selectedItem is set (see the template's own
   *  @if) — queried so closeDetails() below can check for a dirty in-place
   *  edit before actually leaving; see hasUnsavedChanges()'s own doc
   *  comment. */
  @ViewChild(ModalTableComponent) modalTable?: ModalTableComponent;
  /** Bound to app-breadcrumbs' own [parentOverride] whenever selectedItem is
   *  set, so the trail reads Home / Inventory / {item name} instead of the
   *  plain Home / Inventory this route's own static breadcrumb data
   *  produces on its own — see BreadcrumbsComponent.parentOverride's own
   *  doc comment for why this needs an override at all rather than just
   *  labelOverride alone (this is the same route, not a separate detail
   *  page, so "Inventory" itself has to become the parent link rather than
   *  being replaced outright). */
  protected readonly inventoryBreadcrumbParent: BreadcrumbParent = { label: 'Inventory', link: '/inventory' };
  isLoading = true;
  /** Just a repeat-count for the loading-state skeleton grid's @for — the
   *  values themselves are never read, only the array length (6 fills a
   *  typical viewport's first screenful at the card grid's own 3-up
   *  desktop breakpoint without padding out the DOM for rows a visitor
   *  would need to scroll to see anyway). */
  readonly skeletonCards = [1, 2, 3, 4, 5, 6];

  /** Per-card entrance delay for .cascade-in (see shared/styles/_stagger.scss)
   *  — capped past a point so paging through a full 12-item grid doesn't
   *  leave the last couple cards waiting on a delay a visitor would
   *  perceive as sluggish rather than a deliberate cascade. */
  staggerDelay(index: number): number {
    return Math.min(index, 8) * 40;
  }
  /** Set when loadInventory()'s own query fails — distinct from
   *  inventoryList simply being empty (an org with genuinely no items yet),
   *  so the template can show a "couldn't load, try again" state with a
   *  Retry button (see EmptyStateComponent's variant="error") instead of
   *  the misleading "No inventory items yet." empty state a bare error swap
   *  would otherwise fall through to. */
  loadError: string | null = null;
  // Set alongside inventoryList by loadInventory() — kept around so a
  // single-row realtime refresh (refreshInventoryListItem() below) can
  // resolve checked-out-to/retirement/lock labels the same way, without
  // re-fetching every profile just to patch one item.
  private profiles: Profile[] = [];
  // Which rows should currently show the brief "someone else just changed
  // this" pulse (see shared/utils/flash-tracker.ts and its own
  // shared/styles/_realtime-flash.scss) — read from the template via
  // isFlashing(item.id).
  private flashTracker = new FlashTracker();

  // Off by default — an explicit "Bulk edit" toggle rather than always
  // showing a checkbox on every row/card, so ordinary browsing isn't
  // cluttered with a control most visits never use. Turning it off clears
  // whatever was selected (see toggleBulkEdit()) rather than leaving a
  // stale selection sitting around unseen until it's turned back on.
  bulkEditEnabled = false;

  // Bulk selection — scoped to the *filtered* set (filteredInventoryList),
  // not the current page: "Select all" (toggleSelectAll() below) selects
  // every matching item across every page, not just the 12 on screen, and
  // paging/sorting through to review a selection made this way doesn't lose
  // it (see onPageChange()/onSortChange()'s own comments). Only an actual
  // filter/search change clears it (see clearSelection()'s callers below) —
  // that's the one thing that changes *which* items are in scope at all,
  // so a stale selection from a previous filter shouldn't silently linger.
  selectedItemIds = new Set<string>();
  isBulkProcessing = false;
  bulkActionError: string | null = null;

  searchTerm = '';
  readonly isLowStock = isLowStock;
  readonly isOutOfStock = isOutOfStock;
  readonly isCheckoutOverdue = isCheckoutOverdue;

  readonly stockLevelOptions: { value: StockLevel; label: string }[] = [
    { value: 'out_of_stock', label: 'Out of stock' },
    { value: 'low_stock', label: 'Low stock' },
    { value: 'sufficient_stock', label: 'Sufficient stock' }
  ];
  selectedStockLevels: StockLevel[] = [];
  selectedCategories: string[] = [];
  selectedPhysicalLocations: string[] = [];
  statusFilter: StatusFilter = 'active';

  readonly pageSize = 12;
  pageIndex = 0;

  viewMode: 'card' | 'table' = 'card';

  /** Table-view-only column definitions for mat-table. Name and actions are
   *  always shown; the rest come from the admin's Settings > Data setting
   *  (SiteSettingsService.inventoryTableColumns). Filters
   *  INVENTORY_TABLE_COLUMN_OPTIONS's own fixed order down to whatever's
   *  enabled, rather than reading the enabled list's order directly, so the
   *  column order stays stable regardless of the order columns were toggled
   *  on/off in. A getter (not a field) so it re-evaluates as that signal
   *  changes, same reasoning as the other derived getters below. */
  get tableColumns(): string[] {
    const enabled = new Set(this.siteSettings.inventoryTableColumns());
    const optionalColumns = INVENTORY_TABLE_COLUMN_OPTIONS
      .map(option => option.key)
      .filter(key => enabled.has(key));
    // 'select' (the bulk-selection checkbox column) only shows up once
    // Bulk edit is turned on — unlike 'name'/'actions', which are always
    // shown regardless of admin settings, this one's gated by the user's
    // own toggle rather than being permanently present UI chrome.
    const selectColumn = this.bulkEditEnabled ? ['select'] : [];
    return [...selectColumn, 'name', ...optionalColumns, 'actions'];
  }

  sortActive = '';
  sortDirection: '' | 'asc' | 'desc' = '';

  setViewMode(mode: 'card' | 'table') {
    this.viewMode = mode;
  }

  onSortChange(sort: Sort) {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction;
    this.pageIndex = 0;
    // No clearSelection() — sorting reorders filteredInventoryList, it
    // never changes *which* items are in it, and selection is scoped to
    // the filtered set now (see selectedItemIds' own comment), not to
    // whatever page/order they happen to be sorted into.
  }

  // The hero band's own pulse-row figures (see the template) — deliberately
  // read straight off the full inventoryList rather than filteredInventoryList,
  // since these are meant as an org-wide "state of your stock" glance that
  // stays stable while someone's narrowing the list below with a filter, the
  // same "count everything, not just what's currently visible" reasoning
  // HeaderComponent's/HomeComponent's own restock badges already use.
  get heroItemCount(): number {
    return this.inventoryList.filter(item => item.status !== 'retired').length;
  }

  get heroRestockCount(): number {
    return this.inventoryList.filter(item => item.status !== 'retired' && (isLowStock(item) || isOutOfStock(item))).length;
  }

  get heroCheckedOutCount(): number {
    return this.inventoryList.filter(item => item.isCheckedOut).length;
  }

  get filteredInventoryList(): InventoryItem[] {
    let list = this.inventoryList;

    // 'active' (the default) hides fully retired items but still shows
    // items pending retirement; 'retired_only' flips that around instead
    // of just clearing the hide, since finding a specific retired item in
    // among everything else active isn't what that option is for.
    if (this.statusFilter === 'active') {
      list = list.filter(item => item.status !== 'retired');
    } else if (this.statusFilter === 'retired_only') {
      list = list.filter(item => item.status === 'retired');
    }

    if (this.selectedStockLevels.length > 0) {
      list = list.filter(item => this.selectedStockLevels.includes(this.stockLevelOf(item)));
    }

    if (this.selectedCategories.length > 0) {
      list = list.filter(item => this.selectedCategories.includes(item.category));
    }

    if (this.selectedPhysicalLocations.length > 0) {
      list = list.filter(item => this.selectedPhysicalLocations.includes(item.physicalLocation));
    }

    const search = this.searchTerm.trim().toLowerCase();
    if (search) {
      list = list.filter(item =>
        item.name.toLowerCase().includes(search) || item.id.toLowerCase().includes(search)
      );
    }

    return list;
  }

  /** Table view only — card view has no sortable columns, so this sits
   *  between the filter and paging steps rather than folded into
   *  filteredInventoryList itself, which the paginator's own [length]
   *  still reads directly (sorting reorders, it never changes the count). */
  get sortedInventoryList(): InventoryItem[] {
    const list = this.filteredInventoryList;
    if (!this.sortActive || !this.sortDirection) {
      return list;
    }

    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => this.compareForSort(a, b, this.sortActive) * direction);
  }

  /** Numeric columns compare directly; everything else (including dates —
   *  expirationDate is stored as plain text, not a real date type — and
   *  short strings like applicableYear) compares fine as text. */
  private static readonly NUMERIC_SORT_COLUMNS = new Set([
    'quantityTotal',
    'quantityPerContainer',
    'quantityAllocated',
    'quantityRemaining',
    'lowQuantityThreshold',
    'pricePerUnit',
    'pricePerContainer'
  ]);

  private compareForSort(a: InventoryItem, b: InventoryItem, column: string): number {
    if (column === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (column === 'status') {
      return this.statusLabel(a).localeCompare(this.statusLabel(b));
    }

    const key = column as keyof InventoryItem;
    const aValue = a[key];
    const bValue = b[key];

    if (InventoryComponent.NUMERIC_SORT_COLUMNS.has(column)) {
      return (Number(aValue) || 0) - (Number(bValue) || 0);
    }
    return String(aValue ?? '').localeCompare(String(bValue ?? ''));
  }

  /** Table view's single-status-per-row simplification of card view's
   *  simultaneous badges (retired, checked-out, low/out-of-stock, pending
   *  retirement can all show at once there) — a dense table row doesn't
   *  have room for that, so this picks the one most relevant to surface,
   *  in the same priority order the badges already imply visually. Reused
   *  for the sort comparison too, so "sort by status" matches what's
   *  actually displayed. */
  statusLabel(item: InventoryItem): string {
    if (item.status === 'retired') {
      return 'Retired';
    }
    if (item.status === 'retirement_pending') {
      return 'Pending retirement';
    }
    if (isOutOfStock(item)) {
      return 'Out of stock';
    }
    if (isLowStock(item)) {
      return 'Low stock';
    }
    if (item.isCheckedOut) {
      return 'Checked out';
    }
    return 'Available';
  }

  /** CSS class suffix for statusLabel()'s value — a plain (non-global)
   *  string replace would only swap the *first* space, silently mangling
   *  "Out of stock" (two spaces) into two separate class tokens instead of
   *  one, so this needs the regex/global form. */
  statusSlug(item: InventoryItem): string {
    return this.statusLabel(item).toLowerCase().replace(/ /g, '-');
  }

  /** The current page's slice — pageSize is fixed at 12 rather than
   *  user-adjustable, so the paginator only ever needs to drive pageIndex.
   *  Reads from sortedInventoryList rather than filteredInventoryList
   *  directly so table-view sorting (a no-op in card view, since nothing
   *  sets sortActive there) is reflected in what actually gets paged. */
  get pagedInventoryList(): InventoryItem[] {
    const start = this.pageIndex * this.pageSize;
    return this.sortedInventoryList.slice(start, start + this.pageSize);
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    // No clearSelection() — "Select all" spans every filtered item, not
    // just the current page (see selectedItemIds' own comment), so paging
    // through to check on a selection made elsewhere shouldn't lose it.
  }

  onSearchChange(value: string) {
    this.searchTerm = value;
    this.pageIndex = 0;
    this.clearSelection();
  }

  /** Distinct values actually present on loaded items, not just the admin's
   *  approved dropdown list — so filtering still works for older items whose
   *  category/location predates that list (or was since removed from it). */
  get categoryFilterOptions(): string[] {
    return this.distinctValues(this.inventoryList.map(item => item.category));
  }

  get physicalLocationFilterOptions(): string[] {
    return this.distinctValues(this.inventoryList.map(item => item.physicalLocation));
  }

  private distinctValues(values: string[]): string[] {
    return [...new Set(values.filter(value => !!value))].sort();
  }

  /** A search-within-the-filter-panel box only earns its keep once there's
   *  actually enough options to make scanning them by eye annoying — below
   *  this, the checkbox list alone is faster than typing. */
  readonly filterOptionSearchThreshold = 8;

  categoryOptionSearch = '';
  physicalLocationOptionSearch = '';

  get filteredCategoryFilterOptions(): string[] {
    return this.searchWithin(this.categoryFilterOptions, this.categoryOptionSearch);
  }

  get filteredPhysicalLocationFilterOptions(): string[] {
    return this.searchWithin(this.physicalLocationFilterOptions, this.physicalLocationOptionSearch);
  }

  /** Narrows an *already-loaded* options list by a locally-typed search
   *  term — this never touches selectedCategories/selectedPhysicalLocations
   *  or filteredInventoryList, it only changes which checkboxes are shown
   *  to pick from, same as scrolling would. */
  private searchWithin(options: string[], term: string): string[] {
    const search = term.trim().toLowerCase();
    return search ? options.filter(option => option.toLowerCase().includes(search)) : options;
  }

  private stockLevelOf(item: InventoryItem): StockLevel {
    if (item.quantityRemaining <= 0) {
      return 'out_of_stock';
    }
    if (item.quantityRemaining < item.lowQuantityThreshold) {
      return 'low_stock';
    }
    return 'sufficient_stock';
  }

  get hasActiveFilters(): boolean {
    return this.selectedStockLevels.length > 0
      || this.selectedCategories.length > 0
      || this.selectedPhysicalLocations.length > 0
      || !!this.searchTerm
      || this.statusFilter !== 'active';
  }

  clearFilters() {
    this.selectedStockLevels = [];
    this.selectedCategories = [];
    this.selectedPhysicalLocations = [];
    this.categoryOptionSearch = '';
    this.physicalLocationOptionSearch = '';
    this.searchTerm = '';
    this.statusFilter = 'active';
    this.pageIndex = 0;
    this.clearSelection();
  }

  setStatusFilter(value: StatusFilter) {
    this.statusFilter = value;
    this.pageIndex = 0;
    this.clearSelection();
  }

  async ngOnInit() {
    await Promise.all([
      this.loadInventory(),
      // Backs the bulk-reassign dialog's category/physical-location
      // dropdowns — same admin-curated option list ManageInventoryComponent's
      // create form and ModalTableComponent's edit form already use.
      this.inventoryFieldOptions.load()
    ]);

    // Supports deep links (?item=<id>), e.g. from the "Copy link" button in
    // ModalTableComponent — opens straight to that item's detail view if a
    // match is found. Read once from the snapshot rather than subscribing,
    // same as RegisterComponent's ?org= handling: this only ever matters on
    // initial load of this route, not on later query-param changes. Sets
    // selectedItem directly rather than going through showDetails() — the
    // URL already has ?item= on it, so there's nothing to navigate.
    const itemId = this.route.snapshot.queryParamMap.get('item');
    if (itemId) {
      const item = this.inventoryList.find(candidate => candidate.id === itemId);
      if (item) {
        this.selectedItem = item;
      }
    }

    // Live updates from other users/tabs. No client-side organization_id
    // filter — see subscribeToTableChanges()'s own comment for why RLS
    // alone is the right boundary here, same as loadInventory()'s own
    // unfiltered query above.
    const channel = subscribeToTableChanges(this.supabase, 'inventory_items', payload => {
      const changedItemId = payload.eventType === 'DELETE' ? payload.old.id : payload.new.id;
      if (!changedItemId) {
        return;
      }
      // Flash only once the patched row is actually reflected — not on
      // DELETE, since the row's about to disappear rather than update.
      void this.refreshInventoryListItem(changedItemId).then(() => {
        if (payload.eventType !== 'DELETE') {
          this.flashTracker.flash(changedItemId);
        }
      });
    });

    // A second, separate subscription for a pure photo add/remove — the
    // inventory_items subscription above never sees one of those, since
    // adding/removing a row from inventory_item_images doesn't touch its
    // parent item's own row at all (unlike a container edit, which always
    // re-derives and writes quantity_remaining/quantity_total back onto the
    // parent, so it's already covered by the subscription above). Reuses
    // refreshInventoryListItem() verbatim — it already reloads this item's
    // images on every call, regardless of why it was called.
    const imagesChannel = subscribeToTableChanges(this.supabase, 'inventory_item_images', payload => {
      const changedItemId = payload.eventType === 'DELETE' ? payload.old.item_id : payload.new.item_id;
      if (!changedItemId) {
        return;
      }
      void this.refreshInventoryListItem(changedItemId).then(() => {
        this.flashTracker.flash(changedItemId);
      });
    });
    this.destroyRef.onDestroy(() => {
      this.flashTracker.clear();
      void this.supabase.removeChannel(channel);
      void this.supabase.removeChannel(imagesChannel);
    });
  }

  isFlashing(itemId: string): boolean {
    return this.flashTracker.isFlashing(itemId);
  }

  /** The realtime change handler wired up in ngOnInit() above — mirrors
   *  ManageInventoryComponent's refreshInventoryItem(), but re-maps into
   *  InventoryItem (this page needs the full mapped shape, not raw rows)
   *  and patches the *existing object in place* via Object.assign rather
   *  than replacing the array slot. That matters here specifically:
   *  showDetails() hands ModalTableComponent this exact InventoryItem
   *  instance by reference (see its own doc comment), so an already-open
   *  detail popup needs the live update to land on that same object, not
   *  just on a new one sitting in inventoryList that the popup never sees. */
  private async refreshInventoryListItem(itemId: string) {
    const { data: row } = await this.supabase.from('inventory_items').select('*').eq('id', itemId).maybeSingle();
    const index = this.inventoryList.findIndex(item => item.id === itemId);

    if (!row) {
      if (index !== -1) {
        this.inventoryList = this.inventoryList.filter(item => item.id !== itemId);
      }
      return;
    }

    const [imagesByItemId, activityByItemId] = await Promise.all([
      loadInventoryImagesByItemId(this.supabase, [itemId]),
      loadInventoryActivityByItemId(this.supabase, [itemId], this.profiles)
    ]);

    const updated = toInventoryItem(
      row,
      imagesByItemId.get(itemId) ?? [],
      resolveProfileName(row.checked_out_to, this.profiles),
      activityByItemId.get(itemId) ?? [],
      resolveProfileAvatarKey(row.checked_out_to, this.profiles),
      resolveProfileName(row.retirement_requested_by, this.profiles),
      resolveProfileName(row.retired_by, this.profiles),
      resolveProfileName(row.locked_by, this.profiles),
      resolveSupplierName(row.supplier_id, this.supplierService.suppliers())
    );

    if (index === -1) {
      // New insert — appended rather than re-sorted into place, same known
      // cosmetic gap ManageInventoryComponent.refreshInventoryItem() already
      // has; resolved by the next full reload (e.g. next visit to this page).
      this.inventoryList = [...this.inventoryList, updated];
    } else {
      Object.assign(this.inventoryList[index], updated);
    }
  }

  /** Re-runs loadInventory() after a failed load — the Retry button's own
   *  handler (see the template's loadError branch). A thin public wrapper
   *  rather than exposing loadInventory() itself, matching this app's
   *  existing "keep the loader private, expose a purpose-named entry point"
   *  shape. */
  retryLoad() {
    void this.loadInventory();
  }

  private async loadInventory() {
    this.isLoading = true;
    this.loadError = null;

    // supplierService.load() runs alongside the two queries below (not in
    // ngOnInit's own Promise.all one level up) specifically so it's
    // guaranteed to have landed before the toInventoryItem() mapping further
    // down reads supplierService.suppliers() — sitting in the outer
    // Promise.all instead would race this method's own query/mapping steps,
    // with no guarantee suppliers finish loading first.
    const [{ data: items, error: itemsError }, { data: profiles }] = await Promise.all([
      this.supabase.from('inventory_items').select('*').order('name'),
      this.supabase.from('profiles').select('*').eq('organization_id', this.authService.organizationId()!).order('full_name'),
      this.supplierService.load()
    ]);

    if (itemsError) {
      this.loadError = itemsError.message;
      this.isLoading = false;
      return;
    }

    const profileList = profiles ?? [];
    this.profiles = profileList;
    const rows = items ?? [];
    const itemIds = rows.map(row => row.id);
    const [imagesByItemId, activityByItemId] = await Promise.all([
      loadInventoryImagesByItemId(this.supabase, itemIds),
      loadInventoryActivityByItemId(this.supabase, itemIds, profileList)
    ]);

    this.inventoryList = rows.map(row =>
      toInventoryItem(
        row,
        imagesByItemId.get(row.id) ?? [],
        resolveProfileName(row.checked_out_to, profileList),
        activityByItemId.get(row.id) ?? [],
        resolveProfileAvatarKey(row.checked_out_to, profileList),
        resolveProfileName(row.retirement_requested_by, profileList),
        resolveProfileName(row.retired_by, profileList),
        resolveProfileName(row.locked_by, profileList),
        resolveSupplierName(row.supplier_id, this.supplierService.suppliers())
      )
    );
    this.isLoading = false;
  }

  /** No reload needed once back — `item` here is the exact same
   *  InventoryItem instance living in `inventoryList` (filteredInventoryList/
   *  sortedInventoryList/pagedInventoryList all filter/sort/slice that same
   *  array without ever cloning its elements), and every write path in
   *  ModalTableComponent (saveEdit, the retirement actions, container/photo
   *  saves) mutates `this.data` in place rather than replacing it. So a save
   *  in the detail view already updates this list live, through that shared
   *  reference, the moment it happens — refetching the whole inventory again
   *  on Back would be pure waste (a full items+images+activity refetch just
   *  to look at an item and click back).
   *
   *  Swaps the browsing UI out for the detail view inline (see selectedItem's
   *  own doc comment) rather than opening ModalTableComponent as a MatDialog,
   *  and mirrors that in the URL (?item=<id>) so the deep link this page
   *  already supports on load also works from a plain click — including the
   *  browser's own Back button, since this pushes a new history entry rather
   *  than replacing the current one. */
  showDetails(item: InventoryItem) {
    this.selectedItem = item;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { item: item.id },
      queryParamsHandling: 'merge'
    });
  }

  /** The detail view's own Back button — clears selectedItem and drops
   *  ?item= from the URL, landing back on this same filtered/searched/sorted
   *  view (none of that state lives in the URL or is touched by showDetails()
   *  above, so there's nothing else to restore). Confirms first if a
   *  ModalTableComponent edit is actually dirty — a tab/view swap like this
   *  is plain component state, not a route change, so unsavedChangesGuard
   *  (route-level, see hasUnsavedChanges() below) never sees it; this is
   *  that same protection's in-page counterpart, same "public gate +
   *  private apply" split ManageInventoryComponent.setViewMode() already
   *  establishes so the actual close stays directly testable without
   *  faking the confirm dialog. */
  closeDetails() {
    if (!this.hasUnsavedChanges()) {
      this.applyCloseDetails();
      return;
    }

    void confirmLeaveWithoutSaving(
      this.dialog,
      'You have unsaved changes on this item that will be lost if you leave it.'
    ).then(confirmed => {
      if (confirmed) {
        this.applyCloseDetails();
      }
    });
  }

  private applyCloseDetails() {
    this.selectedItem = null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { item: null },
      queryParamsHandling: 'merge'
    });
  }

  /** Real, would-actually-lose-data input sitting in the item detail view's
   *  own edit form right now — delegates to ModalTableComponent's own
   *  hasUnsavedChanges(), which is false whenever it isn't mid-edit. Backs
   *  both the route-level unsavedChangesGuard (navigating off this page
   *  entirely) and closeDetails() above (leaving just this item view) — see
   *  unsaved-changes.guard.ts's own doc comment for why this checks the
   *  underlying state directly rather than also requiring selectedItem to
   *  be set: modalTable is only ever populated while it is, so the
   *  optional chain already covers that. */
  hasUnsavedChanges(): boolean {
    return this.modalTable?.hasUnsavedChanges() ?? false;
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

  toggleStockLevel(value: StockLevel, checked: boolean){
    this.selectedStockLevels = checked
      ? [...this.selectedStockLevels, value]
      : this.selectedStockLevels.filter(level => level !== value);
    this.pageIndex = 0;
    this.clearSelection();
  }

  toggleCategory(value: string, checked: boolean){
    this.selectedCategories = checked
      ? [...this.selectedCategories, value]
      : this.selectedCategories.filter(category => category !== value);
    this.pageIndex = 0;
    this.clearSelection();
  }

  togglePhysicalLocation(value: string, checked: boolean){
    this.selectedPhysicalLocations = checked
      ? [...this.selectedPhysicalLocations, value]
      : this.selectedPhysicalLocations.filter(location => location !== value);
    this.pageIndex = 0;
    this.clearSelection();
  }

  // --- Bulk selection ---

  /** Every selectable item matching the current filters — *not* just the
   *  current page (see selectedItemIds's own comment) — so this is what the
   *  header row's compact "Select all" checkbox, its tri-state, and
   *  toggleSelectAll() below all operate over. */
  get selectableFilteredItems(): InventoryItem[] {
    return this.filteredInventoryList.filter(item => this.canSelectItem(item));
  }

  /** Mirrors ModalTableComponent's own Edit-button gating
   *  (`!data.isLocked || authService.canManage()`) — a locked item's
   *  checkbox is disabled for anyone who can't manage it, so nobody can
   *  select an item a bulk reassign would just fail on anyway. */
  canSelectItem(item: InventoryItem): boolean {
    return !item.isLocked || this.authService.canManage();
  }

  /** Backs the compact "Select all" checkbox up in the header row (next to
   *  the Bulk edit toggle) — a separate, smaller control from
   *  BulkActionToolbarComponent's own (now hidden for this page via
   *  hideSelectAllCheckbox, see its own doc comment), so this component
   *  computes its own tri-state rather than reading it off that shared one. */
  get allSelectableItemsSelected(): boolean {
    return this.selectableFilteredItems.length > 0
      && this.selectableFilteredItems.every(item => this.selectedItemIds.has(item.id));
  }

  get someSelectableItemsSelected(): boolean {
    return this.selectedItemIds.size > 0 && !this.allSelectableItemsSelected;
  }

  isSelected(itemId: string): boolean {
    return this.selectedItemIds.has(itemId);
  }

  toggleItemSelection(itemId: string, checked: boolean) {
    const next = new Set(this.selectedItemIds);
    if (checked) {
      next.add(itemId);
    } else {
      next.delete(itemId);
    }
    this.selectedItemIds = next;
  }

  /** Selects (or deselects) every selectable item matching the current
   *  filters, across every page — not just whatever's on screen right now. */
  toggleSelectAll(checked: boolean) {
    const next = new Set(this.selectedItemIds);
    for (const item of this.selectableFilteredItems) {
      if (checked) {
        next.add(item.id);
      } else {
        next.delete(item.id);
      }
    }
    this.selectedItemIds = next;
  }

  clearSelection() {
    this.selectedItemIds = new Set();
    this.bulkActionError = null;
  }

  toggleBulkEdit(enabled: boolean) {
    this.bulkEditEnabled = enabled;
    if (!enabled) {
      this.clearSelection();
    }
  }

  openBulkReassign() {
    const dialogRef = this.dialog.open(BulkReassignModalComponent, {
      data: {
        itemCount: this.selectedItemIds.size,
        categoryOptions: this.inventoryFieldOptions.optionsFor('category'),
        physicalLocationOptions: this.inventoryFieldOptions.optionsFor('physical_location')
      },
      width: 'clamp(24rem, 45vw, 30rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((result?: BulkReassignModalResult) => {
      if (!result) {
        return;
      }
      void this.applyBulkReassign(result);
    });
  }

  /** Loops the selected ids rather than a single `.update().in('id', ids)`
   *  call — each item needs its own before/after diff (for the activity
   *  log, same "Label (before → after)" format ModalTableComponent.
   *  describeChanges() uses) and its own independent success/failure, since
   *  a locked item a non-manager selected... shouldn't have been selectable
   *  in the first place (canSelectItem() already prevents that), but a
   *  concurrent lock from another tab is still possible, so this tallies
   *  failures rather than assuming they can't happen. No manual list
   *  reload afterward — the existing realtime subscription (see ngOnInit)
   *  patches each updated row in automatically, no "skip my own changes"
   *  filter on it. */
  private async applyBulkReassign(result: BulkReassignModalResult) {
    const session = await this.authService.getSession();
    if (!session) {
      return;
    }

    const ids = [...this.selectedItemIds];
    this.isBulkProcessing = true;
    this.bulkActionError = null;

    let failedCount = 0;
    let changedCount = 0;

    await Promise.all(ids.map(async id => {
      const item = this.inventoryList.find(candidate => candidate.id === id);
      if (!item) {
        return;
      }

      const updates: { category?: string | null; physical_location?: string | null } = {};
      const changes: string[] = [];

      if (result.category && result.category.value !== item.category) {
        updates.category = result.category.value || null;
        changes.push(`Category (${item.category || '—'} → ${result.category.value || '—'})`);
      }
      if (result.physicalLocation && result.physicalLocation.value !== item.physicalLocation) {
        updates.physical_location = result.physicalLocation.value || null;
        changes.push(`Physical location (${item.physicalLocation || '—'} → ${result.physicalLocation.value || '—'})`);
      }

      if (changes.length === 0) {
        // Nothing actually changes for this item (e.g. bulk-setting a
        // category it's already in) — not a failure, just nothing to do.
        return;
      }

      const { error } = await this.supabase.from('inventory_items').update(updates).eq('id', id);
      if (error) {
        failedCount++;
        return;
      }

      changedCount++;
      const message = `Updated ${changes.join(', ')}`;
      // Best-effort, same as every other activity-log write in this app —
      // a failed log shouldn't undo (or block reporting) the change itself.
      await logInventoryItemActivity(this.supabase, id, session.user.id, message);
      await logActivity(this.supabase, session.user.id, 'inventory_item', id, `${item.name}: ${message}`);
    }));

    this.isBulkProcessing = false;

    if (changedCount > 0) {
      this.notification.success(`Updated ${changedCount} item${changedCount === 1 ? '' : 's'}`);
    }
    // Not clearSelection() — that also nulls bulkActionError, which would
    // erase the message being set right below before anyone could read it.
    this.selectedItemIds = new Set();
    if (failedCount > 0) {
      this.bulkActionError = `${failedCount} of ${ids.length} item${ids.length === 1 ? '' : 's'} couldn't be updated — check they're not locked.`;
    }
  }

}
