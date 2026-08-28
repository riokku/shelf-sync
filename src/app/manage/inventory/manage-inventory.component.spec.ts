import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormGroupDirective } from '@angular/forms';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { provideNativeDateAdapter } from '@angular/material/core';

import { ManageInventoryComponent } from './manage-inventory.component';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { SiteSettingsService } from '../../core/site-settings.service';
import { NotificationService } from '../../core/notification.service';
import { createFakeActivatedRoute, createFakeAuthService, createFakeProfile, createFakeSiteSettingsService, createFakeSupabaseService, createTestInventoryItemRow } from '../../testing/fakes';

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

  it('setViewMode() updates viewMode and reflects it in the URL as ?tab=, without adding a history entry', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate');

    component.setViewMode('retirements');

    expect(component.viewMode).toBe('retirements');
    expect(navigateSpy).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { tab: 'retirements' },
      queryParamsHandling: 'merge',
      replaceUrl: true
    }));
  });

  describe('hasUnsavedChanges()', () => {
    it('is false for an untouched create form', () => {
      expect(component.hasUnsavedChanges()).toBeFalse();
    });

    it('is true once the form itself is dirty', () => {
      component.inventoryForm.controls.name.setValue('New name');
      component.inventoryForm.controls.name.markAsDirty();
      expect(component.hasUnsavedChanges()).toBeTrue();
    });

    it('is true with a photo selected, even with the form untouched', () => {
      component.selectedImageFiles = [new File([], 'photo.png')];
      expect(component.hasUnsavedChanges()).toBeTrue();
    });

    it('is true with a container/box added, even with the form untouched', () => {
      component.newContainers = [{ quantity: 10, location: '' }];
      expect(component.hasUnsavedChanges()).toBeTrue();
    });
  });

  describe('setViewMode() confirm-before-leaving-create gate', () => {
    it('switches immediately, without opening a dialog, when the create form has nothing unsaved', () => {
      const dialog = (component as unknown as { dialog: { open: jasmine.Spy } }).dialog;
      const openSpy = spyOn(dialog, 'open');

      component.setViewMode('retirements');

      expect(component.viewMode).toBe('retirements');
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('is a no-op when the target mode already matches the current one', () => {
      const dialog = (component as unknown as { dialog: { open: jasmine.Spy } }).dialog;
      const openSpy = spyOn(dialog, 'open');

      component.setViewMode('create');

      expect(openSpy).not.toHaveBeenCalled();
    });

    it('opens a confirm dialog instead of switching immediately when the create form has unsaved changes', () => {
      component.inventoryForm.controls.name.setValue('New name');
      component.inventoryForm.controls.name.markAsDirty();
      const dialog = (component as unknown as { dialog: { open: (...args: unknown[]) => { afterClosed: () => { subscribe: () => void } } } }).dialog;
      const openSpy = spyOn(dialog, 'open').and.returnValue({ afterClosed: () => ({ subscribe: () => {} }) });

      component.setViewMode('retirements');

      expect(openSpy).toHaveBeenCalledWith(jasmine.any(Function), jasmine.objectContaining({
        data: jasmine.objectContaining({ title: 'Leave without saving?', danger: true })
      }));
      expect(component.viewMode).toBe('create');
    });

    it('switches once the user confirms leaving', () => {
      component.inventoryForm.controls.name.setValue('New name');
      component.inventoryForm.controls.name.markAsDirty();
      const dialog = (component as unknown as { dialog: { open: (...args: unknown[]) => { afterClosed: () => { subscribe: (cb: (v: boolean) => void) => void } } } }).dialog;
      spyOn(dialog, 'open').and.returnValue({ afterClosed: () => ({ subscribe: cb => cb(true) }) });

      component.setViewMode('retirements');

      expect(component.viewMode).toBe('retirements');
    });

    it('stays put when the user cancels', () => {
      component.inventoryForm.controls.name.setValue('New name');
      component.inventoryForm.controls.name.markAsDirty();
      const dialog = (component as unknown as { dialog: { open: (...args: unknown[]) => { afterClosed: () => { subscribe: (cb: (v: boolean) => void) => void } } } }).dialog;
      spyOn(dialog, 'open').and.returnValue({ afterClosed: () => ({ subscribe: cb => cb(false) }) });

      component.setViewMode('retirements');

      expect(component.viewMode).toBe('create');
    });
  });

  describe('confirmBeforeUnload()', () => {
    function fakeBeforeUnloadEvent() {
      return { preventDefault: jasmine.createSpy('preventDefault'), returnValue: '' } as unknown as BeforeUnloadEvent;
    }

    it('does nothing when there are no unsaved changes', () => {
      const event = fakeBeforeUnloadEvent();
      component.confirmBeforeUnload(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('prevents the default and sets returnValue when there are unsaved changes', () => {
      component.inventoryForm.controls.name.setValue('New name');
      component.inventoryForm.controls.name.markAsDirty();
      const event = fakeBeforeUnloadEvent();

      component.confirmBeforeUnload(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.returnValue).toBe('');
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

  describe('retirement request bulk selection', () => {
    beforeEach(() => {
      component.allInventoryItems = [
        createTestInventoryItemRow({ id: 'req-1', status: 'retirement_pending', retirement_requested_at: '2026-01-01T00:00:00.000Z' }),
        createTestInventoryItemRow({ id: 'req-2', status: 'retirement_pending', retirement_requested_at: '2026-01-02T00:00:00.000Z' })
      ];
    });

    it('toggleRetirementSelection() adds/removes a single id', () => {
      component.toggleRetirementSelection('req-1', true);
      expect(component.isRetirementSelected('req-1')).toBeTrue();

      component.toggleRetirementSelection('req-1', false);
      expect(component.isRetirementSelected('req-1')).toBeFalse();
    });

    it('toggleSelectAllRetirements() selects/deselects every pending item', () => {
      component.toggleSelectAllRetirements(true);
      expect(component.selectedRetirementItemIds).toEqual(new Set(['req-1', 'req-2']));

      component.toggleSelectAllRetirements(false);
      expect(component.selectedRetirementItemIds.size).toBe(0);
    });

    it('clearRetirementSelection() empties the selection and any error', () => {
      component.selectedRetirementItemIds = new Set(['req-1']);
      component.retirementError = 'something failed';

      component.clearRetirementSelection();

      expect(component.selectedRetirementItemIds.size).toBe(0);
      expect(component.retirementError).toBeNull();
    });
  });

  describe('applyBulkApproveRetirement()', () => {
    beforeEach(() => {
      component.allInventoryItems = [
        createTestInventoryItemRow({ id: 'req-1', status: 'retirement_pending' }),
        createTestInventoryItemRow({ id: 'req-2', status: 'retirement_pending' })
      ];
      component.selectedRetirementItemIds = new Set(['req-1', 'req-2']);
    });

    it('does nothing when nothing is selected', () => {
      component.selectedRetirementItemIds = new Set();
      const dialog = (component as unknown as { dialog: { open: jasmine.Spy } }).dialog;
      const openSpy = spyOn(dialog, 'open');

      component.applyBulkApproveRetirement();

      expect(openSpy).not.toHaveBeenCalled();
    });

    it('opens a danger-styled confirm dialog naming the selected count', () => {
      const dialog = (component as unknown as { dialog: { open: (...args: unknown[]) => { afterClosed: () => { subscribe: () => void } } } }).dialog;
      const openSpy = spyOn(dialog, 'open').and.returnValue({ afterClosed: () => ({ subscribe: () => {} }) });

      component.applyBulkApproveRetirement();

      expect(openSpy).toHaveBeenCalledWith(jasmine.any(Function), jasmine.objectContaining({
        data: jasmine.objectContaining({ title: 'Approve 2 retirement requests?', danger: true })
      }));
    });

    it('retires the selected items, shows a success toast, and clears the selection once confirmed', async () => {
      const dialog = (component as unknown as { dialog: { open: (...args: unknown[]) => { afterClosed: () => { subscribe: (cb: (v: boolean) => void) => void } } } }).dialog;
      spyOn(dialog, 'open').and.returnValue({ afterClosed: () => ({ subscribe: cb => cb(true) }) });
      const notificationSuccessSpy = spyOn((component as unknown as { notification: NotificationService }).notification, 'success');

      component.applyBulkApproveRetirement();
      await fixture.whenStable();

      expect(notificationSuccessSpy).toHaveBeenCalledWith('Retired 2 items');
      expect(component.selectedRetirementItemIds.size).toBe(0);
    });

    it('does nothing once confirmed with the dialog cancelled', async () => {
      const dialog = (component as unknown as { dialog: { open: (...args: unknown[]) => { afterClosed: () => { subscribe: (cb: (v: boolean) => void) => void } } } }).dialog;
      spyOn(dialog, 'open').and.returnValue({ afterClosed: () => ({ subscribe: cb => cb(false) }) });
      const notificationSuccessSpy = spyOn((component as unknown as { notification: NotificationService }).notification, 'success');

      component.applyBulkApproveRetirement();
      await fixture.whenStable();

      expect(notificationSuccessSpy).not.toHaveBeenCalled();
      expect(component.selectedRetirementItemIds.size).toBe(2);
    });
  });

  describe('applyBulkDeclineRetirement()', () => {
    it('does nothing when nothing is selected', async () => {
      component.allInventoryItems = [createTestInventoryItemRow({ id: 'req-1', status: 'retirement_pending' })];
      component.selectedRetirementItemIds = new Set();
      const notificationSuccessSpy = spyOn((component as unknown as { notification: NotificationService }).notification, 'success');

      await component.applyBulkDeclineRetirement();

      expect(notificationSuccessSpy).not.toHaveBeenCalled();
    });

    it('declines the selected requests without a confirm dialog, shows a success toast, and clears the selection', async () => {
      component.allInventoryItems = [
        createTestInventoryItemRow({ id: 'req-1', status: 'retirement_pending' }),
        createTestInventoryItemRow({ id: 'req-2', status: 'retirement_pending' })
      ];
      component.selectedRetirementItemIds = new Set(['req-1', 'req-2']);
      const dialog = (component as unknown as { dialog: { open: jasmine.Spy } }).dialog;
      const openSpy = spyOn(dialog, 'open');
      const notificationSuccessSpy = spyOn((component as unknown as { notification: NotificationService }).notification, 'success');

      await component.applyBulkDeclineRetirement();

      expect(openSpy).not.toHaveBeenCalled();
      expect(notificationSuccessSpy).toHaveBeenCalledWith('Declined 2 retirement requests');
      expect(component.selectedRetirementItemIds.size).toBe(0);
    });
  });

  describe('fieldEnabled()', () => {
    it('is true for every field by default (no site_settings row yet)', () => {
      // Not 'barcode' — DEFAULT_INVENTORY_FORM_FIELDS itself excludes it
      // while BARCODE_FEATURE_ENABLED is false (see that flag's own doc
      // comment), so this "every field" default no longer includes it.
      expect(component.fieldEnabled('description')).toBe(true);
      expect(component.fieldEnabled('photos')).toBe(true);
      expect(component.fieldEnabled('pricePerContainer')).toBe(true);
    });

    // The create form's barcode field/scan button never renders while
    // BARCODE_FEATURE_ENABLED is false, regardless of fieldEnabled('barcode')
    // — see that flag's own doc comment for why this needs its own gate
    // rather than trusting the org's stored inventory_form_fields setting.
    it('never shows the barcode field on the create form, even though fieldEnabled(\'category\') is still true', () => {
      expect(component.barcodeFeatureEnabled).toBeFalse();
      expect(fixture.nativeElement.textContent).not.toContain('barcode_reader');
      expect(fixture.nativeElement.textContent).not.toContain('Scan or type');
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
  // Inert channel stub — ngOnInit() now also opens a realtime subscription
  // (see shared/utils/realtime.ts), which this hand-rolled fake needs to
  // support too, same reasoning createFakeSupabaseService's own stub has.
  const channel: Record<string, unknown> = { on: () => channel, subscribe: () => channel };
  return {
    client: { from: () => builder(), rpc: () => builder(), channel: () => channel, removeChannel: async () => ({ status: 'ok' }) }
  } as unknown as SupabaseService;
}

/** Covers reading the active tab back out of ?tab= on load — mirrors
 *  SettingsComponent's own ?tab= spec coverage. */
describe('ManageInventoryComponent ?tab= handling', () => {
  async function createWithTab(tab: string | undefined): Promise<ManageInventoryComponent> {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [ManageInventoryComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService() },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute(tab ? { tab } : {}) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageInventoryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('opens directly to the tab named in ?tab= when it names a real tab', async () => {
    expect((await createWithTab('retirements')).viewMode).toBe('retirements');
  });

  it('falls back to the default tab when ?tab= is missing or not a real tab', async () => {
    expect((await createWithTab(undefined)).viewMode).toBe('create');
    expect((await createWithTab('bogus')).viewMode).toBe('create');
  });
});

describe('ManageInventoryComponent load errors', () => {
  async function createComponent(supabaseService: SupabaseService): Promise<ManageInventoryComponent> {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [ManageInventoryComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: supabaseService }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageInventoryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('sets loadError instead of silently rendering an empty list when the query fails', async () => {
    const failingSupabase = createFakeSupabaseService({ data: null, error: { message: 'Network error' } });
    const component = await createComponent(failingSupabase);

    expect(component.loadError).toBe('Network error');
    expect(component.isLoadingInventoryList).toBeFalse();
    expect(component.allInventoryItems).toEqual([]);
  });

  it('retryLoad() clears loadError on a successful retry', async () => {
    const failingSupabase = createFakeSupabaseService({ data: null, error: { message: 'Network error' } });
    const component = await createComponent(failingSupabase);
    expect(component.loadError).toBe('Network error');

    (component as unknown as { supabase: SupabaseService['client'] }).supabase =
      createFakeSupabaseService({ data: [], error: null }).client;

    component.retryLoad();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.loadError).toBeNull();
  });
});

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

/** Captures the postgres_changes callback ngOnInit()'s realtime
 *  subscription registers, exposing it as emitChange() — mirrors the
 *  capture-the-callback pattern already established in
 *  auth.service.spec.ts's emitAuthStateChange(). Same wantsSingle flag
 *  trick as createInsertAwareFakeSupabaseService above: refreshInventoryItem()
 *  chains a `.maybeSingle()` row lookup *and* two plain list queries
 *  (images/activity) against the same fake, which need different result
 *  shapes — `singleResult` only once `.single()`/`.maybeSingle()` has been
 *  called in the chain, an empty list otherwise. */
function createRealtimeCapturingSupabaseService(singleResult: { data: unknown; error: null }) {
  // Keyed by table name, not a single captured callback — ManageInventoryComponent
  // now opens two separate subscriptions (inventory_items and, since the
  // widen-realtime-coverage pass, inventory_item_images) against the same
  // fake channel object. emitChange() defaults to 'inventory_items' so every
  // existing call site (all written before the second subscription existed)
  // keeps targeting the same one without changes.
  const capturedCallbacks = new Map<string, (payload: unknown) => void>();
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
    on: (_type: string, filter: { table: string }, callback: (payload: unknown) => void) => {
      capturedCallbacks.set(filter.table, callback);
      return channel;
    },
    subscribe: () => channel,
  };
  const service = {
    client: { from: () => builder(), rpc: () => builder(), channel: () => channel, removeChannel: async () => ({ status: 'ok' }) }
  } as unknown as SupabaseService;
  return { service, emitChange: (payload: unknown, table = 'inventory_items') => capturedCallbacks.get(table)?.(payload) };
}

describe('ManageInventoryComponent realtime updates', () => {
  it('patches allInventoryItems when another user updates a row', async () => {
    const updatedRow = createTestInventoryItemRow({ id: 'item-1', name: 'Updated Name' });
    const { service, emitChange } = createRealtimeCapturingSupabaseService({ data: updatedRow, error: null });

    await TestBed.configureTestingModule({
      imports: [ManageInventoryComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: service }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageInventoryComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    component.allInventoryItems = [createTestInventoryItemRow({ id: 'item-1', name: 'Old Name' })];

    emitChange({ eventType: 'UPDATE', new: updatedRow, old: { id: 'item-1' } });
    await fixture.whenStable();

    expect(component.allInventoryItems[0].name).toBe('Updated Name');
  });

  // fakeAsync()/tick() rather than await fixture.whenStable() — needs to
  // deterministically advance past FLASH_DURATION_MS (1500ms), which a real
  // timer/whenStable() can't do.
  it('flashes the updated row, then clears the flash after it fades', fakeAsync(() => {
    const updatedRow = createTestInventoryItemRow({ id: 'item-1', name: 'Updated Name' });
    const { service, emitChange } = createRealtimeCapturingSupabaseService({ data: updatedRow, error: null });

    TestBed.configureTestingModule({
      imports: [ManageInventoryComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: service }
      ]
    });

    const fixture = TestBed.createComponent(ManageInventoryComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    component.allInventoryItems = [createTestInventoryItemRow({ id: 'item-1', name: 'Old Name' })];
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
      imports: [ManageInventoryComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: service }
      ]
    });

    const fixture = TestBed.createComponent(ManageInventoryComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    component.allInventoryItems = [createTestInventoryItemRow({ id: 'item-1' })];

    emitChange({ eventType: 'DELETE', new: {}, old: { id: 'item-1' } });
    tick();

    expect(component.isFlashing('item-1')).toBeFalse();
  }));

  it('removes the item when another user deletes it', async () => {
    const { service, emitChange } = createRealtimeCapturingSupabaseService({ data: null, error: null });

    await TestBed.configureTestingModule({
      imports: [ManageInventoryComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: service }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageInventoryComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    component.allInventoryItems = [createTestInventoryItemRow({ id: 'item-1' })];

    emitChange({ eventType: 'DELETE', new: {}, old: { id: 'item-1' } });
    await fixture.whenStable();

    expect(component.allInventoryItems).toEqual([]);
  });

  it('flashes the row when a photo is added/removed elsewhere — a pure image-table change never touches the parent row', fakeAsync(() => {
    const currentRow = createTestInventoryItemRow({ id: 'item-1', name: 'Same Name' });
    const { service, emitChange } = createRealtimeCapturingSupabaseService({ data: currentRow, error: null });

    TestBed.configureTestingModule({
      imports: [ManageInventoryComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: service }
      ]
    });

    const fixture = TestBed.createComponent(ManageInventoryComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    component.allInventoryItems = [createTestInventoryItemRow({ id: 'item-1', name: 'Same Name' })];
    expect(component.isFlashing('item-1')).toBeFalse();

    // inventory_item_images rows key off item_id, not id — a plain postgres
    // row with no `id` field on top.
    emitChange({ eventType: 'INSERT', new: { item_id: 'item-1' }, old: {} }, 'inventory_item_images');
    tick();

    expect(component.isFlashing('item-1')).toBeTrue();
  }));

  it('removes both channels on destroy', async () => {
    const { service } = createRealtimeCapturingSupabaseService({ data: [], error: null });
    const removeChannelSpy = spyOn(service.client, 'removeChannel').and.callThrough();

    await TestBed.configureTestingModule({
      imports: [ManageInventoryComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: service }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageInventoryComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.destroy();

    expect(removeChannelSpy).toHaveBeenCalledTimes(2);
  });
});
