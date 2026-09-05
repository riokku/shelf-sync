import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatTooltip } from '@angular/material/tooltip';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';

import { ModalTableComponent } from './modal-table.component';
import { AuthService } from '../../../core/auth.service';
import { SiteSettingsService } from '../../../core/site-settings.service';
import { SupabaseService } from '../../../core/supabase.service';
import { ImpersonationService } from '../../../core/impersonation.service';
import { InventoryItemImageRecord } from '../../utils/inventory-item-images';
import {
  createFakeAuthService,
  createFakeImpersonationService,
  createFakeMatDialogRef,
  createFakeProfile,
  createFakeQueryBuilder,
  createFakeSiteSettingsService,
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
        { provide: ImpersonationService, useValue: createFakeImpersonationService() },
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
          { provide: ImpersonationService, useValue: createFakeImpersonationService() },
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
          { provide: ImpersonationService, useValue: createFakeImpersonationService() },
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

  describe('checkout due date (checkoutDueAt)', () => {
    async function setup(item: Partial<Parameters<typeof createTestInventoryItem>[0]> = {}) {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ModalTableComponent],
        providers: [
          provideNativeDateAdapter(),
          // saveEdit() refuses to write without a real session (see its own
          // early-return) — a signed-out fake, this describe block's actual
          // point, would make every save below silently no-op.
          { provide: AuthService, useValue: createFakeAuthService(createFakeProfile()) },
          { provide: SupabaseService, useValue: createFakeSupabaseService() },
          { provide: ImpersonationService, useValue: createFakeImpersonationService() },
          { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
          { provide: MAT_DIALOG_DATA, useValue: createTestInventoryItem(item) }
        ]
      }).compileComponents();

      const localFixture = TestBed.createComponent(ModalTableComponent);
      localFixture.detectChanges();
      return localFixture.componentInstance;
    }

    it('persists a due date entered alongside checking an item out', async () => {
      const localComponent = await setup({ isCheckedOut: false });
      await localComponent.startEdit();

      localComponent.editForm.controls.checkedOutTo.setValue('user-1');
      localComponent.editForm.controls.checkoutDueAt.setValue(new Date(2026, 0, 10));

      await localComponent.saveEdit();

      expect(localComponent.data.checkedOutDueAt).toBe('2026-01-10');
      expect(localComponent.data.isCheckedOut).toBeTrue();
    });

    it('clears the due date once checked-out-to is cleared, even if the date field was left populated', async () => {
      const localComponent = await setup({
        isCheckedOut: true,
        checkedOutToId: 'user-1',
        checkedOutDueAt: '2026-01-10'
      });
      await localComponent.startEdit();

      // The date field still carries the old due date (startEdit() seeds it
      // from the item) — only "Checked out to" itself is cleared, same as a
      // user unchecking-out an item without separately remembering to blank
      // the date field too.
      localComponent.editForm.controls.checkedOutTo.setValue(null);

      await localComponent.saveEdit();

      expect(localComponent.data.checkedOutDueAt).toBe('');
      expect(localComponent.data.isCheckedOut).toBeFalse();
    });
  });

  /** Replaces the old full-width "Locked by X" banner: the lock toggle
   *  button itself turns red when locked, and the Edit button stays visible
   *  but disabled for anyone who can't override the lock, rather than
   *  disappearing outright — see .lock-toggle-button-locked and the Edit
   *  button's own [disabled] binding in the template. */
  describe('lock UI (Edit button disabled, no banner, red lock icon)', () => {
    async function setup(options: { role?: 'admin' | 'manager' | 'staff'; isLocked?: boolean } = {}) {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ModalTableComponent],
        providers: [
          { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: options.role ?? 'staff' })) },
          { provide: SupabaseService, useValue: createFakeSupabaseService() },
          { provide: ImpersonationService, useValue: createFakeImpersonationService() },
          { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
          {
            provide: MAT_DIALOG_DATA,
            useValue: createTestInventoryItem({
              isLocked: options.isLocked ?? false,
              lockedByLabel: options.isLocked ? 'Jamie Rivera' : ''
            })
          }
        ]
      }).compileComponents();

      const localFixture = TestBed.createComponent(ModalTableComponent);
      localFixture.detectChanges();
      return localFixture;
    }

    function editButton(localFixture: ComponentFixture<ModalTableComponent>): HTMLButtonElement | null {
      const buttons = Array.from(localFixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      return buttons.find(button => button.textContent?.includes('Edit')) ?? null;
    }

    it('renders the Edit button disabled (not hidden) for staff on a locked item', async () => {
      const localFixture = await setup({ role: 'staff', isLocked: true });

      const button = editButton(localFixture);

      expect(button).not.toBeNull();
      expect(button?.disabled).toBeTrue();
    });

    it('leaves the Edit button enabled for a manager even when locked', async () => {
      const localFixture = await setup({ role: 'manager', isLocked: true });

      const button = editButton(localFixture);

      expect(button).not.toBeNull();
      expect(button?.disabled).toBeFalse();
    });

    it('leaves the Edit button enabled for staff when the item is not locked', async () => {
      const localFixture = await setup({ role: 'staff', isLocked: false });

      const button = editButton(localFixture);

      expect(button).not.toBeNull();
      expect(button?.disabled).toBeFalse();
    });

    it('no longer renders a "Locked by" banner', async () => {
      const localFixture = await setup({ role: 'staff', isLocked: true });

      expect(localFixture.nativeElement.textContent).not.toContain('Locked by');
    });

    it('gives the lock toggle button its red-tinted class once locked', async () => {
      const localFixture = await setup({ role: 'manager', isLocked: true });

      expect(localFixture.nativeElement.querySelector('.lock-toggle-button-locked')).not.toBeNull();
    });

    it('does not tint the lock toggle button when unlocked', async () => {
      const localFixture = await setup({ role: 'manager', isLocked: false });

      expect(localFixture.nativeElement.querySelector('.lock-toggle-button-locked')).toBeNull();
    });

    it('shows the lock toggle button to staff too, disabled rather than hidden', async () => {
      const localFixture = await setup({ role: 'staff', isLocked: false });

      const button = localFixture.nativeElement.querySelector('.lock-toggle-button') as HTMLButtonElement | null;

      expect(button).not.toBeNull();
      expect(button?.disabled).toBeTrue();
    });

    it('leaves the lock toggle button enabled for a manager', async () => {
      const localFixture = await setup({ role: 'manager', isLocked: false });

      const button = localFixture.nativeElement.querySelector('.lock-toggle-button') as HTMLButtonElement | null;

      expect(button).not.toBeNull();
      expect(button?.disabled).toBeFalse();
    });

    it('tells staff why the lock toggle is disabled, worded for whether the item is already locked', async () => {
      const lockedFixture = await setup({ role: 'staff', isLocked: true });
      const unlockedFixture = await setup({ role: 'staff', isLocked: false });

      expect(lockedFixture.componentInstance.lockToggleTooltip)
        .toBe('Locked by Jamie Rivera — only admins and managers can lock or unlock it');
      expect(unlockedFixture.componentInstance.lockToggleTooltip)
        .toBe('Only admins and managers can lock an item.');
    });

    // matTooltip on a disabled native <button> never fires a hover (browsers
    // suppress mouseenter/focus on disabled form controls entirely), so the
    // tooltip has to live on an always-interactive wrapper around the
    // button instead — see .tooltip-wrapper's own doc comment. Verifying
    // the directive lives on the wrapper (not the button) is what actually
    // proves staff can hover the disabled lock icon and see why, rather
    // than just re-checking lockToggleTooltip's own string content again.
    it('puts the tooltip on a wrapper around the disabled button, not the button itself', async () => {
      const localFixture = await setup({ role: 'staff', isLocked: true });

      const wrappers = localFixture.debugElement.queryAll(By.css('.tooltip-wrapper'));
      const lockWrapper = wrappers.find(wrapper => wrapper.query(By.css('.lock-toggle-button')));

      expect(lockWrapper).toBeTruthy();
      // The directive's own host is the <span>, not the <button> — confirms
      // the fix landed on the always-interactive wrapper rather than the
      // (disabled, hover-dead) button itself.
      expect(lockWrapper?.nativeElement.tagName).toBe('SPAN');
      expect(lockWrapper?.injector.get(MatTooltip).message)
        .toBe('Locked by Jamie Rivera — only admins and managers can lock or unlock it');
    });
  });

  describe('showDiscardButton / canDiscard', () => {
    async function setup(
      overrides: Parameters<typeof createTestInventoryItem>[0] = {},
      role: 'admin' | 'manager' | 'staff' = 'staff'
    ) {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ModalTableComponent],
        providers: [
          { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role })) },
          { provide: SupabaseService, useValue: createFakeSupabaseService() },
          { provide: ImpersonationService, useValue: createFakeImpersonationService() },
          { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
          { provide: MAT_DIALOG_DATA, useValue: createTestInventoryItem(overrides) }
        ]
      }).compileComponents();

      const localFixture = TestBed.createComponent(ModalTableComponent);
      localFixture.detectChanges();
      return localFixture.componentInstance;
    }

    // showDiscardButton — is Discard even applicable to this item at all,
    // regardless of who's looking or whether it's locked. This is what
    // backs the button's own @if, so it stays hidden (not just disabled)
    // once there's genuinely nothing to discard.
    it('showDiscardButton is true for an active item with stock remaining', async () => {
      expect((await setup({ quantityRemaining: 5 })).showDiscardButton).toBeTrue();
    });

    it('showDiscardButton is false once quantityRemaining is zero — nothing left to discard', async () => {
      expect((await setup({ quantityRemaining: 0 })).showDiscardButton).toBeFalse();
    });

    it('showDiscardButton is false for a retired item', async () => {
      expect((await setup({ quantityRemaining: 5, status: 'retired' })).showDiscardButton).toBeFalse();
    });

    // canDiscard — is the current viewer actually allowed to discard right
    // now (the lock/canManage() check alone). This is what the button's
    // own [disabled] binding checks once showDiscardButton has already
    // decided it should render at all — any authenticated user can
    // discard, same as editing, unless the item is locked and they can't
    // override that lock.
    it('canDiscard is true for staff on an unlocked item', async () => {
      expect((await setup({ isLocked: false }, 'staff')).canDiscard).toBeTrue();
    });

    it('canDiscard is false for staff on a locked item, matching the access rule behind the Edit button\'s own [disabled] binding', async () => {
      expect((await setup({ isLocked: true }, 'staff')).canDiscard).toBeFalse();
    });

    it('canDiscard stays true for a manager even on a locked item', async () => {
      expect((await setup({ isLocked: true }, 'manager')).canDiscard).toBeTrue();
    });

    it('renders the Discard button disabled (not hidden) for staff on a locked item with stock remaining', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ModalTableComponent],
        providers: [
          { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'staff' })) },
          { provide: SupabaseService, useValue: createFakeSupabaseService() },
          { provide: ImpersonationService, useValue: createFakeImpersonationService() },
          { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
          {
            provide: MAT_DIALOG_DATA,
            useValue: createTestInventoryItem({ quantityRemaining: 5, isLocked: true, lockedByLabel: 'Jamie Rivera' })
          }
        ]
      }).compileComponents();

      const localFixture = TestBed.createComponent(ModalTableComponent);
      localFixture.detectChanges();

      const buttons = Array.from(localFixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      const discardButton = buttons.find(button => button.textContent?.includes('Discard'));

      expect(discardButton).not.toBeUndefined();
      expect(discardButton?.disabled).toBeTrue();
    });
  });

  describe('canEditPriceSupplier / price-supplier edit restriction', () => {
    async function setup(options: { restrictPriceSupplierEdits: boolean; role: 'admin' | 'manager' | 'staff' }) {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ModalTableComponent],
        providers: [
          provideNativeDateAdapter(),
          { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: options.role })) },
          { provide: SupabaseService, useValue: createFakeSupabaseService() },
          {
            provide: SiteSettingsService,
            useValue: createFakeSiteSettingsService({ restrictPriceSupplierEdits: options.restrictPriceSupplierEdits })
          },
          { provide: ImpersonationService, useValue: createFakeImpersonationService() },
          { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
          { provide: MAT_DIALOG_DATA, useValue: createTestInventoryItem() }
        ]
      }).compileComponents();

      const localFixture = TestBed.createComponent(ModalTableComponent);
      localFixture.detectChanges();
      return localFixture.componentInstance;
    }

    it('is true when the org has not restricted price/supplier edits, regardless of role', async () => {
      expect((await setup({ restrictPriceSupplierEdits: false, role: 'staff' })).canEditPriceSupplier).toBeTrue();
    });

    it('is true for a manager even when the org has restricted price/supplier edits', async () => {
      expect((await setup({ restrictPriceSupplierEdits: true, role: 'manager' })).canEditPriceSupplier).toBeTrue();
    });

    it('is false for staff when the org has restricted price/supplier edits', async () => {
      expect((await setup({ restrictPriceSupplierEdits: true, role: 'staff' })).canEditPriceSupplier).toBeFalse();
    });

    it('startEdit() disables the supplier/price controls for a restricted staff member', async () => {
      const component = await setup({ restrictPriceSupplierEdits: true, role: 'staff' });

      await component.startEdit();

      expect(component.editForm.get('supplierId')?.disabled).toBeTrue();
      expect(component.editForm.get('pricePerUnit')?.disabled).toBeTrue();
      expect(component.editForm.get('pricePerContainer')?.disabled).toBeTrue();
    });

    it('startEdit() leaves the supplier/price controls enabled for a manager even when restricted', async () => {
      const component = await setup({ restrictPriceSupplierEdits: true, role: 'manager' });

      await component.startEdit();

      expect(component.editForm.get('supplierId')?.disabled).toBeFalse();
      expect(component.editForm.get('pricePerUnit')?.disabled).toBeFalse();
      expect(component.editForm.get('pricePerContainer')?.disabled).toBeFalse();
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
      const discardsBuilder = createFakeQueryBuilder({ data: [], error: null });
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
            if (table === 'inventory_item_discards') {
              return discardsBuilder;
            }
            return defaultBuilder;
          },
          rpc: () => defaultBuilder,
          // Self-returning (not a fresh {} per call) plus the Presence
          // methods ItemEditPresenceService actually calls from
          // startEdit()/cancelEdit() — this component embeds that service
          // now, so its own .on(...).subscribe() chain (and .track()/
          // .untrack(), once a discard test's own startEdit()-adjacent path
          // runs) need to resolve to something real, same shape
          // createFakeRealtimeChannel() in testing/fakes.ts already
          // establishes for the shared fake.
          channel: () => {
            const stub: Record<string, unknown> = {
              on: () => stub,
              subscribe: () => stub,
              track: async () => ({ status: 'ok' }),
              untrack: async () => ({ status: 'ok' }),
              presenceState: () => ({}),
            };
            return stub;
          },
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
          { provide: ImpersonationService, useValue: createFakeImpersonationService() },
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
      return { discardComponent, discardsBuilder };
    }

    function performDiscard(component: ModalTableComponent, result: { quantity: number; reasons: string[]; containerId: string | null }) {
      return (component as unknown as { performDiscard: (r: typeof result) => Promise<void> }).performDiscard(result);
    }

    it('decrements quantityRemaining/quantityTotal directly for a flat (no-container) discard', async () => {
      const { discardComponent } = await setup({ quantityRemaining: 10, quantityTotal: 20 });
      // A successful discard calls the real NotificationService, which
      // opens a real MatSnackBar/CDK Overlay — mocked out here the same way
      // every other successful-write test in this file already does, so
      // this isn't a stray real-overlay call left running loose in a
      // shared, 1000+-test Karma session.
      spyOn(
        (discardComponent as unknown as { notification: { successWithUndo: (msg: string, undo: () => void) => void } }).notification,
        'successWithUndo'
      );

      await performDiscard(discardComponent, { quantity: 3, reasons: ['Water damage'], containerId: null });

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
      const { discardComponent } = await setup({
        quantityAllocated: 2,
        containersTableResult: { data: remainingContainers, error: null }
      });
      spyOn(
        (discardComponent as unknown as { notification: { successWithUndo: (msg: string, undo: () => void) => void } }).notification,
        'successWithUndo'
      );

      await performDiscard(discardComponent, { quantity: 3, reasons: ['Damaged in transit'], containerId: 'box-1' });

      const expectedRemaining = sumContainerQuantity(remainingContainers);
      expect(discardComponent.data.quantityRemaining).toBe(expectedRemaining);
      expect(discardComponent.data.quantityTotal).toBe(expectedRemaining + 2);
      expect(discardComponent.discardError).toBeNull();
    });

    it('requires a signed-in session', async () => {
      const { discardComponent } = await setup({ hasSession: false });

      await performDiscard(discardComponent, { quantity: 3, reasons: ['Water damage'], containerId: null });

      expect(discardComponent.discardError).toBe('You must be signed in to discard stock.');
    });

    it('surfaces an inventory_items update error', async () => {
      const { discardComponent } = await setup({ itemsUpdateError: { message: 'update failed' } });

      await performDiscard(discardComponent, { quantity: 3, reasons: ['Water damage'], containerId: null });

      expect(discardComponent.discardError).toBe('update failed');
      expect(discardComponent.isDiscarding).toBeFalse();
    });

    it('also logs a structured discard row for reporting, alongside the free-text activity line', async () => {
      const { discardComponent, discardsBuilder } = await setup({ quantityRemaining: 10, quantityTotal: 20 });
      const insertSpy = spyOn(discardsBuilder as { insert: (...args: unknown[]) => unknown }, 'insert').and.callThrough();
      spyOn(
        (discardComponent as unknown as { notification: { successWithUndo: (msg: string, undo: () => void) => void } }).notification,
        'successWithUndo'
      );

      await performDiscard(discardComponent, { quantity: 3, reasons: ['Water damage', 'Wear and tear'], containerId: null });

      expect(insertSpy).toHaveBeenCalledWith(jasmine.objectContaining({
        item_id: discardComponent.data.id,
        quantity: 3,
        reason: ['Water damage', 'Wear and tear'],
        container_id: null
      }));
    });

    it('offers an undo instead of a plain success toast', async () => {
      const { discardComponent } = await setup({ quantityRemaining: 10, quantityTotal: 20 });
      const notificationUndoSpy = spyOn(
        (discardComponent as unknown as { notification: { successWithUndo: (msg: string, undo: () => void) => void } }).notification,
        'successWithUndo'
      );

      await performDiscard(discardComponent, { quantity: 3, reasons: ['Water damage'], containerId: null });

      expect(notificationUndoSpy).toHaveBeenCalledWith('Stock discarded', jasmine.any(Function));
    });

    it('undoing a flat-item discard restores the pre-discard quantities', async () => {
      const { discardComponent } = await setup({ quantityRemaining: 10, quantityTotal: 20 });
      let undo: (() => void) | undefined;
      spyOn(
        (discardComponent as unknown as { notification: { successWithUndo: (msg: string, undo: () => void) => void } }).notification,
        'successWithUndo'
      ).and.callFake((_msg, fn) => { undo = fn; });
      const notificationSuccessSpy = spyOn(
        (discardComponent as unknown as { notification: { success: (msg: string) => void } }).notification,
        'success'
      );

      await performDiscard(discardComponent, { quantity: 3, reasons: ['Water damage'], containerId: null });
      expect(discardComponent.data.quantityRemaining).toBe(7);
      expect(discardComponent.data.quantityTotal).toBe(17);

      await undo?.();

      expect(discardComponent.data.quantityRemaining).toBe(10);
      expect(discardComponent.data.quantityTotal).toBe(20);
      expect(discardComponent.discardError).toBeNull();
      expect(notificationSuccessSpy).toHaveBeenCalledWith('Discard undone');
    });
  });

  describe('existing photo drag-and-drop reordering', () => {
    function createImageRow(id: string, position: number) {
      return { id, item_id: 'item-1', storage_path: `path-${id}`, position };
    }

    /** A dedicated fake, not the shared single-result createFakeSupabaseService()
     *  — reordering needs loadInventoryItemImageRecords() to actually return
     *  rows (so there's something to reorder) *and* supabase.storage.from()
     *  .getPublicUrl(), which the default fake has no concept of at all (see
     *  createFakeQueryBuilder's own doc comment inviting exactly this: a spec
     *  that needs a table-aware fake builds its own narrower one on top).
     *  updateCalls records every inventory_item_images .update() so a test
     *  can assert on the position values saveImageChanges() actually wrote. */
    function createImagesFakeSupabaseService(
      imageRows: ReturnType<typeof createImageRow>[],
      updateCalls: { id: string; position: number }[]
    ): SupabaseService {
      const client = {
        from: (table: string) => {
          if (table === 'inventory_item_images') {
            return {
              select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: imageRows, error: null }) }) }),
              update: (values: { position: number }) => ({
                eq: (_column: string, id: string) => {
                  updateCalls.push({ id, position: values.position });
                  return Promise.resolve({ error: null });
                }
              })
            };
          }
          return createFakeQueryBuilder({ data: [], error: null });
        },
        storage: {
          from: () => ({
            getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.com/${path}` } })
          })
        },
        rpc: () => createFakeQueryBuilder({ data: [], error: null }),
        // A full inert channel, not just enough for subscribeToTableChanges()
        // — createFakeAuthService(createFakeProfile()) below (needed so
        // saveEdit()'s own session check passes) also makes
        // ItemEditPresenceService's constructor effect actually subscribe
        // (see that service's own isAuthenticated()/organizationId() check),
        // so startEdit()/ngOnDestroy() genuinely call .track()/.untrack() on
        // whatever this returns — mirrors fakes.ts's own (unexported)
        // createFakeRealtimeChannel() shape.
        channel: () => {
          const inertChannel = {
            on: () => inertChannel,
            subscribe: () => inertChannel,
            track: async () => ({ status: 'ok' }),
            untrack: async () => ({ status: 'ok' }),
            presenceState: () => ({})
          };
          return inertChannel;
        },
        removeChannel: async () => ({ status: 'ok' })
      };
      return { client } as unknown as SupabaseService;
    }

    async function setup(imageRows: ReturnType<typeof createImageRow>[], updateCalls: { id: string; position: number }[] = []) {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ModalTableComponent],
        providers: [
          provideNativeDateAdapter(),
          { provide: AuthService, useValue: createFakeAuthService(createFakeProfile()) },
          { provide: SupabaseService, useValue: createImagesFakeSupabaseService(imageRows, updateCalls) },
          { provide: ImpersonationService, useValue: createFakeImpersonationService() },
          { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
          { provide: MAT_DIALOG_DATA, useValue: createTestInventoryItem({ id: 'item-1' }) }
        ]
      }).compileComponents();

      const localFixture = TestBed.createComponent(ModalTableComponent);
      localFixture.detectChanges();
      return localFixture.componentInstance;
    }

    function dropEvent(previousIndex: number, currentIndex: number): CdkDragDrop<InventoryItemImageRecord[]> {
      return { previousIndex, currentIndex } as CdkDragDrop<InventoryItemImageRecord[]>;
    }

    it('onExistingImageDrop() reorders existingImages in place', async () => {
      const component = await setup([createImageRow('a', 0), createImageRow('b', 1), createImageRow('c', 2)]);
      await component.startEdit();

      component.onExistingImageDrop(dropEvent(0, 2));

      expect(component.existingImages.map(image => image.id)).toEqual(['b', 'c', 'a']);
    });

    it('imagesReordered is false right after startEdit(), true once the order actually changes', async () => {
      const component = await setup([createImageRow('a', 0), createImageRow('b', 1)]);
      await component.startEdit();
      expect(component.imagesReordered).toBeFalse();

      component.onExistingImageDrop(dropEvent(0, 1));

      expect(component.imagesReordered).toBeTrue();
    });

    it('imagesReordered ignores the index shift from marking a photo for removal — that is not a drag', async () => {
      const component = await setup([createImageRow('a', 0), createImageRow('b', 1), createImageRow('c', 2)]);
      await component.startEdit();

      component.toggleRemoveExistingImage(component.existingImages[0]); // removes 'a'

      expect(component.imagesReordered).toBeFalse();
    });

    it('hasUnsavedChanges() reflects a pending reorder', async () => {
      const component = await setup([createImageRow('a', 0), createImageRow('b', 1)]);
      await component.startEdit();
      expect(component.hasUnsavedChanges()).toBeFalse();

      component.onExistingImageDrop(dropEvent(0, 1));

      expect(component.hasUnsavedChanges()).toBeTrue();
    });

    it('saveEdit() writes new position values for whichever photos actually moved', async () => {
      const updateCalls: { id: string; position: number }[] = [];
      const component = await setup(
        [createImageRow('a', 0), createImageRow('b', 1), createImageRow('c', 2)],
        updateCalls
      );
      await component.startEdit();
      component.onExistingImageDrop(dropEvent(0, 2)); // [a,b,c] -> [b,c,a]

      await component.saveEdit();

      expect(updateCalls).toEqual(jasmine.arrayContaining([
        { id: 'b', position: 0 },
        { id: 'c', position: 1 },
        { id: 'a', position: 2 }
      ]));
      expect(updateCalls.length).toBe(3);
    });

    it('saveEdit() writes nothing photo-position-related when the order was never touched', async () => {
      const updateCalls: { id: string; position: number }[] = [];
      const component = await setup(
        [createImageRow('a', 0), createImageRow('b', 1)],
        updateCalls
      );
      await component.startEdit();

      await component.saveEdit();

      expect(updateCalls).toEqual([]);
    });

    it('skips writing a position for a photo whose index did not actually change', async () => {
      // Swapping the last two of three leaves the first photo's own index
      // (and therefore its already-correct position) untouched.
      const updateCalls: { id: string; position: number }[] = [];
      const component = await setup(
        [createImageRow('a', 0), createImageRow('b', 1), createImageRow('c', 2)],
        updateCalls
      );
      await component.startEdit();
      component.onExistingImageDrop(dropEvent(1, 2)); // [a,b,c] -> [a,c,b]

      await component.saveEdit();

      expect(updateCalls.find(call => call.id === 'a')).toBeUndefined();
      expect(updateCalls).toEqual(jasmine.arrayContaining([
        { id: 'c', position: 1 },
        { id: 'b', position: 2 }
      ]));
    });
  });
});
