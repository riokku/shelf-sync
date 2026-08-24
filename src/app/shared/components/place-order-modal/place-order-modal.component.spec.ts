import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { PlaceOrderModalComponent, OrderableItem } from './place-order-modal.component';
import { SupabaseService } from '../../../core/supabase.service';
import { AuthService } from '../../../core/auth.service';
import { createFakeAuthService, createFakeMatDialogRef, createFakeProfile, createFakeSupabaseService } from '../../../testing/fakes';

const ITEMS: OrderableItem[] = [
  { id: 'item-1', name: 'Chiavari Chairs', supplierId: 'supplier-1', supplierName: 'Gatherwell Event Furniture Co.' },
  { id: 'item-2', name: 'Table Runners', supplierId: 'supplier-2', supplierName: 'Linen & Lace Event Textiles' }
];

describe('PlaceOrderModalComponent', () => {
  let component: PlaceOrderModalComponent;
  let fixture: ComponentFixture<PlaceOrderModalComponent>;
  let dialogRef: MatDialogRef<PlaceOrderModalComponent>;

  async function setup(options: { hasSession?: boolean; error?: { message: string } | null } = {}) {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<PlaceOrderModalComponent>;

    await TestBed.configureTestingModule({
      imports: [PlaceOrderModalComponent],
      providers: [
        {
          provide: AuthService,
          useValue: createFakeAuthService(createFakeProfile(), { hasSession: options.hasSession ?? true })
        },
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], error: options.error ?? null }) },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { items: ITEMS } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PlaceOrderModalComponent);
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
  });

  describe('onItemSelected()', () => {
    it('resolves the picked id to its full OrderableItem and fills the search box with its name', async () => {
      await setup();

      component.onItemSelected({ option: { value: 'item-2' } } as never);

      expect(component.selectedItem).toEqual(ITEMS[1]);
      expect(component.itemSearchControl.value).toBe('Table Runners');
    });
  });

  describe('save()', () => {
    it('requires an item to be picked first', async () => {
      await setup();
      component.orderForm.controls.quantity.setValue(10);

      await component.save();

      expect(component.error).toBe('Pick an item to order.');
    });

    it('requires a valid quantity', async () => {
      await setup();
      component.onItemSelected({ option: { value: 'item-1' } } as never);

      await component.save();

      expect(component.orderForm.controls.quantity.hasError('required')).toBeTrue();
    });

    it('requires a signed-in session', async () => {
      await setup({ hasSession: false });
      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.orderForm.controls.quantity.setValue(10);

      await component.save();

      expect(component.error).toBe('You must be signed in to place an order.');
    });

    it('inserts the order and closes with true on success', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');
      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.orderForm.controls.quantity.setValue(10);

      await component.save();

      expect(component.error).toBeNull();
      expect(closeSpy).toHaveBeenCalledWith(true);
    });

    it('surfaces an insert error rather than closing the dialog', async () => {
      await setup({ error: { message: 'insert failed' } });
      const closeSpy = spyOn(dialogRef, 'close');
      component.onItemSelected({ option: { value: 'item-1' } } as never);
      component.orderForm.controls.quantity.setValue(10);

      await component.save();

      expect(component.error).toBe('insert failed');
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
