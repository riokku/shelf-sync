import { ComponentFixture, TestBed } from '@angular/core/testing';
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
