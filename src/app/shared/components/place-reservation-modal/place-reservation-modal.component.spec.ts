import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';

import { PlaceReservationModalComponent, PlaceReservationModalData, ReservableItem } from './place-reservation-modal.component';
import { SupabaseService } from '../../../core/supabase.service';
import { createFakeMatDialogRef, createFakeSupabaseService } from '../../../testing/fakes';
import { InventoryItemReservationWithItem } from '../../utils/inventory-item-reservations';

const ITEMS: ReservableItem[] = [
  { id: 'item-1', name: 'Chiavari Chairs', quantityRemaining: 100, isLocked: false, isPendingRetirement: false },
  { id: 'item-2', name: 'Table Runners', quantityRemaining: 40, isLocked: false, isPendingRetirement: false }
];

function createTestReservation(overrides: Partial<InventoryItemReservationWithItem> = {}): InventoryItemReservationWithItem {
  return {
    id: 'reservation-1',
    itemId: 'item-1',
    itemName: 'Chiavari Chairs',
    startDate: '2026-06-01',
    endDate: '2026-06-03',
    quantity: 30,
    reservedFor: 'Smith wedding',
    note: '',
    status: 'reserved',
    reservedByLabel: 'Jamie Lee',
    reservedAt: '2026-01-15T00:00:00.000Z',
    pickedUpByLabel: '',
    pickedUpAt: '',
    returnedByLabel: '',
    returnedAt: '',
    cancelledByLabel: '',
    cancelledAt: '',
    groupId: null,
    ...overrides,
  };
}

describe('PlaceReservationModalComponent', () => {
  let component: PlaceReservationModalComponent;
  let fixture: ComponentFixture<PlaceReservationModalComponent>;
  let dialogRef: MatDialogRef<PlaceReservationModalComponent>;

  async function setup(options: { error?: { message: string } | null; data?: Partial<PlaceReservationModalData> } = {}) {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<PlaceReservationModalComponent>;

    await TestBed.configureTestingModule({
      imports: [PlaceReservationModalComponent],
      providers: [
        provideNativeDateAdapter(),
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: null, error: options.error ?? null }) },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { items: ITEMS, reservations: [], ...options.data } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PlaceReservationModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  describe('filteredItems', () => {
    it('returns every item when the search is empty', async () => {
      await setup();
      expect(component.filteredItems).toEqual(ITEMS);
    });

    it('filters by name, case-insensitively', async () => {
      await setup();
      component.itemSearchControl.setValue('table');
      expect(component.filteredItems).toEqual([ITEMS[1]]);
    });

    it('also matches by id, so pasting an item\'s GUID finds it too', async () => {
      await setup();
      component.itemSearchControl.setValue('item-2');
      expect(component.filteredItems).toEqual([ITEMS[1]]);
    });

    // Filtering out an unpickable item entirely would leave someone unable
    // to tell "not in this org" apart from "locked" — the template's own
    // [disabled] binding (plus the lock icon next to it) is what actually
    // blocks the pick, so this list still needs to include it.
    it('still includes a locked item — the template disables it rather than this list hiding it', async () => {
      const lockedItem: ReservableItem =
        { id: 'item-3', name: 'Vintage Arch', quantityRemaining: 1, isLocked: true, isPendingRetirement: false };
      await setup({ data: { items: [...ITEMS, lockedItem] } });

      expect(component.filteredItems).toContain(lockedItem);
    });

    it('still includes a pending-retirement item — same "disabled, not hidden" treatment as a locked one', async () => {
      const pendingItem: ReservableItem =
        { id: 'item-4', name: 'Retiring Linens', quantityRemaining: 0, isLocked: false, isPendingRetirement: true };
      await setup({ data: { items: [...ITEMS, pendingItem] } });

      expect(component.filteredItems).toContain(pendingItem);
    });
  });

  describe('onItemSelected()', () => {
    it('resolves the picked id to its full ReservableItem and fills the search box with its name', async () => {
      await setup();

      component.onItemSelected({ option: { value: 'item-2' } } as never);

      expect(component.selectedItem).toEqual(ITEMS[1]);
      expect(component.itemSearchControl.value).toBe('Table Runners');
    });
  });

  describe('availableForSelectedRange', () => {
    it('is null until an item is picked', async () => {
      await setup();
      expect(component.availableForSelectedRange).toBeNull();
    });

    it('stays null once an item is picked but before a full date range is picked, so the hint stays hidden', async () => {
      await setup();
      component.onItemSelected({ option: { value: 'item-1' } } as never);
      expect(component.availableForSelectedRange).toBeNull();

      component.reservationForm.controls.dateRange.controls.start.setValue(new Date(2026, 5, 1));
      expect(component.availableForSelectedRange).toBeNull();
    });

    it('subtracts quantity from other reserved/picked_up bookings that overlap the picked range', async () => {
      await setup({
        data: {
          reservations: [
            createTestReservation({ quantity: 30, startDate: '2026-06-02', endDate: '2026-06-04', status: 'reserved' }),
            createTestReservation({ quantity: 10, startDate: '2026-06-02', endDate: '2026-06-04', status: 'picked_up' })
          ]
        }
      });
      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.reservationForm.controls.dateRange.setValue({ start: new Date(2026, 5, 1), end: new Date(2026, 5, 3) });

      expect(component.availableForSelectedRange).toBe(60);
    });

    it('ignores a non-overlapping reservation', async () => {
      await setup({
        data: { reservations: [createTestReservation({ quantity: 30, startDate: '2026-07-01', endDate: '2026-07-03' })] }
      });
      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.reservationForm.controls.dateRange.setValue({ start: new Date(2026, 5, 1), end: new Date(2026, 5, 3) });

      expect(component.availableForSelectedRange).toBe(100);
    });

    it('ignores a cancelled reservation even if the dates overlap', async () => {
      await setup({
        data: {
          reservations: [createTestReservation({ quantity: 30, startDate: '2026-06-01', endDate: '2026-06-03', status: 'cancelled' })]
        }
      });
      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.reservationForm.controls.dateRange.setValue({ start: new Date(2026, 5, 1), end: new Date(2026, 5, 3) });

      expect(component.availableForSelectedRange).toBe(100);
    });

    it('ignores a reservation against a different item', async () => {
      await setup({
        data: { reservations: [createTestReservation({ itemId: 'item-2', quantity: 30, startDate: '2026-06-01', endDate: '2026-06-03' })] }
      });
      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.reservationForm.controls.dateRange.setValue({ start: new Date(2026, 5, 1), end: new Date(2026, 5, 3) });

      expect(component.availableForSelectedRange).toBe(100);
    });
  });

  describe('save()', () => {
    function fillRequiredFields() {
      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.reservationForm.controls.dateRange.setValue({ start: new Date(2026, 5, 1), end: new Date(2026, 5, 3) });
      component.reservationForm.controls.quantity.setValue(10);
      component.reservationForm.controls.reservedFor.setValue('Smith wedding');
    }

    it('requires an item to be picked first', async () => {
      await setup();
      component.reservationForm.controls.quantity.setValue(10);

      await component.save();

      expect(component.error).toBe('Pick an item to reserve.');
    });

    it('requires both a start and end date', async () => {
      await setup();
      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.reservationForm.controls.quantity.setValue(10);
      component.reservationForm.controls.reservedFor.setValue('Smith wedding');

      await component.save();

      expect(component.reservationForm.controls.dateRange.controls.start.hasError('required')).toBeTrue();
    });

    it('requires who the reservation is for', async () => {
      await setup();
      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.reservationForm.controls.dateRange.setValue({ start: new Date(2026, 5, 1), end: new Date(2026, 5, 3) });
      component.reservationForm.controls.quantity.setValue(10);

      await component.save();

      expect(component.reservationForm.controls.reservedFor.hasError('required')).toBeTrue();
    });

    it('rejects an end date before the start date, via mat-date-range-input\'s own built-in validation', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');
      fillRequiredFields();
      component.reservationForm.controls.dateRange.setValue({ start: new Date(2026, 5, 5), end: new Date(2026, 5, 1) });

      await component.save();

      // matStartDate/matEndDate mark the range itself invalid (not a
      // component-level check), so this hits the generic
      // reservationForm.invalid branch — same as any other invalid field,
      // surfaced by the template's own mat-error rather than component.error.
      expect(component.reservationForm.controls.dateRange.controls.start.hasError('matStartDateInvalid')).toBeTrue();
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('calls create_reservation and closes with true on success', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');
      fillRequiredFields();

      await component.save();

      expect(component.error).toBeNull();
      expect(closeSpy).toHaveBeenCalledWith(true);
    });

    it('surfaces an RPC error (e.g. a failed capacity check) rather than closing the dialog', async () => {
      await setup({ error: { message: 'only 5 available' } });
      const closeSpy = spyOn(dialogRef, 'close');
      fillRequiredFields();

      await component.save();

      expect(component.error).toBe('only 5 available');
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });

  describe('cancel()', () => {
    it('closes the dialog with no result', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');

      component.cancel();

      expect(closeSpy).toHaveBeenCalledWith();
    });
  });

  describe('multi-item lines', () => {
    it('addLine() appends a blank line and removeLine() removes it', async () => {
      await setup();
      component.addLine();
      expect(component.additionalLines.length).toBe(1);

      component.removeLine(0);
      expect(component.additionalLines.length).toBe(0);
    });

    it('onLineItemSelected() resolves the picked item into that line', async () => {
      await setup();
      component.addLine();

      component.onLineItemSelected({ option: { value: 'item-2' } } as never, 0);

      expect(component.additionalLines[0].item).toEqual(ITEMS[1]);
      expect(component.additionalLines[0].searchTerm).toBe('Table Runners');
    });

    it('save() places one reservation per line, all sharing a group id, and closes with true once every line succeeds', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');
      const rpcSpy = spyOn((component as unknown as { supabase: { rpc: (...args: unknown[]) => unknown } }).supabase, 'rpc')
        .and.returnValue({ then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) } as never);

      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.reservationForm.controls.quantity.setValue(10);
      component.addLine();
      component.onLineItemSelected({ option: { value: 'item-2' } } as never, 0);
      component.additionalLines[0].quantity = 5;
      component.reservationForm.controls.dateRange.setValue({ start: new Date(2026, 5, 1), end: new Date(2026, 5, 3) });
      component.reservationForm.controls.reservedFor.setValue('Smith wedding');

      await component.save();

      expect(rpcSpy).toHaveBeenCalledTimes(2);
      const [firstName, firstParams] = rpcSpy.calls.argsFor(0) as [string, { group_id?: string }];
      const [, secondParams] = rpcSpy.calls.argsFor(1) as [string, { group_id?: string }];
      expect(firstName).toBe('create_reservation');
      expect(firstParams.group_id).toBeTruthy();
      expect(secondParams.group_id).toBe(firstParams.group_id);
      expect(closeSpy).toHaveBeenCalledWith(true);
      expect(component.error).toBeNull();
    });

    it('save() blocks the same item picked on two lines rather than submitting either', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');

      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.reservationForm.controls.quantity.setValue(10);
      component.addLine();
      component.onLineItemSelected({ option: { value: 'item-1' } } as never, 0);
      component.additionalLines[0].quantity = 5;
      component.reservationForm.controls.dateRange.setValue({ start: new Date(2026, 5, 1), end: new Date(2026, 5, 3) });
      component.reservationForm.controls.reservedFor.setValue('Smith wedding');

      await component.save();

      expect(component.error).toContain('picked more than once');
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('save() reports a partial failure and keeps the dialog open with only the failed line still pending', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');
      let call = 0;
      spyOn((component as unknown as { supabase: { rpc: (...args: unknown[]) => unknown } }).supabase, 'rpc').and.callFake(() => {
        call++;
        const error = call === 2 ? { message: 'only 3 available' } : null;
        return { then: (resolve: (v: { error: unknown }) => void) => resolve({ error }) } as never;
      });

      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.reservationForm.controls.quantity.setValue(10);
      component.addLine();
      component.onLineItemSelected({ option: { value: 'item-2' } } as never, 0);
      component.additionalLines[0].quantity = 5;
      component.reservationForm.controls.dateRange.setValue({ start: new Date(2026, 5, 1), end: new Date(2026, 5, 3) });
      component.reservationForm.controls.reservedFor.setValue('Smith wedding');

      await component.save();

      expect(closeSpy).not.toHaveBeenCalled();
      expect(component.error).toContain('1 of 2 reserved');
      expect(component.error).toContain('Table Runners');
      // The item that failed is still there to retry; the one that
      // succeeded was cleared out of the pending set.
      expect(component.selectedItem).toBeNull();
      expect(component.additionalLines.length).toBe(1);
      expect(component.additionalLines[0].item).toEqual(ITEMS[1]);
    });
  });

  describe('loadKit()', () => {
    const KIT = {
      id: 'kit-1',
      name: 'Wedding package',
      description: '',
      items: [
        { itemId: 'item-1', itemName: 'Chiavari Chairs', quantity: 50 },
        { itemId: 'item-2', itemName: 'Table Runners', quantity: 20 }
      ]
    };

    it('prefills the primary field from the kit\'s first item and the rest as additional lines', async () => {
      await setup({ data: { kits: [KIT] } });

      component.loadKit('kit-1');

      expect(component.selectedKitId).toBe('kit-1');
      expect(component.selectedItem).toEqual(ITEMS[0]);
      expect(component.reservationForm.controls.quantity.value).toBe(50);
      expect(component.additionalLines.length).toBe(1);
      expect(component.additionalLines[0].item).toEqual(ITEMS[1]);
      expect(component.additionalLines[0].quantity).toBe(20);
    });

    it('skips a kit item that no longer resolves to a real item and reports how many were skipped', async () => {
      const kitWithGoneItem = {
        ...KIT,
        items: [...KIT.items, { itemId: 'item-gone', itemName: 'Retired Thing', quantity: 3 }]
      };
      await setup({ data: { kits: [kitWithGoneItem] } });

      component.loadKit('kit-1');

      expect(component.kitItemsSkipped).toBe(1);
      expect(component.additionalLines.length).toBe(1);
    });

    it('is a no-op for an unknown kit id', async () => {
      await setup({ data: { kits: [KIT] } });

      component.loadKit('does-not-exist');

      expect(component.selectedItem).toBeNull();
      expect(component.selectedKitId).toBeNull();
    });
  });

  describe('setPickMode()', () => {
    const KIT = {
      id: 'kit-1',
      name: 'Wedding package',
      description: '',
      items: [{ itemId: 'item-1', itemName: 'Chiavari Chairs', quantity: 50 }]
    };

    it('defaults to \'items\' mode', async () => {
      await setup();
      expect(component.pickMode).toBe('items');
    });

    it('switches mode and clears whatever item/kit selection was already made', async () => {
      await setup({ data: { kits: [KIT] } });
      component.loadKit('kit-1');
      expect(component.selectedItem).not.toBeNull();

      component.setPickMode('kit');

      expect(component.pickMode).toBe('kit');
      expect(component.selectedItem).toBeNull();
      expect(component.selectedKitId).toBeNull();
      expect(component.additionalLines).toEqual([]);
      expect(component.itemSearchControl.value).toBe('');
      expect(component.reservationForm.controls.quantity.value).toBeNull();
    });

    it('clears a hand-picked item when switching to kit mode', async () => {
      await setup({ data: { kits: [KIT] } });
      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.reservationForm.controls.quantity.setValue(10);

      component.setPickMode('kit');

      expect(component.selectedItem).toBeNull();
      expect(component.reservationForm.controls.quantity.value).toBeNull();
    });

    it('is a no-op when already in that mode', async () => {
      await setup({ data: { kits: [KIT] } });
      component.onItemSelected({ option: { value: 'item-1' } } as never);

      component.setPickMode('items');

      // Unchanged — a real reset would have cleared this.
      expect(component.selectedItem).toEqual(ITEMS[0]);
    });

    it('leaves the shared date range/reserved-for/note fields untouched', async () => {
      await setup({ data: { kits: [KIT] } });
      component.reservationForm.controls.reservedFor.setValue('Smith wedding');

      component.setPickMode('kit');

      expect(component.reservationForm.controls.reservedFor.value).toBe('Smith wedding');
    });
  });

  describe('save() in kit mode', () => {
    it('asks the user to pick a kit rather than "pick an item" when nothing\'s been picked yet', async () => {
      await setup({ data: { kits: [{ id: 'kit-1', name: 'Wedding package', description: '', items: [] }] } });
      component.setPickMode('kit');

      await component.save();

      expect(component.error).toBe('Pick a kit to reserve from.');
    });
  });
});
