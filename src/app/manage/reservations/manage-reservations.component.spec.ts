import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { ManageReservationsComponent } from './manage-reservations.component';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService } from '../../core/auth.service';
import { ReservationKitService } from '../../core/reservation-kit.service';
import { NotificationService } from '../../core/notification.service';
import { PlaceReservationModalComponent } from '../../shared/components/place-reservation-modal/place-reservation-modal.component';
import { createFakeActivatedRoute, createFakeAuthService, createFakeProfile, createFakeSupabaseService } from '../../testing/fakes';
import { InventoryItemReservationWithItem } from '../../shared/utils/inventory-item-reservations';
import { ReservationKit } from '../../shared/models/reservation-kit.model';

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

  describe('groupedFilteredReservations', () => {
    it('keeps an ordinary reservation (no groupId) as its own singleton group', async () => {
      await setup();
      component.reservations = [createTestReservation({ id: 'r-1', groupId: null })];

      const groups = component.groupedFilteredReservations;

      expect(groups.length).toBe(1);
      expect(groups[0].items.length).toBe(1);
      expect(groups[0].groupId).toBeNull();
    });

    it('collapses rows sharing a groupId into one group, preserving first-seen order', async () => {
      await setup();
      component.reservations = [
        createTestReservation({ id: 'r-1', itemId: 'item-1', groupId: 'group-1' }),
        createTestReservation({ id: 'r-2', itemId: 'item-2', groupId: 'group-1' }),
        createTestReservation({ id: 'r-3', itemId: 'item-3', groupId: null })
      ];

      const groups = component.groupedFilteredReservations;

      expect(groups.length).toBe(2);
      expect(groups[0].groupId).toBe('group-1');
      expect(groups[0].items.map(r => r.id)).toEqual(['r-1', 'r-2']);
      expect(groups[1].items[0].id).toBe('r-3');
    });
  });

  describe('groupHasReserved() / groupHasPickedUp()', () => {
    it('reflect whether any item in the group is still in that status', async () => {
      await setup();
      const group = {
        key: 'group-1',
        groupId: 'group-1',
        items: [
          createTestReservation({ id: 'r-1', status: 'reserved' }),
          createTestReservation({ id: 'r-2', status: 'picked_up' })
        ]
      };

      expect(component.groupHasReserved(group)).toBeTrue();
      expect(component.groupHasPickedUp(group)).toBeTrue();
    });
  });

  describe('markGroupPickedUp()', () => {
    it('acts only on the still-"reserved" items in the group and toasts once', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');
      const rpcSpy = spyOn((component as unknown as { supabase: { rpc: (...args: unknown[]) => unknown } }).supabase, 'rpc')
        .and.returnValue({ then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) } as never);

      const group = {
        key: 'group-1',
        groupId: 'group-1',
        items: [
          createTestReservation({ id: 'r-1', status: 'reserved' }),
          createTestReservation({ id: 'r-2', status: 'picked_up' })
        ]
      };

      await component.markGroupPickedUp(group);

      expect(rpcSpy).toHaveBeenCalledTimes(1);
      expect(rpcSpy).toHaveBeenCalledWith('mark_reservation_picked_up', { reservation_id: 'r-1' });
      expect(component.reservationError).toBeNull();
      expect(successSpy).toHaveBeenCalledWith('Reservation group marked picked up');
    });

    it('reports how many failed rather than assuming all-or-nothing', async () => {
      await setup();
      let call = 0;
      spyOn((component as unknown as { supabase: { rpc: (...args: unknown[]) => unknown } }).supabase, 'rpc').and.callFake(() => {
        call++;
        const error = call === 2 ? { message: 'not awaiting pickup' } : null;
        return { then: (resolve: (v: { error: unknown }) => void) => resolve({ error }) } as never;
      });

      const group = {
        key: 'group-1',
        groupId: 'group-1',
        items: [
          createTestReservation({ id: 'r-1', itemName: 'Chiavari Chairs', status: 'reserved' }),
          createTestReservation({ id: 'r-2', itemName: 'Round Tables', status: 'reserved' })
        ]
      };

      await component.markGroupPickedUp(group);

      expect(component.reservationError).toContain('1 of 2');
      expect(component.reservationError).toContain('Round Tables');
    });

    it('does nothing when no item in the group is still reserved', async () => {
      await setup();
      const rpcSpy = spyOn((component as unknown as { supabase: { rpc: (...args: unknown[]) => unknown } }).supabase, 'rpc');

      const group = { key: 'group-1', groupId: 'group-1', items: [createTestReservation({ status: 'returned' })] };

      await component.markGroupPickedUp(group);

      expect(rpcSpy).not.toHaveBeenCalled();
    });
  });

  describe('setPageTab()', () => {
    it('switches the tab and reflects it in the URL', async () => {
      await setup();
      const router = TestBed.inject(Router);
      const navigateSpy = spyOn(router, 'navigate').and.resolveTo(true);

      component.setPageTab('kits');

      expect(component.pageTab).toBe('kits');
      expect(navigateSpy).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { tab: 'kits' } }));
    });

    it('is a no-op when already on that tab', async () => {
      await setup();
      const router = TestBed.inject(Router);
      const navigateSpy = spyOn(router, 'navigate');

      component.setPageTab('reservations');

      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });

  describe('kits tab CRUD', () => {
    it('addKit() opens the kit form modal with the org\'s item catalog', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));

      component.addKit();

      expect(openSpy).toHaveBeenCalledWith(jasmine.anything(), jasmine.objectContaining({
        data: jasmine.objectContaining({ items: jasmine.any(Array) })
      }));
    });

    function performRemoveKit(kit: ReservationKit) {
      return (component as unknown as { performRemoveKit: (kit: ReservationKit) => Promise<void> }).performRemoveKit(kit);
    }

    it('removeKit() opens a confirm dialog before deleting anything', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));

      component.removeKit({ id: 'kit-1', name: 'Wedding package', description: '', items: [] });

      expect(openSpy).toHaveBeenCalledWith(jasmine.anything(), jasmine.objectContaining({
        data: jasmine.objectContaining({ danger: true })
      }));
    });

    it('performRemoveKit() (the confirm dialog\'s callback) deletes and toasts on success', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');
      const removeSpy = spyOn(TestBed.inject(ReservationKitService), 'remove').and.resolveTo(null);

      await performRemoveKit({ id: 'kit-1', name: 'Wedding package', description: '', items: [] });

      expect(removeSpy).toHaveBeenCalledWith('kit-1');
      expect(successSpy).toHaveBeenCalledWith('Kit deleted');
      expect(component.kitRemoveError).toBeNull();
    });

    it('performRemoveKit() surfaces a delete failure rather than toasting', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');
      spyOn(TestBed.inject(ReservationKitService), 'remove').and.resolveTo('Network error');

      await performRemoveKit({ id: 'kit-1', name: 'Wedding package', description: '', items: [] });

      expect(component.kitRemoveError).toBe('Network error');
      expect(successSpy).not.toHaveBeenCalled();
    });
  });
});

/** Table-aware and realtime-capturing at once — same reasoning
 *  ManageOrdersComponent's own identical local fake gives (createFakeSupabaseService()
 *  reuses one result for every `.from()` call and its fake channel never
 *  actually invokes a callback). */
function createRealtimeCapturingSupabaseService() {
  let capturedCallback: ((payload: unknown) => void) | null = null;
  let reservationsSelectCount = 0;

  function builder(table: string) {
    const b: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
    };
    for (const method of ['select', 'eq', 'order']) {
      b[method] = () => {
        if (table === 'inventory_item_reservations' && method === 'select') {
          reservationsSelectCount++;
        }
        return b;
      };
    }
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
    client: {
      from: (table: string) => builder(table),
      channel: () => channel,
      removeChannel: async () => ({ status: 'ok' }),
    }
  } as unknown as SupabaseService;

  return {
    service,
    emitChange: (payload: unknown) => capturedCallback?.(payload),
    getReservationsSelectCount: () => reservationsSelectCount,
  };
}

describe('ManageReservationsComponent realtime updates', () => {
  function configure(service: SupabaseService) {
    TestBed.configureTestingModule({
      imports: [ManageReservationsComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: service },
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) }
      ]
    });
    return TestBed.createComponent(ManageReservationsComponent);
  }

  it('collapses a burst of postgres_changes events into a single reload, 300ms after the last one', fakeAsync(() => {
    const { service, emitChange, getReservationsSelectCount } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    fixture.detectChanges();
    tick();

    // ngOnInit's own initial loadReservations() call.
    expect(getReservationsSelectCount()).toBe(1);

    emitChange({ eventType: 'UPDATE', new: { id: 'reservation-1' }, old: {} });
    emitChange({ eventType: 'UPDATE', new: { id: 'reservation-1' }, old: {} });
    emitChange({ eventType: 'UPDATE', new: { id: 'reservation-1' }, old: {} });

    tick(299);
    expect(getReservationsSelectCount()).toBe(1); // still within the debounce window

    tick(1);
    expect(getReservationsSelectCount()).toBe(2); // exactly one more loadReservations() call, not three
  }));

  it('cancels a pending debounced reload and removes the channel on destroy', fakeAsync(() => {
    const { service, emitChange, getReservationsSelectCount } = createRealtimeCapturingSupabaseService();
    const removeChannelSpy = spyOn(service.client, 'removeChannel').and.callThrough();
    const fixture = configure(service);
    fixture.detectChanges();
    tick();

    emitChange({ eventType: 'UPDATE', new: { id: 'reservation-1' }, old: {} });
    fixture.destroy();
    tick(300);

    expect(removeChannelSpy).toHaveBeenCalled();
    expect(getReservationsSelectCount()).toBe(1); // the debounced reload never fired post-destroy
  }));

  it('flashes a changed reservation only once the debounced reload actually reflects it, then clears the flash after it fades', fakeAsync(() => {
    const { service, emitChange } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    expect(component.isFlashing('reservation-1')).toBeFalse();

    emitChange({ eventType: 'UPDATE', new: { id: 'reservation-1' }, old: {} });
    // Not yet — still within the 300ms debounce window.
    expect(component.isFlashing('reservation-1')).toBeFalse();

    tick(300);
    expect(component.isFlashing('reservation-1')).toBeTrue();

    tick(1500);
    expect(component.isFlashing('reservation-1')).toBeFalse();
  }));

  it('does not flash a deleted reservation — there is nothing left to show it on, and inventory_item_reservations has no delete path anyway', fakeAsync(() => {
    const { service, emitChange } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    emitChange({ eventType: 'DELETE', new: {}, old: { id: 'reservation-1' } });
    tick(300);

    expect(component.isFlashing('reservation-1')).toBeFalse();
  }));
});

describe('ManageReservationsComponent ?highlight= deep link (landed on from the command palette\'s "Reservations" result)', () => {
  function tableAwareFake(reservationRow: Record<string, unknown> | null) {
    function builder(table: string) {
      const rows = table === 'inventory_item_reservations' && reservationRow ? [reservationRow] : [];
      const b: Record<string, unknown> = {
        then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
      };
      for (const method of ['select', 'eq', 'order']) {
        b[method] = () => b;
      }
      return b;
    }
    return {
      client: {
        from: (table: string) => builder(table),
        channel: () => ({ on: function (this: unknown) { return this; }, subscribe: function (this: unknown) { return this; } }),
        removeChannel: async () => ({ status: 'ok' })
      }
    } as unknown as SupabaseService;
  }

  function configure(highlight: string, reservationRow: Record<string, unknown> | null) {
    TestBed.configureTestingModule({
      imports: [ManageReservationsComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute({ highlight }) },
        { provide: SupabaseService, useValue: tableAwareFake(reservationRow) },
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ organization_id: 'org-1' })) }
      ]
    });
    return TestBed.createComponent(ManageReservationsComponent);
  }

  it('flashes the matching reservation once it has loaded', fakeAsync(() => {
    const fixture = configure('reservation-1', {
      id: 'reservation-1', item_id: 'item-1', start_date: '2026-06-01', end_date: '2026-06-03',
      quantity: 30, reserved_for: 'Smith wedding', note: null, status: 'reserved', reserved_by: null,
      reserved_at: '2026-01-15T00:00:00.000Z', picked_up_by: null, picked_up_at: null,
      returned_by: null, returned_at: null, cancelled_by: null, cancelled_at: null
    });
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.isFlashing('reservation-1')).toBeTrue();
  }));

  it('is a no-op when ?highlight= doesn\'t match any loaded reservation', fakeAsync(() => {
    const fixture = configure('missing', null);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.isFlashing('missing')).toBeFalse();
  }));
});
