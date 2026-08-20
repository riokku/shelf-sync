import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroupDirective } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { provideNativeDateAdapter } from '@angular/material/core';

import { ManageInventoryComponent } from './manage-inventory.component';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { SiteSettingsService } from '../../core/site-settings.service';
import { NotificationService } from '../../core/notification.service';
import { createFakeAuthService, createFakeProfile, createFakeSiteSettingsService, createFakeSupabaseService, createTestInventoryItemRow } from '../../testing/fakes';

describe('ManageInventoryComponent', () => {
  let component: ManageInventoryComponent;
  let fixture: ComponentFixture<ManageInventoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageInventoryComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        // ngOnInit loads profiles/inventory items on construction (and
        // InventoryFieldOptionsService.load() does too) — faked so this
        // hits nothing real, same reasoning as every other spec.
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageInventoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('visibleInventoryItems', () => {
    beforeEach(() => {
      component.allInventoryItems = [
        createTestInventoryItemRow({ id: 'active-1', status: 'active' }),
        createTestInventoryItemRow({ id: 'pending-1', status: 'retirement_pending' }),
        createTestInventoryItemRow({ id: 'retired-1', status: 'retired' })
      ];
    });

    it('hides fully retired items by default but keeps items pending retirement', () => {
      const ids = component.visibleInventoryItems.map(item => item.id);
      expect(ids).toEqual(['active-1', 'pending-1']);
    });

    it('shows every status when the filter is "include_retired"', () => {
      component.statusFilter = 'include_retired';
      expect(component.visibleInventoryItems.length).toBe(3);
    });

    it('shows only retired items when the filter is "retired_only"', () => {
      component.statusFilter = 'retired_only';
      expect(component.visibleInventoryItems.map(item => item.id)).toEqual(['retired-1']);
    });
  });

  describe('pendingRetirementItems / pendingRetirementCount', () => {
    it('returns only items pending retirement, oldest request first', () => {
      component.allInventoryItems = [
        createTestInventoryItemRow({ id: 'active-1', status: 'active' }),
        createTestInventoryItemRow({ id: 'newer', status: 'retirement_pending', retirement_requested_at: '2026-02-01T00:00:00.000Z' }),
        createTestInventoryItemRow({ id: 'older', status: 'retirement_pending', retirement_requested_at: '2026-01-01T00:00:00.000Z' })
      ];

      expect(component.pendingRetirementItems.map(item => item.id)).toEqual(['older', 'newer']);
      expect(component.pendingRetirementCount).toBe(2);
    });

    it('is empty when nothing is pending', () => {
      component.allInventoryItems = [createTestInventoryItemRow({ status: 'active' })];
      expect(component.pendingRetirementItems).toEqual([]);
      expect(component.pendingRetirementCount).toBe(0);
    });
  });

  describe('isInventoryItemLowStock', () => {
    it('is true when remaining is below the threshold', () => {
      const item = createTestInventoryItemRow({ quantity_remaining: 2, low_quantity_threshold: 5 });
      expect(component.isInventoryItemLowStock(item)).toBe(true);
    });

    it('is false when there is no threshold set', () => {
      const item = createTestInventoryItemRow({ quantity_remaining: 2, low_quantity_threshold: null });
      expect(component.isInventoryItemLowStock(item)).toBe(false);
    });

    it('is false when remaining meets or exceeds the threshold', () => {
      const item = createTestInventoryItemRow({ quantity_remaining: 5, low_quantity_threshold: 5 });
      expect(component.isInventoryItemLowStock(item)).toBe(false);
    });
  });

  describe('isInventoryItemOutOfStock', () => {
    it('is true at zero remaining', () => {
      expect(component.isInventoryItemOutOfStock(createTestInventoryItemRow({ quantity_remaining: 0 }))).toBe(true);
    });

    it('is false when any quantity remains', () => {
      expect(component.isInventoryItemOutOfStock(createTestInventoryItemRow({ quantity_remaining: 1 }))).toBe(false);
    });
  });

  describe('fieldEnabled()', () => {
    it('is true for every field by default (no site_settings row yet)', () => {
      expect(component.fieldEnabled('barcode')).toBe(true);
      expect(component.fieldEnabled('photos')).toBe(true);
      expect(component.fieldEnabled('pricePerContainer')).toBe(true);
    });

    it('reflects an admin-narrowed inventory_form_fields setting', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ManageInventoryComponent],
        providers: [
          provideRouter([]),
          provideNativeDateAdapter(),
          { provide: AuthService, useValue: createFakeAuthService() },
          { provide: SupabaseService, useValue: createFakeSupabaseService() },
          { provide: SiteSettingsService, useValue: createFakeSiteSettingsService({ inventoryFormFields: ['category'] }) }
        ]
      }).compileComponents();

      const narrowedFixture = TestBed.createComponent(ManageInventoryComponent);
      narrowedFixture.detectChanges();
      const narrowedComponent = narrowedFixture.componentInstance;

      expect(narrowedComponent.fieldEnabled('category')).toBe(true);
      expect(narrowedComponent.fieldEnabled('barcode')).toBe(false);
    });
  });

  describe('new-item container breakdown', () => {
    it('defaults to single-quantity tracking with no containers', () => {
      expect(component.trackingMode).toBe('single');
      expect(component.newContainers).toEqual([]);
    });

    it('addNewContainer() defaults quantity to the form\'s quantityPerContainer', () => {
      component.inventoryForm.controls.quantityPerContainer.setValue(20);

      component.addNewContainer();

      expect(component.newContainers).toEqual([{ quantity: 20, location: '' }]);
      expect(component.newContainerQuantitySum).toBe(20);
    });

    it('removeNewContainer() drops the container at that index', () => {
      component.newContainers = [
        { quantity: 20, location: 'Shelf A' },
        { quantity: 15, location: '' }
      ];

      component.removeNewContainer(0);

      expect(component.newContainers).toEqual([{ quantity: 15, location: '' }]);
    });

    it('newContainerQuantitySum sums every container', () => {
      component.newContainers = [{ quantity: 20, location: '' }, { quantity: 15, location: '' }];
      expect(component.newContainerQuantitySum).toBe(35);
    });
  });
});

/** A from()/rpc() fake whose builder resolves to `singleResult` once `.single()`
 *  has been called anywhere in the chain, and to `listResult` otherwise —
 *  needed because submitInventoryItem()'s success path exercises both shapes
 *  against the same 'inventory_items' table (the initial `.select('*').order(...)`
 *  list load in ngOnInit, and the create form's `.insert(...).select().single()`),
 *  which the plain createFakeSupabaseService() (one static result for every call)
 *  can't represent. */
function createInsertAwareFakeSupabaseService(singleResult: { data: unknown; error: null }): SupabaseService {
  const listResult = { data: [], error: null };
  function builder() {
    let wantsSingle = false;
    const b: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => resolve(wantsSingle ? singleResult : listResult),
    };
    for (const method of ['select', 'eq', 'neq', 'not', 'in', 'gte', 'lt', 'order', 'limit', 'insert', 'update', 'delete', 'upsert']) {
      b[method] = () => b;
    }
    b['single'] = () => { wantsSingle = true; return b; };
    b['maybeSingle'] = () => { wantsSingle = true; return b; };
    return b;
  }
  return { client: { from: () => builder(), rpc: () => builder() } } as unknown as SupabaseService;
}

describe('ManageInventoryComponent submitInventoryItem() success', () => {
  // Regression test for the same class of bug covered in
  // manage-tasks.component.spec.ts's submitTask() success test: after a
  // successful "Create item" submit, the freshly-reset form immediately
  // showed "Name is required" because FormGroup.reset() (what
  // submitInventoryItem() used to call directly) doesn't clear the
  // FormGroupDirective's own `submitted` flag, which Material's default
  // ErrorStateMatcher also treats as "show errors" regardless of touched.
  it('clears the FormGroupDirective\'s submitted flag, not just the FormGroup', async () => {
    await TestBed.configureTestingModule({
      imports: [ManageInventoryComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile()) },
        {
          provide: SupabaseService,
          useValue: createInsertAwareFakeSupabaseService({ data: { id: 'item-1', name: 'Folding Chair' }, error: null })
        }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageInventoryComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    // Success is surfaced as a toast rather than inline text under the
    // form (see NotificationService) — spied here to confirm it still
    // fires now that submitInventoryItem() routes the reset through
    // resetForm().
    const notificationSuccessSpy = spyOn((component as unknown as { notification: NotificationService }).notification, 'success');

    component.inventoryForm.controls.name.setValue('Folding Chair');
    component.inventoryForm.controls.quantityTotal.setValue(10);
    fixture.detectChanges();

    await component.submitInventoryItem();

    const directive = (component as unknown as { inventoryFormDirective: FormGroupDirective }).inventoryFormDirective;
    expect(directive.submitted).toBeFalse();
    expect(component.inventoryForm.controls.name.touched).toBeFalse();
    expect(component.inventoryForm.controls.name.value).toBe('');
    expect(component.inventoryForm.controls.name.hasError('required')).toBeTrue();
    expect(notificationSuccessSpy).toHaveBeenCalledWith('Item created');
  });
});
