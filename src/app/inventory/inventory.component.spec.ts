import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { InventoryComponent } from './inventory.component';
import { SupabaseService } from '../core/supabase.service';
import { createFakeSupabaseService, createTestInventoryItem } from '../testing/fakes';

describe('InventoryComponent', () => {
  let component: InventoryComponent;
  let fixture: ComponentFixture<InventoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [
        provideRouter([]),
        // ngOnInit loads inventory on construction — faked so this hits
        // nothing real, same reasoning as every other spec that does this.
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
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
});
