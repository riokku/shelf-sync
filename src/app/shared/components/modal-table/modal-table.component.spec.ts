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
  createFakeQueryBuilder,
  createFakeSupabaseService,
  createTestInventoryItem
} from '../../../testing/fakes';
import { sumContainerQuantity } from '../../utils/inventory-item-containers';

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

  describe('canDiscard', () => {
    async function setup(overrides: Parameters<typeof createTestInventoryItem>[0] = {}) {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ModalTableComponent],
        providers: [
          { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'staff' })) },
          { provide: SupabaseService, useValue: createFakeSupabaseService() },
          { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
          { provide: MAT_DIALOG_DATA, useValue: createTestInventoryItem(overrides) }
        ]
      }).compileComponents();

      const localFixture = TestBed.createComponent(ModalTableComponent);
      localFixture.detectChanges();
      return localFixture.componentInstance;
    }

    it('is true for an active, unlocked item with stock remaining', async () => {
      expect((await setup({ quantityRemaining: 5 })).canDiscard).toBeTrue();
    });

    it('is false once quantityRemaining is zero — nothing left to discard', async () => {
      expect((await setup({ quantityRemaining: 0 })).canDiscard).toBeFalse();
    });

    it('is false for a retired item', async () => {
      expect((await setup({ quantityRemaining: 5, status: 'retired' })).canDiscard).toBeFalse();
    });

    it('is false for staff on a locked item, matching the Edit button\'s own gate', async () => {
      expect((await setup({ quantityRemaining: 5, isLocked: true })).canDiscard).toBeFalse();
    });
  });

  describe('performDiscard() (openDiscard()\'s dialog result handler)', () => {
    async function setup(options: {
      quantityRemaining?: number;
      quantityTotal?: number;
      quantityAllocated?: number;
      hasSession?: boolean;
      containersTableResult?: { data?: unknown; error?: unknown };
      itemsUpdateError?: { message: string } | null;
    } = {}) {
      const profile = createFakeProfile({ role: 'manager' });
      TestBed.resetTestingModule();

      const containerBuilder = createFakeQueryBuilder(options.containersTableResult ?? { data: [], error: null });
      const itemsBuilder = createFakeQueryBuilder({ data: [], error: options.itemsUpdateError ?? null });
      const defaultBuilder = createFakeQueryBuilder({ data: [], error: null });
      const fakeSupabase = {
        client: {
          from: (table: string) => {
            if (table === 'inventory_item_containers') {
              return containerBuilder;
            }
            if (table === 'inventory_items') {
              return itemsBuilder;
            }
            return defaultBuilder;
          },
          rpc: () => defaultBuilder,
          channel: () => ({ on: () => ({}), subscribe: () => ({}) }),
          removeChannel: async () => ({ status: 'ok' }),
        },
      } as unknown as SupabaseService;

      await TestBed.configureTestingModule({
        imports: [ModalTableComponent],
        providers: [
          {
            provide: AuthService,
            useValue: createFakeAuthService(profile, { hasSession: options.hasSession ?? true })
          },
          { provide: SupabaseService, useValue: fakeSupabase },
          { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
          {
            provide: MAT_DIALOG_DATA,
            useValue: createTestInventoryItem({
              quantityRemaining: options.quantityRemaining ?? 10
            })
          }
        ]
      }).compileComponents();

      const localFixture = TestBed.createComponent(ModalTableComponent);
      localFixture.detectChanges();
      await localFixture.whenStable();
      const discardComponent = localFixture.componentInstance;
      if (options.quantityTotal !== undefined) {
        discardComponent.data.quantityTotal = options.quantityTotal;
      }
      if (options.quantityAllocated !== undefined) {
        discardComponent.data.quantityAllocated = options.quantityAllocated;
      }
      return discardComponent;
    }

    function performDiscard(component: ModalTableComponent, result: { quantity: number; reason: string; containerId: string | null }) {
      return (component as unknown as { performDiscard: (r: typeof result) => Promise<void> }).performDiscard(result);
    }

    it('decrements quantityRemaining/quantityTotal directly for a flat (no-container) discard', async () => {
      const discardComponent = await setup({ quantityRemaining: 10, quantityTotal: 20 });

      await performDiscard(discardComponent, { quantity: 3, reason: 'Water damage', containerId: null });

      expect(discardComponent.data.quantityRemaining).toBe(7);
      expect(discardComponent.data.quantityTotal).toBe(17);
      expect(discardComponent.discardError).toBeNull();
      expect(discardComponent.isDiscarding).toBeFalse();
    });

    it('re-derives quantityRemaining/quantityTotal from the container sum for a container discard', async () => {
      const remainingContainers = [
        { id: 'box-1', quantity: 7, location: null },
        { id: 'box-2', quantity: 5, location: null }
      ];
      const discardComponent = await setup({
        quantityAllocated: 2,
        containersTableResult: { data: remainingContainers, error: null }
      });

      await performDiscard(discardComponent, { quantity: 3, reason: 'Damaged in transit', containerId: 'box-1' });

      const expectedRemaining = sumContainerQuantity(remainingContainers);
      expect(discardComponent.data.quantityRemaining).toBe(expectedRemaining);
      expect(discardComponent.data.quantityTotal).toBe(expectedRemaining + 2);
      expect(discardComponent.discardError).toBeNull();
    });

    it('requires a signed-in session', async () => {
      const discardComponent = await setup({ hasSession: false });

      await performDiscard(discardComponent, { quantity: 3, reason: 'Water damage', containerId: null });

      expect(discardComponent.discardError).toBe('You must be signed in to discard stock.');
    });

    it('surfaces an inventory_items update error', async () => {
      const discardComponent = await setup({ itemsUpdateError: { message: 'update failed' } });

      await performDiscard(discardComponent, { quantity: 3, reason: 'Water damage', containerId: null });

      expect(discardComponent.discardError).toBe('update failed');
      expect(discardComponent.isDiscarding).toBeFalse();
    });
  });
});
