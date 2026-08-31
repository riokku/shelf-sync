import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';

import { PlaceReservationModalComponent, PlaceReservationModalData, ReservableItem } from './place-reservation-modal.component';
import { SupabaseService } from '../../../core/supabase.service';
import { createFakeMatDialogRef, createFakeSupabaseService } from '../../../testing/fakes';
import { InventoryItemReservationWithItem } from '../../utils/inventory-item-reservations';

const ITEMS: ReservableItem[] = [
  { id: 'item-1', name: 'Chiavari Chairs', quantityRemaining: 100, isLocked: false },
  { id: 'item-2', name: 'Table Runners', quantityRemaining: 40, isLocked: false }
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
      const lockedItem: ReservableItem = { id: 'item-3', name: 'Vintage Arch', quantityRemaining: 1, isLocked: true };
      await setup({ data: { items: [...ITEMS, lockedItem] } });

      expect(component.filteredItems).toContain(lockedItem);
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
});
