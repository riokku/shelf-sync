import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { ManageOrdersComponent } from './manage-orders.component';
import { SupabaseService } from '../../core/supabase.service';
import { SupplierService } from '../../core/supplier.service';
import { NotificationService } from '../../core/notification.service';
import { PlaceOrderModalComponent } from '../../shared/components/place-order-modal/place-order-modal.component';
import { createFakeSupabaseService, createFakeSupplierService } from '../../testing/fakes';
import { InventoryItemOrderWithItem } from '../../shared/utils/inventory-item-orders';

function createTestOrder(overrides: Partial<InventoryItemOrderWithItem> = {}): InventoryItemOrderWithItem {
  return {
    id: 'order-1',
    itemId: 'item-1',
    itemName: 'Chiavari Chairs',
    supplierName: 'Gatherwell Event Furniture Co.',
    quantity: 20,
    status: 'ordered',
    note: '',
    orderedByLabel: 'Jamie Lee',
    orderedAt: '2026-01-15T00:00:00.000Z',
    receivedByLabel: '',
    receivedAt: '',
    ...overrides,
  };
}

function createFakeDialogRef(result: unknown): MatDialogRef<unknown> {
  return { afterClosed: () => of(result) } as unknown as MatDialogRef<unknown>;
}

describe('ManageOrdersComponent', () => {
  let component: ManageOrdersComponent;
  let fixture: ComponentFixture<ManageOrdersComponent>;

  async function setup(options: { error?: { message: string } | null } = {}) {
    await TestBed.configureTestingModule({
      imports: [ManageOrdersComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], error: options.error ?? null }) },
        { provide: SupplierService, useValue: createFakeSupplierService() }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ManageOrdersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('shows the empty state when the org has no orders yet', async () => {
    await setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No orders placed yet.');
  });

  it('sets loadError instead of silently rendering an empty list when the orders query fails', async () => {
    await setup({ error: { message: 'Network error' } });
    fixture.detectChanges();

    expect(component.loadError).toBe('Network error');
    expect(component.orders).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Couldn\'t load orders. Network error');
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

  describe('filteredOrders', () => {
    it('returns every order when the filter is "all"', async () => {
      await setup();
      component.orders = [createTestOrder({ status: 'ordered' }), createTestOrder({ id: 'order-2', status: 'received' })];
      component.statusFilter = 'all';

      expect(component.filteredOrders.length).toBe(2);
    });

    it('narrows to just the matching status otherwise', async () => {
      await setup();
      component.orders = [createTestOrder({ status: 'ordered' }), createTestOrder({ id: 'order-2', status: 'received' })];
      component.statusFilter = 'received';

      expect(component.filteredOrders.length).toBe(1);
      expect(component.filteredOrders[0].id).toBe('order-2');
    });
  });

  function handlePlaceOrderResult(saved: boolean | undefined) {
    return (component as unknown as { handlePlaceOrderResult: (s: boolean | undefined) => Promise<void> })
      .handlePlaceOrderResult(saved);
  }

  describe('openPlaceOrder()', () => {
    it('opens the place-order modal with the current orderable items', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));

      component.openPlaceOrder();

      expect(openSpy).toHaveBeenCalledWith(PlaceOrderModalComponent, jasmine.anything());
    });
  });

  describe('handlePlaceOrderResult() (afterClosed()\'s callback)', () => {
    it('reloads and toasts on a truthy close', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await handlePlaceOrderResult(true);

      expect(successSpy).toHaveBeenCalledWith('Order placed');
    });

    it('does not toast when the modal was dismissed without saving', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await handlePlaceOrderResult(undefined);

      expect(successSpy).not.toHaveBeenCalled();
    });
  });

  describe('markReceived()', () => {
    it('clears any prior error and toasts on success', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await component.markReceived(createTestOrder());

      expect(component.orderError).toBeNull();
      expect(successSpy).toHaveBeenCalledWith('Order marked received');
    });

    it('surfaces the RPC error inline', async () => {
      await setup({ error: { message: 'already received' } });

      await component.markReceived(createTestOrder());

      expect(component.orderError).toBe('already received');
    });
  });

  describe('cancelOrder()', () => {
    it('clears any prior error and toasts on success', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await component.cancelOrder(createTestOrder());

      expect(component.orderError).toBeNull();
      expect(successSpy).toHaveBeenCalledWith('Order cancelled');
    });

    it('surfaces the RPC error inline', async () => {
      await setup({ error: { message: 'not awaiting receipt' } });

      await component.cancelOrder(createTestOrder());

      expect(component.orderError).toBe('not awaiting receipt');
    });
  });
});

/** Table-aware and realtime-capturing at once — createFakeSupabaseService()
 *  (testing/fakes.ts) is deliberately too generic for this (one result
 *  reused for every `.from()` call, and its own fake channel never actually
 *  invokes a callback — see its own doc comment), same reasoning
 *  ManageTasksComponent's own identical local fake gives. */
function createRealtimeCapturingSupabaseService() {
  let capturedCallback: ((payload: unknown) => void) | null = null;
  let ordersSelectCount = 0;

  function builder(table: string) {
    const b: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
    };
    for (const method of ['select', 'eq', 'order']) {
      b[method] = () => {
        if (table === 'inventory_item_orders' && method === 'select') {
          ordersSelectCount++;
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
    getOrdersSelectCount: () => ordersSelectCount,
  };
}

describe('ManageOrdersComponent realtime updates', () => {
  function configure(service: SupabaseService) {
    TestBed.configureTestingModule({
      imports: [ManageOrdersComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: service },
        { provide: SupplierService, useValue: createFakeSupplierService() }
      ]
    });
    return TestBed.createComponent(ManageOrdersComponent);
  }

  it('collapses a burst of postgres_changes events into a single reload, 300ms after the last one', fakeAsync(() => {
    const { service, emitChange, getOrdersSelectCount } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    fixture.detectChanges();
    tick();

    // ngOnInit's own initial loadOrders() call.
    expect(getOrdersSelectCount()).toBe(1);

    emitChange({ eventType: 'UPDATE', new: { id: 'order-1' }, old: {} });
    emitChange({ eventType: 'UPDATE', new: { id: 'order-1' }, old: {} });
    emitChange({ eventType: 'UPDATE', new: { id: 'order-1' }, old: {} });

    tick(299);
    expect(getOrdersSelectCount()).toBe(1); // still within the debounce window

    tick(1);
    expect(getOrdersSelectCount()).toBe(2); // exactly one more loadOrders() call, not three
  }));

  it('cancels a pending debounced reload and removes the channel on destroy', fakeAsync(() => {
    const { service, emitChange, getOrdersSelectCount } = createRealtimeCapturingSupabaseService();
    const removeChannelSpy = spyOn(service.client, 'removeChannel').and.callThrough();
    const fixture = configure(service);
    fixture.detectChanges();
    tick();

    emitChange({ eventType: 'UPDATE', new: { id: 'order-1' }, old: {} });
    fixture.destroy();
    tick(300);

    expect(removeChannelSpy).toHaveBeenCalled();
    expect(getOrdersSelectCount()).toBe(1); // the debounced reload never fired post-destroy
  }));

  it('flashes a changed order only once the debounced reload actually reflects it, then clears the flash after it fades', fakeAsync(() => {
    const { service, emitChange } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    expect(component.isFlashing('order-1')).toBeFalse();

    emitChange({ eventType: 'UPDATE', new: { id: 'order-1' }, old: {} });
    // Not yet — still within the 300ms debounce window.
    expect(component.isFlashing('order-1')).toBeFalse();

    tick(300);
    expect(component.isFlashing('order-1')).toBeTrue();

    tick(1500);
    expect(component.isFlashing('order-1')).toBeFalse();
  }));

  it('does not flash a deleted order — there is nothing left to show it on, and inventory_item_orders has no delete path anyway', fakeAsync(() => {
    const { service, emitChange } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    emitChange({ eventType: 'DELETE', new: {}, old: { id: 'order-1' } });
    tick(300);

    expect(component.isFlashing('order-1')).toBeFalse();
  }));
});
