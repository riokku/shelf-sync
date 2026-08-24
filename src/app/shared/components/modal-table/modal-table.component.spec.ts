import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';

import { ModalTableComponent } from './modal-table.component';
import { AuthService } from '../../../core/auth.service';
import { SupabaseService } from '../../../core/supabase.service';
import {
  createFakeAuthService,
  createFakeMatDialogRef,
  createFakeProfile,
  createFakeSupabaseService,
  createTestInventoryItem
} from '../../../testing/fakes';

describe('ModalTableComponent', () => {
  let component: ModalTableComponent;
  let fixture: ComponentFixture<ModalTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalTableComponent],
      providers: [
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService() },
        { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
        { provide: MAT_DIALOG_DATA, useValue: createTestInventoryItem() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModalTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Barcode/QR isn't fully set up to function yet — see
  // BARCODE_FEATURE_ENABLED's own doc comment — so the QR label button, the
  // barcode display row, and (once editing) the barcode field/scan button
  // all stay hidden regardless of whether the item actually has a barcode.
  describe('barcode UI (BARCODE_FEATURE_ENABLED is currently false)', () => {
    it('hides the QR label button and the barcode display row even when the item has a barcode', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ModalTableComponent],
        providers: [
          provideNativeDateAdapter(),
          { provide: AuthService, useValue: createFakeAuthService() },
          { provide: SupabaseService, useValue: createFakeSupabaseService() },
          { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
          { provide: MAT_DIALOG_DATA, useValue: createTestInventoryItem({ barcode: 'UPC-12345' }) }
        ]
      }).compileComponents();

      const barcodeFixture = TestBed.createComponent(ModalTableComponent);
      barcodeFixture.detectChanges();

      expect(barcodeFixture.componentInstance.barcodeFeatureEnabled).toBeFalse();
      expect(barcodeFixture.nativeElement.textContent).not.toContain('barcode_reader');
      expect(barcodeFixture.nativeElement.textContent).not.toContain('qr_code_2');
      expect(barcodeFixture.nativeElement.textContent).not.toContain('UPC-12345');
    });

    it('hides the barcode field and scan button in edit mode', async () => {
      await component.startEdit();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('qr_code_scanner');
      expect(fixture.nativeElement.querySelector('.barcode-edit-row')).toBeNull();
    });
  });

  it('loads no containers for an item that has none yet', () => {
    expect(component.existingContainers).toEqual([]);
    expect(component.quantityDerivedFromContainers).toBeFalse();
  });

  it('addContainer() defaults quantity to the item\'s quantityPerContainer', async () => {
    component.editForm.controls.quantityPerContainer.setValue(20);

    component.addContainer();

    expect(component.editableContainers).toEqual([{ id: null, quantity: 20, location: '' }]);
    expect(component.containerQuantitySum).toBe(20);
  });

  it('removeContainer() tracks an existing container for deletion but drops a new, unsaved one silently', () => {
    component.editableContainers = [
      { id: 'box-1', quantity: 10, location: '' },
      { id: null, quantity: 5, location: '' }
    ];

    component.removeContainer(1);
    component.removeContainer(0);

    expect(component.editableContainers).toEqual([]);
    expect(component.removedContainerIds).toEqual(new Set(['box-1']));
  });

  it('quantityDerivedFromContainers reflects editableContainers while editing', () => {
    expect(component.quantityDerivedFromContainers).toBeFalse();

    component.editableContainers = [{ id: 'box-1', quantity: 10, location: '' }];
    component.isEditing = true;

    expect(component.quantityDerivedFromContainers).toBeTrue();
  });

  describe('toggleLock()', () => {
    async function setup(options: {
      role?: 'admin' | 'manager' | 'staff';
      isLocked?: boolean;
      rpcError?: { message: string } | null;
    } = {}) {
      const profile = createFakeProfile({ role: options.role ?? 'manager', full_name: 'Jamie Rivera', nickname: null });
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ModalTableComponent],
        providers: [
          { provide: AuthService, useValue: createFakeAuthService(profile) },
          { provide: SupabaseService, useValue: createFakeSupabaseService({ error: options.rpcError ?? null }) },
          { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
          { provide: MAT_DIALOG_DATA, useValue: createTestInventoryItem({ isLocked: options.isLocked ?? false }) }
        ]
      }).compileComponents();

      const localFixture = TestBed.createComponent(ModalTableComponent);
      localFixture.detectChanges();
      return localFixture.componentInstance;
    }

    it('is a no-op for staff — only admin/manager can lock or unlock', async () => {
      const staffComponent = await setup({ role: 'staff' });

      await staffComponent.toggleLock();

      expect(staffComponent.data.isLocked).toBeFalse();
    });

    it('locks the item and records who, for a manager', async () => {
      const managerComponent = await setup({ role: 'manager', isLocked: false });

      await managerComponent.toggleLock();

      expect(managerComponent.data.isLocked).toBeTrue();
      expect(managerComponent.data.lockedByLabel).toBe('Jamie Rivera');
      expect(managerComponent.lockError).toBeNull();
      expect(managerComponent.isProcessingLock).toBeFalse();
    });

    it('unlocks an already-locked item, clearing the lockedByLabel', async () => {
      const adminComponent = await setup({ role: 'admin', isLocked: true });

      await adminComponent.toggleLock();

      expect(adminComponent.data.isLocked).toBeFalse();
      expect(adminComponent.data.lockedByLabel).toBe('');
    });

    it('surfaces the RPC error and leaves the lock state unchanged on failure', async () => {
      const managerComponent = await setup({ role: 'manager', isLocked: false, rpcError: { message: 'nope' } });

      await managerComponent.toggleLock();

      expect(managerComponent.lockError).toBe('nope');
      expect(managerComponent.data.isLocked).toBeFalse();
      expect(managerComponent.isProcessingLock).toBeFalse();
    });
  });

  describe('canPlaceOrder', () => {
    // 'supplierId' in options (not options.supplierId ?? ...) — a plain ??
    // can't tell "not passed" apart from "explicitly passed null", and the
    // no-supplier case here needs exactly that explicit null to come through.
    async function setup(options: { role?: 'admin' | 'manager' | 'staff'; supplierId?: string | null } = {}) {
      const profile = createFakeProfile({ role: options.role ?? 'manager' });
      const supplierId = 'supplierId' in options ? options.supplierId! : 'supplier-1';
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ModalTableComponent],
        providers: [
          { provide: AuthService, useValue: createFakeAuthService(profile) },
          { provide: SupabaseService, useValue: createFakeSupabaseService() },
          { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
          {
            provide: MAT_DIALOG_DATA,
            useValue: createTestInventoryItem({ supplierId, supplierName: 'Gatherwell Co.' })
          }
        ]
      }).compileComponents();

      const localFixture = TestBed.createComponent(ModalTableComponent);
      localFixture.detectChanges();
      return localFixture.componentInstance;
    }

    it('is true for a manager when the item has a linked supplier', async () => {
      expect((await setup({ role: 'manager' })).canPlaceOrder).toBeTrue();
    });

    it('is false for staff regardless of a linked supplier', async () => {
      expect((await setup({ role: 'staff' })).canPlaceOrder).toBeFalse();
    });

    it('is false for a manager when the item has no linked supplier', async () => {
      expect((await setup({ role: 'manager', supplierId: null })).canPlaceOrder).toBeFalse();
    });
  });

  describe('order actions', () => {
    async function setup(options: {
      role?: 'admin' | 'manager' | 'staff';
      hasSession?: boolean;
      error?: { message: string } | null;
    } = {}) {
      const profile = createFakeProfile({ role: options.role ?? 'manager' });
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ModalTableComponent],
        providers: [
          {
            provide: AuthService,
            useValue: createFakeAuthService(profile, { hasSession: options.hasSession ?? true })
          },
          { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], error: options.error ?? null }) },
          { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
          {
            provide: MAT_DIALOG_DATA,
            useValue: createTestInventoryItem({
              supplierId: 'supplier-1',
              supplierName: 'Gatherwell Co.',
              quantityRemaining: 5
            })
          }
        ]
      }).compileComponents();

      const localFixture = TestBed.createComponent(ModalTableComponent);
      localFixture.detectChanges();
      // ngOnInit()'s own async loads (containers, orders) must fully settle
      // before a test starts poking at existingContainers/existingOrders
      // directly — otherwise a still-pending ngOnInit() assignment can land
      // *after* the test's own setup and silently clobber it.
      await localFixture.whenStable();
      return localFixture.componentInstance;
    }

    function submitOrder(component: ModalTableComponent, result: { quantity: number; note: string }) {
      return (component as unknown as { submitOrder: (r: { quantity: number; note: string }) => Promise<void> }).submitOrder(result);
    }

    describe('submitOrder()', () => {
      it('places the order and clears any prior error on success', async () => {
        const orderComponent = await setup();

        await submitOrder(orderComponent, { quantity: 20, note: 'Rush order' });

        expect(orderComponent.orderError).toBeNull();
        expect(orderComponent.isProcessingOrder).toBeFalse();
      });

      it('requires a signed-in session', async () => {
        const orderComponent = await setup({ hasSession: false });

        await submitOrder(orderComponent, { quantity: 20, note: '' });

        expect(orderComponent.orderError).toBe('You must be signed in to place an order.');
      });

      it('surfaces an insert error rather than throwing', async () => {
        const orderComponent = await setup({ error: { message: 'insert failed' } });

        await submitOrder(orderComponent, { quantity: 20, note: '' });

        expect(orderComponent.orderError).toBe('insert failed');
        expect(orderComponent.isProcessingOrder).toBeFalse();
      });
    });

    describe('markReceived()', () => {
      const order = {
        id: 'order-1',
        supplierName: 'Gatherwell Co.',
        quantity: 20,
        status: 'ordered' as const,
        note: '',
        orderedByLabel: 'Jamie Lee',
        orderedAt: '2026-01-15T00:00:00.000Z',
        receivedByLabel: '',
        receivedAt: ''
      };

      it('bumps quantityRemaining/quantityTotal by the ordered amount for a flat-tracked item (no containers)', async () => {
        const orderComponent = await setup();
        orderComponent.existingContainers = [];
        const before = { remaining: orderComponent.data.quantityRemaining, total: orderComponent.data.quantityTotal };

        await orderComponent.markReceived(order);

        expect(orderComponent.data.quantityRemaining).toBe(before.remaining + 20);
        expect(orderComponent.data.quantityTotal).toBe(before.total + 20);
        expect(orderComponent.orderError).toBeNull();
      });

      it('does not touch quantity fields for a container-tracked item — the RPC itself skips the restock there', async () => {
        const orderComponent = await setup();
        orderComponent.existingContainers = [{ id: 'box-1', quantity: 5, location: '' }];
        const before = { remaining: orderComponent.data.quantityRemaining, total: orderComponent.data.quantityTotal };

        await orderComponent.markReceived(order);

        expect(orderComponent.data.quantityRemaining).toBe(before.remaining);
        expect(orderComponent.data.quantityTotal).toBe(before.total);
      });

      it('surfaces the RPC error and leaves quantities unchanged on failure', async () => {
        const orderComponent = await setup({ error: { message: 'already received' } });
        orderComponent.existingContainers = [];
        const before = orderComponent.data.quantityRemaining;

        await orderComponent.markReceived(order);

        expect(orderComponent.orderError).toBe('already received');
        expect(orderComponent.data.quantityRemaining).toBe(before);
      });
    });

    describe('cancelOrder()', () => {
      const order = {
        id: 'order-1',
        supplierName: 'Gatherwell Co.',
        quantity: 20,
        status: 'ordered' as const,
        note: '',
        orderedByLabel: 'Jamie Lee',
        orderedAt: '2026-01-15T00:00:00.000Z',
        receivedByLabel: '',
        receivedAt: ''
      };

      it('clears any prior error on success', async () => {
        const orderComponent = await setup();

        await orderComponent.cancelOrder(order);

        expect(orderComponent.orderError).toBeNull();
        expect(orderComponent.isProcessingOrder).toBeFalse();
      });

      it('surfaces the RPC error', async () => {
        const orderComponent = await setup({ error: { message: 'not awaiting receipt' } });

        await orderComponent.cancelOrder(order);

        expect(orderComponent.orderError).toBe('not awaiting receipt');
      });
    });
  });
});
