import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { InventoryItem, isLowStock, isOutOfStock } from '../shared/models/inventory-item.model';
import { ModalTableComponent } from '../shared/components/modal-table/modal-table.component';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { EmptyStateComponent } from '../shared/components/empty-state/empty-state.component';
import { SupabaseService } from '../core/supabase.service';
import { SiteSettingsService } from '../core/site-settings.service';
import { INVENTORY_TABLE_COLUMN_OPTIONS } from '../shared/models/inventory-table-column';
import { toInventoryItem } from '../shared/utils/inventory-item.mapper';
import { resolveProfileAvatarKey, resolveProfileName } from '../shared/utils/profile-label';
import { loadInventoryImagesByItemId } from '../shared/utils/inventory-item-images';
import { loadInventoryActivityByItemId } from '../shared/utils/inventory-item-activity';

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
        MatProgressSpinnerModule,
        MatPaginatorModule,
        MatTableModule,
        MatSortModule,
        BreadcrumbsComponent,
        EmptyStateComponent
    ],
    templateUrl: './inventory.component.html',
    styleUrl: './inventory.component.scss'
})
export class InventoryComponent implements OnInit{

  private supabase = inject(SupabaseService).client;
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private siteSettings = inject(SiteSettingsService);

  inventoryList: InventoryItem[] = [];
  isLoading = true;

  searchTerm = '';
  readonly isLowStock = isLowStock;
  readonly isOutOfStock = isOutOfStock;

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
   *  always shown; the rest come from the admin's Customize > Data setting
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
    return ['name', ...optionalColumns, 'actions'];
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
  }

  onSearchChange(value: string) {
    this.searchTerm = value;
    this.pageIndex = 0;
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
  }

  setStatusFilter(value: StatusFilter) {
    this.statusFilter = value;
    this.pageIndex = 0;
  }

  async ngOnInit() {
    await this.loadInventory();

    // Supports deep links (?item=<id>), e.g. from the "Copy link" button in
    // ModalTableComponent — opens straight to that item's detail popup if a
    // match is found. Read once from the snapshot rather than subscribing,
    // same as RegisterComponent's ?org= handling: this only ever matters on
    // initial load of this route, not on later query-param changes.
    const itemId = this.route.snapshot.queryParamMap.get('item');
    if (itemId) {
      const item = this.inventoryList.find(candidate => candidate.id === itemId);
      if (item) {
        this.showDetails(item);
      }
    }
  }

  private async loadInventory() {
    this.isLoading = true;

    const [{ data: items }, { data: profiles }] = await Promise.all([
      this.supabase.from('inventory_items').select('*').order('name'),
      this.supabase.from('profiles').select('*').order('full_name')
    ]);

    const profileList = profiles ?? [];
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
        resolveProfileName(row.retired_by, profileList)
      )
    );
    this.isLoading = false;
  }

  showDetails(item:InventoryItem){
    const dialogRef = this.dialog.open(ModalTableComponent, {
      data: item,
      width: 'clamp(45rem, 78vw, 70rem)',
      maxWidth: '90vw',
      maxHeight: '95vh',
      panelClass: 'item-details-dialog'
    });

    dialogRef.afterClosed().subscribe(() => this.loadInventory());
  }

  toggleStockLevel(value: StockLevel, checked: boolean){
    this.selectedStockLevels = checked
      ? [...this.selectedStockLevels, value]
      : this.selectedStockLevels.filter(level => level !== value);
    this.pageIndex = 0;
  }

  toggleCategory(value: string, checked: boolean){
    this.selectedCategories = checked
      ? [...this.selectedCategories, value]
      : this.selectedCategories.filter(category => category !== value);
    this.pageIndex = 0;
  }

  togglePhysicalLocation(value: string, checked: boolean){
    this.selectedPhysicalLocations = checked
      ? [...this.selectedPhysicalLocations, value]
      : this.selectedPhysicalLocations.filter(location => location !== value);
    this.pageIndex = 0;
  }

}
