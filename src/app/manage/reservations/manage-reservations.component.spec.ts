import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { ManageReservationsComponent } from './manage-reservations.component';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { PlaceReservationModalComponent } from '../../shared/components/place-reservation-modal/place-reservation-modal.component';
import { createFakeAuthService, createFakeProfile, createFakeSupabaseService } from '../../testing/fakes';
import { InventoryItemReservationWithItem } from '../../shared/utils/inventory-item-reservations';

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

function createFakeDialogRef(result: unknown): MatDialogRef<unknown> {
  return { afterClosed: () => of(result) } as unknown as MatDialogRef<unknown>;
}

describe('ManageReservationsComponent', () => {
  let component: ManageReservationsComponent;
  let fixture: ComponentFixture<ManageReservationsComponent>;

  async function setup(options: { error?: { message: string } | null; role?: 'admin' | 'manager' | 'staff' } = {}) {
    await TestBed.configureTestingModule({
      imports: [ManageReservationsComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], error: options.error ?? null }) },
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: options.role ?? 'staff' })) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ManageReservationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('shows the empty state when the org has no reservations yet', async () => {
    await setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No reservations yet.');
  });

  it('sets loadError instead of silently rendering an empty list when the reservations query fails', async () => {
    await setup({ error: { message: 'Network error' } });
    fixture.detectChanges();

    expect(component.loadError).toBe('Network error');
    expect(component.reservations).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Couldn\'t load reservations. Network error');
  });

  it('retryLoad() clears loadError on a successful retry', async () => {
    await setup({ error: { message: 'Network error' } });
    expect(component.loadError).toBe('Network error');

    (component as unknown as { supabase: SupabaseService['client'] }).supabase =
      createFakeSupabaseService({ data: [], error: null }).client;

    component.retryLoad();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.loadError).toBeNull();
  });

  describe('page subtitle', () => {
    it('tells a staff viewer they only see their own reservations', async () => {
      await setup({ role: 'staff' });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Your own date-ranged bookings');
    });

    it('tells an admin/manager viewer they see everyone\'s', async () => {
      await setup({ role: 'manager' });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Date-ranged bookings against your inventory\'s stock.');
    });
  });

  describe('filteredReservations', () => {
    it('returns every reservation when the filter is "all"', async () => {
      await setup();
      component.reservations = [createTestReservation({ status: 'reserved' }), createTestReservation({ id: 'reservation-2', status: 'returned' })];
      component.statusFilter = 'all';

      expect(component.filteredReservations.length).toBe(2);
    });

    it('narrows to just the matching status otherwise', async () => {
      await setup();
      component.reservations = [createTestReservation({ status: 'reserved' }), createTestReservation({ id: 'reservation-2', status: 'returned' })];
      component.statusFilter = 'returned';

      expect(component.filteredReservations.length).toBe(1);
      expect(component.filteredReservations[0].id).toBe('reservation-2');
    });
  });

  function handlePlaceReservationResult(saved: boolean | undefined) {
    return (component as unknown as { handlePlaceReservationResult: (s: boolean | undefined) => Promise<void> })
      .handlePlaceReservationResult(saved);
  }

  describe('openPlaceReservation()', () => {
    it('opens the place-reservation modal with the current reservable items', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));

      component.openPlaceReservation();

      expect(openSpy).toHaveBeenCalledWith(PlaceReservationModalComponent, jasmine.anything());
    });
  });

  describe('handlePlaceReservationResult() (afterClosed()\'s callback)', () => {
    it('reloads and toasts on a truthy close', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await handlePlaceReservationResult(true);

      expect(successSpy).toHaveBeenCalledWith('Reservation created');
    });

    it('does not toast when the modal was dismissed without saving', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await handlePlaceReservationResult(undefined);

      expect(successSpy).not.toHaveBeenCalled();
    });
  });

  describe('markPickedUp()', () => {
    it('clears any prior error and toasts on success', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await component.markPickedUp(createTestReservation());

      expect(component.reservationError).toBeNull();
      expect(successSpy).toHaveBeenCalledWith('Reservation marked picked up');
    });

    it('surfaces the RPC error inline', async () => {
      await setup({ error: { message: 'not awaiting pickup' } });

      await component.markPickedUp(createTestReservation());

      expect(component.reservationError).toBe('not awaiting pickup');
    });
  });

  describe('markReturned()', () => {
    it('clears any prior error and toasts on success', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await component.markReturned(createTestReservation({ status: 'picked_up' }));

      expect(component.reservationError).toBeNull();
      expect(successSpy).toHaveBeenCalledWith('Reservation marked returned');
    });

    it('surfaces the RPC error inline', async () => {
      await setup({ error: { message: 'not currently picked up' } });

      await component.markReturned(createTestReservation({ status: 'picked_up' }));

      expect(component.reservationError).toBe('not currently picked up');
    });
  });

  describe('cancelReservation()', () => {
    it('clears any prior error and toasts on success', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await component.cancelReservation(createTestReservation());

      expect(component.reservationError).toBeNull();
      expect(successSpy).toHaveBeenCalledWith('Reservation cancelled');
    });

    it('surfaces the RPC error inline', async () => {
      await setup({ error: { message: 'can no longer be cancelled' } });

      await component.cancelReservation(createTestReservation());

      expect(component.reservationError).toBe('can no longer be cancelled');
    });
  });
});
