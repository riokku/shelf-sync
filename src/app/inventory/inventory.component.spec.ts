import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { InventoryComponent } from './inventory.component';
import { AuthService } from '../core/auth.service';
import { SiteSettingsService } from '../core/site-settings.service';
import { SupabaseService } from '../core/supabase.service';
import { InventoryTableColumnKey } from '../shared/models/inventory-table-column';
import { createFakeAuthService, createFakeProfile, createFakeSiteSettingsService, createFakeSupabaseService, createTestInventoryItem, createTestInventoryItemRow } from '../testing/fakes';

describe('InventoryComponent', () => {
  let component: InventoryComponent;
  let fixture: ComponentFixture<InventoryComponent>;
  let fakeSiteSettings: SiteSettingsService;

  beforeEach(async () => {
    fakeSiteSettings = createFakeSiteSettingsService();

    await TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [
        provideRouter([]),
        // ngOnInit loads inventory on construction — faked so this hits
        // nothing real, same reasoning as every other spec that does this.
        { provide: SupabaseService, useValue: createFakeSupabaseService() },
        // Real SiteSettingsService constructs the real AuthService, whose
        // constructor calls supabase.auth.getSession() — the fake
        // SupabaseService above has no .auth, so that would throw. The
        // component now also injects AuthService directly (canSelectItem()'s
        // canManage() check), so it needs its own fake regardless.
        { provide: SiteSettingsService, useValue: fakeSiteSettings },
        { provide: AuthService, useValue: createFakeAuthService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InventoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('filteredInventoryList', () => {
    beforeEach(() => {
      component.inventoryList = [
        createTestInventoryItem({ id: 'active-1', name: 'Cordless Drill', category: 'Tools', physicalLocation: 'Warehouse A', quantityRemaining: 20, lowQuantityThreshold: 5 }),
        createTestInventoryItem({ id: 'low-stock-1', name: 'Safety Goggles', category: 'Safety', physicalLocation: 'Warehouse B', quantityRemaining: 2, lowQuantityThreshold: 5 }),
        createTestInventoryItem({ id: 'out-of-stock-1', name: 'Bluetooth Speaker', category: 'Electronics', physicalLocation: 'Warehouse A', quantityRemaining: 0, lowQuantityThreshold: 5 }),
        createTestInventoryItem({ id: 'pending-1', name: 'Filing Cabinet', category: 'Furniture', physicalLocation: 'Warehouse B', status: 'retirement_pending' }),
        createTestInventoryItem({ id: 'retired-1', name: 'Old Printer', category: 'Electronics', physicalLocation: 'Warehouse A', status: 'retired' })
      ];
    });

    it('hides fully retired items by default but keeps items pending retirement', () => {
      const ids = component.filteredInventoryList.map(item => item.id);
      expect(ids).toContain('pending-1');
      expect(ids).not.toContain('retired-1');
      expect(ids.length).toBe(4);
    });

    it('shows every status when the filter is "include_retired"', () => {
      component.statusFilter = 'include_retired';
      expect(component.filteredInventoryList.length).toBe(5);
    });

    it('shows only retired items when the filter is "retired_only" — pending is excluded too', () => {
      component.statusFilter = 'retired_only';
      const ids = component.filteredInventoryList.map(item => item.id);
      expect(ids).toEqual(['retired-1']);
    });

    it('filters by stock level', () => {
      component.selectedStockLevels = ['out_of_stock'];
      expect(component.filteredInventoryList.map(item => item.id)).toEqual(['out-of-stock-1']);
    });

    it('filters by category', () => {
      component.selectedCategories = ['Electronics'];
      // retired-1 is also Electronics but stays excluded by the default
      // active-only status filter — filters combine with AND, not OR.
      expect(component.filteredInventoryList.map(item => item.id)).toEqual(['out-of-stock-1']);
    });

    it('filters by physical location', () => {
      component.selectedPhysicalLocations = ['Warehouse B'];
      expect(component.filteredInventoryList.map(item => item.id)).toEqual(['low-stock-1', 'pending-1']);
    });

    it('searches by name, case-insensitively', () => {
      component.searchTerm = 'drill';
      expect(component.filteredInventoryList.map(item => item.id)).toEqual(['active-1']);
    });

    it('searches by id', () => {
      component.searchTerm = 'low-stock-1';
      expect(component.filteredInventoryList.map(item => item.id)).toEqual(['low-stock-1']);
    });

    it('combines multiple active filters', () => {
      component.selectedCategories = ['Tools', 'Safety'];
      component.selectedStockLevels = ['low_stock'];
      expect(component.filteredInventoryList.map(item => item.id)).toEqual(['low-stock-1']);
    });
  });

  describe('pagedInventoryList', () => {
    beforeEach(() => {
      component.inventoryList = Array.from({ length: 14 }, (_, i) =>
        createTestInventoryItem({ id: `item-${i}`, name: `Item ${i}` })
      );
    });

    it('returns only the first page (12) by default', () => {
      expect(component.pagedInventoryList.length).toBe(12);
      expect(component.pagedInventoryList[0].id).toBe('item-0');
    });

    it('returns the remainder on the second page', () => {
      component.onPageChange({ pageIndex: 1, pageSize: 12, length: 14 });
      expect(component.pagedInventoryList.map(item => item.id)).toEqual(['item-12', 'item-13']);
    });
  });

  describe('hasActiveFilters / clearFilters', () => {
    it('is false with no filters set', () => {
      expect(component.hasActiveFilters).toBe(false);
    });

    it('is true when the status filter is not "active"', () => {
      component.statusFilter = 'include_retired';
      expect(component.hasActiveFilters).toBe(true);
    });

    it('is true when a search term is set', () => {
      component.searchTerm = 'drill';
      expect(component.hasActiveFilters).toBe(true);
    });

    it('clearFilters resets every filter and the page index', () => {
      component.selectedStockLevels = ['low_stock'];
      component.selectedCategories = ['Tools'];
      component.selectedPhysicalLocations = ['Warehouse A'];
      component.searchTerm = 'drill';
      component.statusFilter = 'retired_only';
      component.pageIndex = 2;

      component.clearFilters();

      expect(component.selectedStockLevels).toEqual([]);
      expect(component.selectedCategories).toEqual([]);
      expect(component.selectedPhysicalLocations).toEqual([]);
      expect(component.searchTerm).toBe('');
      expect(component.statusFilter).toBe('active');
      expect(component.pageIndex).toBe(0);
      expect(component.hasActiveFilters).toBe(false);
    });
  });

  describe('categoryFilterOptions / physicalLocationFilterOptions', () => {
    beforeEach(() => {
      component.inventoryList = [
        createTestInventoryItem({ id: '1', category: 'Tools', physicalLocation: 'Warehouse B' }),
        createTestInventoryItem({ id: '2', category: 'Electronics', physicalLocation: 'Warehouse A' }),
        createTestInventoryItem({ id: '3', category: 'Tools', physicalLocation: 'Warehouse A' }),
        createTestInventoryItem({ id: '4', category: '', physicalLocation: '' })
      ];
    });

    it('returns distinct, sorted, non-empty category values', () => {
      expect(component.categoryFilterOptions).toEqual(['Electronics', 'Tools']);
    });

    it('returns distinct, sorted, non-empty physical location values', () => {
      expect(component.physicalLocationFilterOptions).toEqual(['Warehouse A', 'Warehouse B']);
    });
  });

  describe('filteredCategoryFilterOptions / filteredPhysicalLocationFilterOptions', () => {
    beforeEach(() => {
      component.inventoryList = [
        createTestInventoryItem({ id: '1', category: 'Tools', physicalLocation: 'Warehouse B' }),
        createTestInventoryItem({ id: '2', category: 'Electronics', physicalLocation: 'Warehouse A' })
      ];
    });

    it('returns every option when no search term is set', () => {
      expect(component.filteredCategoryFilterOptions).toEqual(['Electronics', 'Tools']);
    });

    it('narrows options by a case-insensitive, partial search term', () => {
      component.categoryOptionSearch = 'tool';
      expect(component.filteredCategoryFilterOptions).toEqual(['Tools']);

      component.physicalLocationOptionSearch = 'WAREHOUSE B';
      expect(component.filteredPhysicalLocationFilterOptions).toEqual(['Warehouse B']);
    });

    it('returns an empty list when nothing matches, without touching the underlying options', () => {
      component.categoryOptionSearch = 'nonexistent';
      expect(component.filteredCategoryFilterOptions).toEqual([]);
      expect(component.categoryFilterOptions).toEqual(['Electronics', 'Tools']);
    });

    it('clearFilters resets both search terms', () => {
      component.categoryOptionSearch = 'tool';
      component.physicalLocationOptionSearch = 'warehouse';

      component.clearFilters();

      expect(component.categoryOptionSearch).toBe('');
      expect(component.physicalLocationOptionSearch).toBe('');
    });
  });

  describe('toggleStockLevel / toggleCategory / togglePhysicalLocation', () => {
    it('adds a value when checked and removes it when unchecked', () => {
      component.toggleStockLevel('low_stock', true);
      expect(component.selectedStockLevels).toEqual(['low_stock']);

      component.toggleStockLevel('out_of_stock', true);
      expect(component.selectedStockLevels).toEqual(['low_stock', 'out_of_stock']);

      component.toggleStockLevel('low_stock', false);
      expect(component.selectedStockLevels).toEqual(['out_of_stock']);
    });

    it('resets the page index whenever a filter is toggled', () => {
      component.pageIndex = 3;
      component.toggleCategory('Tools', true);
      expect(component.pageIndex).toBe(0);
    });
  });

  describe('sortedInventoryList (table view)', () => {
    beforeEach(() => {
      component.inventoryList = [
        createTestInventoryItem({ id: '1', name: 'Widget', category: 'Tools', quantityRemaining: 20 }),
        createTestInventoryItem({ id: '2', name: 'Anvil', category: 'Hardware', quantityRemaining: 5 }),
        createTestInventoryItem({ id: '3', name: 'Crate', category: 'Storage', quantityRemaining: 12 })
      ];
    });

    it('returns filteredInventoryList unchanged when no sort is active', () => {
      expect(component.sortedInventoryList.map(i => i.id)).toEqual(['1', '2', '3']);
    });

    it('sorts by a string column ascending/descending', () => {
      component.onSortChange({ active: 'name', direction: 'asc' });
      expect(component.sortedInventoryList.map(i => i.name)).toEqual(['Anvil', 'Crate', 'Widget']);

      component.onSortChange({ active: 'name', direction: 'desc' });
      expect(component.sortedInventoryList.map(i => i.name)).toEqual(['Widget', 'Crate', 'Anvil']);
    });

    it('sorts by a numeric column', () => {
      component.onSortChange({ active: 'quantityRemaining', direction: 'asc' });
      expect(component.sortedInventoryList.map(i => i.id)).toEqual(['2', '3', '1']);
    });

    it('sorts by any other InventoryItem field generically, e.g. a plain string column like barcode', () => {
      component.inventoryList = [
        createTestInventoryItem({ id: '1', barcode: 'ccc' }),
        createTestInventoryItem({ id: '2', barcode: 'aaa' }),
        createTestInventoryItem({ id: '3', barcode: 'bbb' })
      ];
      component.onSortChange({ active: 'barcode', direction: 'asc' });
      expect(component.sortedInventoryList.map(i => i.id)).toEqual(['2', '3', '1']);
    });

    it('falls back to the unsorted list once sorting is cleared (MatSort\'s third click state)', () => {
      component.onSortChange({ active: 'name', direction: 'asc' });
      component.onSortChange({ active: 'name', direction: '' });
      expect(component.sortedInventoryList.map(i => i.id)).toEqual(['1', '2', '3']);
    });

    it('resets the page index on every sort change', () => {
      component.pageIndex = 2;
      component.onSortChange({ active: 'name', direction: 'asc' });
      expect(component.pageIndex).toBe(0);
    });
  });

  describe('tableColumns', () => {
    /** Rebuilds the component against a fresh SiteSettingsService fake —
     *  TestBed.overrideProvider can't retarget a provider after the module's
     *  already been instantiated (done once in the outer beforeEach), so
     *  these tests reset and reconfigure the whole testing module instead. */
    async function createComponentWithColumns(columns: InventoryTableColumnKey[]): Promise<InventoryComponent> {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [InventoryComponent],
        providers: [
          provideRouter([]),
          { provide: SupabaseService, useValue: createFakeSupabaseService() },
          { provide: SiteSettingsService, useValue: createFakeSiteSettingsService({ inventoryTableColumns: columns }) },
          { provide: AuthService, useValue: createFakeAuthService() }
        ]
      }).compileComponents();

      const localFixture = TestBed.createComponent(InventoryComponent);
      localFixture.detectChanges();
      return localFixture.componentInstance;
    }

    it('always includes name first and actions last', () => {
      expect(component.tableColumns[0]).toBe('name');
      expect(component.tableColumns[component.tableColumns.length - 1]).toBe('actions');
    });

    it('includes every optional column when all are enabled (the default), with no select column since Bulk edit starts off', () => {
      expect(component.tableColumns).toEqual(['name', 'category', 'physicalLocation', 'quantityRemaining', 'status', 'actions']);
    });

    it('only includes the admin-enabled optional columns, in canonical order regardless of the enabled order', async () => {
      const localComponent = await createComponentWithColumns(['status', 'category']);
      expect(localComponent.tableColumns).toEqual(['name', 'category', 'status', 'actions']);
    });

    it('drops down to just name/actions when no optional columns are enabled', async () => {
      const localComponent = await createComponentWithColumns([]);
      expect(localComponent.tableColumns).toEqual(['name', 'actions']);
    });

    it('adds a leading select column once Bulk edit is turned on, and drops it again once turned off', () => {
      component.toggleBulkEdit(true);
      expect(component.tableColumns[0]).toBe('select');
      expect(component.tableColumns).toEqual(['select', 'name', 'category', 'physicalLocation', 'quantityRemaining', 'status', 'actions']);

      component.toggleBulkEdit(false);
      expect(component.tableColumns).toEqual(['name', 'category', 'physicalLocation', 'quantityRemaining', 'status', 'actions']);
    });
  });

  describe('statusLabel / statusSlug', () => {
    it('prioritizes retired over every other state', () => {
      const item = createTestInventoryItem({ status: 'retired', quantityRemaining: 0, isCheckedOut: true });
      expect(component.statusLabel(item)).toBe('Retired');
      expect(component.statusSlug(item)).toBe('retired');
    });

    it('labels an out-of-stock item correctly, including the slug for its multi-word label', () => {
      const item = createTestInventoryItem({ quantityRemaining: 0, lowQuantityThreshold: 5 });
      expect(component.statusLabel(item)).toBe('Out of stock');
      // Regression coverage: a naive non-global string replace only swaps
      // the *first* space, mangling this into two class tokens instead of
      // one ("out-of stock") — see statusSlug()'s own doc comment.
      expect(component.statusSlug(item)).toBe('out-of-stock');
    });

    it('labels a low-stock item', () => {
      const item = createTestInventoryItem({ quantityRemaining: 3, lowQuantityThreshold: 5 });
      expect(component.statusLabel(item)).toBe('Low stock');
    });

    it('labels a checked-out item with sufficient stock', () => {
      const item = createTestInventoryItem({ quantityRemaining: 20, lowQuantityThreshold: 5, isCheckedOut: true });
      expect(component.statusLabel(item)).toBe('Checked out');
    });

    it('falls back to Available', () => {
      const item = createTestInventoryItem({ quantityRemaining: 20, lowQuantityThreshold: 5 });
      expect(component.statusLabel(item)).toBe('Available');
      expect(component.statusSlug(item)).toBe('available');
    });
  });

  describe('bulk selection', () => {
    beforeEach(() => {
      component.inventoryList = [
        createTestInventoryItem({ id: '1', isLocked: false }),
        createTestInventoryItem({ id: '2', isLocked: false }),
        createTestInventoryItem({ id: '3', isLocked: true })
      ];
    });

    describe('canSelectItem() / selectablePagedItems', () => {
      it('is selectable when unlocked, regardless of role', () => {
        expect(component.canSelectItem(component.inventoryList[0])).toBeTrue();
      });

      it('is not selectable when locked and the caller cannot manage (mirrors ModalTableComponent\'s own Edit-button gating)', () => {
        expect(component.canSelectItem(component.inventoryList[2])).toBeFalse();
      });

      it('excludes locked items from selectablePagedItems for a non-manager', () => {
        expect(component.selectablePagedItems.map(item => item.id)).toEqual(['1', '2']);
      });
    });

    describe('toggleItemSelection() / isSelected()', () => {
      it('adds and removes an id', () => {
        component.toggleItemSelection('1', true);
        expect(component.isSelected('1')).toBeTrue();

        component.toggleItemSelection('1', false);
        expect(component.isSelected('1')).toBeFalse();
      });
    });

    describe('toggleSelectAllOnPage()', () => {
      it('selects every selectable item on the page, skipping locked ones', () => {
        component.toggleSelectAllOnPage(true);
        expect([...component.selectedItemIds].sort()).toEqual(['1', '2']);
      });

      it('deselects every selectable item on the page', () => {
        component.toggleSelectAllOnPage(true);
        component.toggleSelectAllOnPage(false);
        expect(component.selectedItemIds.size).toBe(0);
      });
    });

    describe('toggleBulkEdit()', () => {
      it('is off by default', () => {
        expect(component.bulkEditEnabled).toBeFalse();
      });

      it('turning it on just flips the flag, leaving any selection alone', () => {
        component.toggleItemSelection('1', true);
        component.toggleBulkEdit(true);

        expect(component.bulkEditEnabled).toBeTrue();
        expect(component.isSelected('1')).toBeTrue();
      });

      it('turning it off clears the selection and any bulk error', () => {
        component.toggleBulkEdit(true);
        component.toggleItemSelection('1', true);
        component.bulkActionError = 'something went wrong';

        component.toggleBulkEdit(false);

        expect(component.bulkEditEnabled).toBeFalse();
        expect(component.selectedItemIds.size).toBe(0);
        expect(component.bulkActionError).toBeNull();
      });
    });

    describe('clearSelection()', () => {
      it('empties the selection and clears any bulk error', () => {
        component.toggleItemSelection('1', true);
        component.bulkActionError = 'something went wrong';

        component.clearSelection();

        expect(component.selectedItemIds.size).toBe(0);
        expect(component.bulkActionError).toBeNull();
      });
    });

    // Every filter/search/sort/page change clears selection — see
    // selectedItemIds's own doc comment for why (each of these changes
    // which items are actually visible/selectable).
    describe('clears selection on filter/sort/page changes', () => {
      beforeEach(() => {
        component.toggleItemSelection('1', true);
      });

      it('onSearchChange', () => {
        component.onSearchChange('drill');
        expect(component.selectedItemIds.size).toBe(0);
      });

      it('toggleStockLevel', () => {
        component.toggleStockLevel('low_stock', true);
        expect(component.selectedItemIds.size).toBe(0);
      });

      it('toggleCategory', () => {
        component.toggleCategory('Tools', true);
        expect(component.selectedItemIds.size).toBe(0);
      });

      it('togglePhysicalLocation', () => {
        component.togglePhysicalLocation('Warehouse A', true);
        expect(component.selectedItemIds.size).toBe(0);
      });

      it('setStatusFilter', () => {
        component.setStatusFilter('retired_only');
        expect(component.selectedItemIds.size).toBe(0);
      });

      it('clearFilters', () => {
        component.clearFilters();
        expect(component.selectedItemIds.size).toBe(0);
      });

      it('onSortChange', () => {
        component.onSortChange({ active: 'name', direction: 'asc' });
        expect(component.selectedItemIds.size).toBe(0);
      });

      it('onPageChange', () => {
        component.onPageChange({ pageIndex: 1, pageSize: 12, length: 20 });
        expect(component.selectedItemIds.size).toBe(0);
      });
    });
  });
});

/** A Supabase fake purpose-built for applyBulkReassign()'s own tests below —
 *  tracks every `inventory_items.update(...).eq('id', id)` call (so a test
 *  can assert exactly what payload was sent, and which ids were touched at
 *  all) and lets a test mark specific ids as failing, to cover the
 *  partial-failure tally path. Everything else (profiles/field-options
 *  loads, the activity-log inserts) resolves as a generic empty success,
 *  same as the shared fake elsewhere in this file. */
function createBulkReassignFakeSupabaseService(failingIds: Set<string> = new Set<string>()) {
  const updateCalls: { id: string; values: Record<string, unknown> }[] = [];
  const insertedTables: string[] = [];

  function builder(table: string) {
    let capturedId: string | undefined;
    let pendingUpdateValues: Record<string, unknown> | undefined;
    const b: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => {
        if (pendingUpdateValues !== undefined && capturedId && failingIds.has(capturedId)) {
          resolve({ error: { message: 'Update failed' } });
        } else {
          resolve({ data: [], error: null });
        }
      },
    };
    for (const method of ['select', 'order', 'single', 'maybeSingle']) {
      b[method] = () => b;
    }
    b['update'] = (values: Record<string, unknown>) => {
      pendingUpdateValues = values;
      return b;
    };
    b['insert'] = (_values: unknown) => {
      insertedTables.push(table);
      return b;
    };
    // .eq('id', id) is always called *after* .update(values) in the real
    // call chain (update(...).eq('id', id)), so this is where the pending
    // update actually gets recorded, with the values already in hand.
    b['eq'] = (column: string, value: string) => {
      if (column === 'id') {
        capturedId = value;
        if (pendingUpdateValues !== undefined) {
          updateCalls.push({ id: value, values: pendingUpdateValues });
        }
      }
      return b;
    };
    return b;
  }

  const service = {
    client: { from: (table: string) => builder(table) }
  } as unknown as SupabaseService;

  return { service, updateCalls, insertedTables };
}

describe('InventoryComponent applyBulkReassign()', () => {
  async function createComponent(supabaseService: SupabaseService) {
    await TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: supabaseService },
        { provide: SiteSettingsService, useValue: createFakeSiteSettingsService() },
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile()) }
      ]
    }).compileComponents();

    const localFixture = TestBed.createComponent(InventoryComponent);
    localFixture.detectChanges();
    await localFixture.whenStable();
    return localFixture.componentInstance;
  }

  function callApplyBulkReassign(component: InventoryComponent, result: unknown): Promise<void> {
    return (component as unknown as { applyBulkReassign: (r: unknown) => Promise<void> }).applyBulkReassign(result);
  }

  it('updates only the checked field(s), skipping any item already at that value', async () => {
    const { service, updateCalls } = createBulkReassignFakeSupabaseService();
    const component = await createComponent(service);
    component.inventoryList = [
      createTestInventoryItem({ id: '1', category: 'Tools', physicalLocation: 'Warehouse A' }),
      createTestInventoryItem({ id: '2', category: 'Safety', physicalLocation: 'Warehouse A' })
    ];
    component.selectedItemIds = new Set(['1', '2']);
    const notificationSuccessSpy = spyOn((component as unknown as { notification: { success: (msg: string) => void } }).notification, 'success');

    // Item '2' is already in 'Safety' — bulk-setting category to 'Safety'
    // should update '1' only, not touch '2' at all.
    await callApplyBulkReassign(component, { category: { value: 'Safety' }, physicalLocation: null });

    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].id).toBe('1');
    expect(updateCalls[0].values).toEqual({ category: 'Safety' });
    expect(notificationSuccessSpy).toHaveBeenCalledWith('Updated 1 item');
    expect(component.selectedItemIds.size).toBe(0);
    expect(component.bulkActionError).toBeNull();
  });

  it('updates both fields at once when both are checked', async () => {
    const { service, updateCalls } = createBulkReassignFakeSupabaseService();
    const component = await createComponent(service);
    component.inventoryList = [createTestInventoryItem({ id: '1', category: 'Tools', physicalLocation: 'Warehouse A' })];
    component.selectedItemIds = new Set(['1']);

    await callApplyBulkReassign(component, { category: { value: 'Safety' }, physicalLocation: { value: 'Warehouse B' } });

    expect(updateCalls[0].values).toEqual({ category: 'Safety', physical_location: 'Warehouse B' });
  });

  it('reports a partial failure without losing the successes', async () => {
    const { service, updateCalls } = createBulkReassignFakeSupabaseService(new Set(['2']));
    const component = await createComponent(service);
    component.inventoryList = [
      createTestInventoryItem({ id: '1', category: 'Tools' }),
      createTestInventoryItem({ id: '2', category: 'Tools' })
    ];
    component.selectedItemIds = new Set(['1', '2']);
    const notificationSuccessSpy = spyOn((component as unknown as { notification: { success: (msg: string) => void } }).notification, 'success');

    await callApplyBulkReassign(component, { category: { value: 'Safety' }, physicalLocation: null });

    expect(updateCalls.map(call => call.id).sort()).toEqual(['1', '2']);
    expect(notificationSuccessSpy).toHaveBeenCalledWith('Updated 1 item');
    expect(component.bulkActionError).toBe("1 of 2 items couldn't be updated — check they're not locked.");
  });

  it('does nothing (no update, no toast) when every selected item already matches', async () => {
    const { service, updateCalls } = createBulkReassignFakeSupabaseService();
    const component = await createComponent(service);
    component.inventoryList = [createTestInventoryItem({ id: '1', category: 'Safety' })];
    component.selectedItemIds = new Set(['1']);
    const notificationSuccessSpy = spyOn((component as unknown as { notification: { success: (msg: string) => void } }).notification, 'success');

    await callApplyBulkReassign(component, { category: { value: 'Safety' }, physicalLocation: null });

    expect(updateCalls.length).toBe(0);
    expect(notificationSuccessSpy).not.toHaveBeenCalled();
  });
});

/** Captures the postgres_changes callback ngOnInit()'s realtime
 *  subscription registers, exposing it as emitChange() — mirrors the same
 *  pattern established in manage-inventory.component.spec.ts and
 *  auth.service.spec.ts. `singleResult` only once `.single()`/
 *  `.maybeSingle()` has been called in the chain (refreshInventoryListItem()'s
 *  own row lookup) — an empty list otherwise (loadInventory()'s initial
 *  load, and the images/activity list queries refreshInventoryListItem()
 *  also makes). */
function createRealtimeCapturingSupabaseService(singleResult: { data: unknown; error: null }) {
  let capturedCallback: ((payload: unknown) => void) | null = null;
  function builder() {
    let wantsSingle = false;
    const b: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => resolve(wantsSingle ? singleResult : { data: [], error: null }),
    };
    for (const method of ['select', 'eq', 'neq', 'not', 'in', 'gte', 'lt', 'order', 'limit', 'insert', 'update', 'delete', 'upsert']) {
      b[method] = () => b;
    }
    b['single'] = () => { wantsSingle = true; return b; };
    b['maybeSingle'] = () => { wantsSingle = true; return b; };
    return b;
  }
  const channel: Record<string, unknown> = {
    on: (_type: string, _filter: unknown, callback: (payload: unknown) => void) => {
      capturedCallback = callback;
      return channel;
    },
    subscribe: () => channel,
  };
  const service = {
    client: { from: () => builder(), rpc: () => builder(), channel: () => channel, removeChannel: async () => ({ status: 'ok' }) }
  } as unknown as SupabaseService;
  return { service, emitChange: (payload: unknown) => capturedCallback?.(payload) };
}

describe('InventoryComponent realtime updates', () => {
  // fakeAsync()/tick() rather than await fixture.whenStable() — the change
  // handler's own async chain (a row lookup, then a *second* Promise.all
  // for images/activity) needs a deterministic flush; whenStable() proved
  // unreliable for asserting on the tail end of that specific shape here.
  it('patches the existing InventoryItem instance in place when another user updates it', fakeAsync(() => {
    const updatedRow = createTestInventoryItemRow({ id: 'item-1', name: 'Updated Name' });
    const { service, emitChange } = createRealtimeCapturingSupabaseService({ data: updatedRow, error: null });

    TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: service },
        { provide: SiteSettingsService, useValue: createFakeSiteSettingsService() },
        { provide: AuthService, useValue: createFakeAuthService() }
      ]
    });

    const fixture = TestBed.createComponent(InventoryComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    // The exact same object identity showDetails() would hand
    // ModalTableComponent by reference — Object.assign should patch *this*
    // instance, not just replace the array slot with a different object.
    const existingItem = createTestInventoryItem({ id: 'item-1', name: 'Old Name' });
    component.inventoryList = [existingItem];

    emitChange({ eventType: 'UPDATE', new: updatedRow, old: { id: 'item-1' } });
    tick();

    expect(component.inventoryList[0]).toBe(existingItem);
    expect(component.inventoryList[0].name).toBe('Updated Name');
  }));

  it('flashes the updated row, then clears the flash after it fades', fakeAsync(() => {
    const updatedRow = createTestInventoryItemRow({ id: 'item-1', name: 'Updated Name' });
    const { service, emitChange } = createRealtimeCapturingSupabaseService({ data: updatedRow, error: null });

    TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: service },
        { provide: SiteSettingsService, useValue: createFakeSiteSettingsService() },
        { provide: AuthService, useValue: createFakeAuthService() }
      ]
    });

    const fixture = TestBed.createComponent(InventoryComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    component.inventoryList = [createTestInventoryItem({ id: 'item-1', name: 'Old Name' })];
    expect(component.isFlashing('item-1')).toBeFalse();

    emitChange({ eventType: 'UPDATE', new: updatedRow, old: { id: 'item-1' } });
    tick();

    expect(component.isFlashing('item-1')).toBeTrue();

    tick(1500);
    expect(component.isFlashing('item-1')).toBeFalse();
  }));

  it('does not flash a deleted row — there is nothing left to show it on', fakeAsync(() => {
    const { service, emitChange } = createRealtimeCapturingSupabaseService({ data: null, error: null });

    TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: service },
        { provide: SiteSettingsService, useValue: createFakeSiteSettingsService() },
        { provide: AuthService, useValue: createFakeAuthService() }
      ]
    });

    const fixture = TestBed.createComponent(InventoryComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    component.inventoryList = [createTestInventoryItem({ id: 'item-1' })];

    emitChange({ eventType: 'DELETE', new: {}, old: { id: 'item-1' } });
    tick();

    expect(component.isFlashing('item-1')).toBeFalse();
  }));

  it('removes the item when another user deletes it', fakeAsync(() => {
    const { service, emitChange } = createRealtimeCapturingSupabaseService({ data: null, error: null });

    TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: service },
        { provide: SiteSettingsService, useValue: createFakeSiteSettingsService() },
        { provide: AuthService, useValue: createFakeAuthService() }
      ]
    });

    const fixture = TestBed.createComponent(InventoryComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    component.inventoryList = [createTestInventoryItem({ id: 'item-1' })];

    emitChange({ eventType: 'DELETE', new: {}, old: { id: 'item-1' } });
    tick();

    expect(component.inventoryList).toEqual([]);
  }));

  it('removes the channel on destroy', async () => {
    const { service } = createRealtimeCapturingSupabaseService({ data: [], error: null });
    const removeChannelSpy = spyOn(service.client, 'removeChannel').and.callThrough();

    await TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: service },
        { provide: SiteSettingsService, useValue: createFakeSiteSettingsService() },
        { provide: AuthService, useValue: createFakeAuthService() }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(InventoryComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.destroy();

    expect(removeChannelSpy).toHaveBeenCalled();
  });
});
