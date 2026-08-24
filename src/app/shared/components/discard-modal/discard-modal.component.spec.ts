import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { DiscardModalComponent, DiscardModalData } from './discard-modal.component';
import { InventoryFieldOptionsService } from '../../../core/inventory-field-options.service';
import { createFakeInventoryFieldOptionsService, createFakeMatDialogRef } from '../../../testing/fakes';
import { InventoryItemContainer } from '../../models/inventory-item-container.model';

const CONTAINERS: InventoryItemContainer[] = [
  { id: 'box-1', quantity: 10, location: 'Shelf A' },
  { id: 'box-2', quantity: 0, location: 'Shelf B' },
  { id: 'box-3', quantity: 5, location: '' }
];

describe('DiscardModalComponent', () => {
  let component: DiscardModalComponent;
  let fixture: ComponentFixture<DiscardModalComponent>;
  let dialogRef: MatDialogRef<DiscardModalComponent>;

  async function setup(data: DiscardModalData) {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<DiscardModalComponent>;

    await TestBed.configureTestingModule({
      imports: [DiscardModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
        {
          provide: InventoryFieldOptionsService,
          useValue: createFakeInventoryFieldOptionsService({ discard_reason: ['Water damage', 'Damaged in transit'] })
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DiscardModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await setup({ itemName: 'Frame Tent', quantityRemaining: 8, containers: [] });
    expect(component).toBeTruthy();
  });

  describe('flat item (no containers)', () => {
    it('caps maxQuantity at quantityRemaining', async () => {
      await setup({ itemName: 'Frame Tent', quantityRemaining: 8, containers: [] });
      expect(component.maxQuantity).toBe(8);
    });

    it('rejects a quantity above what remains', async () => {
      await setup({ itemName: 'Frame Tent', quantityRemaining: 8, containers: [] });
      component.discardForm.setValue({ containerId: null, quantity: 9, reasons: ['Water damage'] });

      component.submit();

      expect(component.error).toBe('Only 8 available to discard.');
    });

    it('requires at least one reason', async () => {
      await setup({ itemName: 'Frame Tent', quantityRemaining: 8, containers: [] });
      component.discardForm.controls.quantity.setValue(2);

      component.submit();

      expect(component.discardForm.controls.reasons.hasError('required')).toBeTrue();
    });

    it('closes with the discarded quantity/reasons and a null containerId on success', async () => {
      await setup({ itemName: 'Frame Tent', quantityRemaining: 8, containers: [] });
      const closeSpy = spyOn(dialogRef, 'close');
      component.discardForm.setValue({ containerId: null, quantity: 3, reasons: ['Water damage'] });

      component.submit();

      expect(closeSpy).toHaveBeenCalledWith({ quantity: 3, reasons: ['Water damage'], containerId: null });
    });

    it('closes with every reason picked, for a multi-select', async () => {
      await setup({ itemName: 'Frame Tent', quantityRemaining: 8, containers: [] });
      const closeSpy = spyOn(dialogRef, 'close');
      component.discardForm.setValue({ containerId: null, quantity: 3, reasons: ['Water damage', 'Damaged in transit'] });

      component.submit();

      expect(closeSpy).toHaveBeenCalledWith({ quantity: 3, reasons: ['Water damage', 'Damaged in transit'], containerId: null });
    });
  });

  describe('container-tracked item', () => {
    it('excludes already-empty boxes from availableContainers', async () => {
      await setup({ itemName: 'Chiavari Chairs', quantityRemaining: 15, containers: CONTAINERS });
      expect(component.availableContainers).toEqual([CONTAINERS[0], CONTAINERS[2]]);
    });

    it('requires a box to be picked first', async () => {
      await setup({ itemName: 'Chiavari Chairs', quantityRemaining: 15, containers: CONTAINERS });
      component.discardForm.controls.quantity.setValue(2);
      component.discardForm.controls.reasons.setValue(['Damaged in transit']);

      component.submit();

      expect(component.error).toBe('Pick which box to discard from.');
    });

    it('caps maxQuantity at the picked box\'s own quantity, not the item total', async () => {
      await setup({ itemName: 'Chiavari Chairs', quantityRemaining: 15, containers: CONTAINERS });
      component.discardForm.controls.containerId.setValue('box-3');
      expect(component.maxQuantity).toBe(5);
    });

    it('rejects a quantity above the picked box\'s own quantity', async () => {
      await setup({ itemName: 'Chiavari Chairs', quantityRemaining: 15, containers: CONTAINERS });
      component.discardForm.setValue({ containerId: 'box-3', quantity: 6, reasons: ['Damaged in transit'] });

      component.submit();

      expect(component.error).toBe('Only 5 available to discard.');
    });

    it('closes with the picked box\'s id on success', async () => {
      await setup({ itemName: 'Chiavari Chairs', quantityRemaining: 15, containers: CONTAINERS });
      const closeSpy = spyOn(dialogRef, 'close');
      component.discardForm.setValue({ containerId: 'box-1', quantity: 4, reasons: ['Damaged in transit'] });

      component.submit();

      expect(closeSpy).toHaveBeenCalledWith({ quantity: 4, reasons: ['Damaged in transit'], containerId: 'box-1' });
    });
  });

  describe('containerLabel()', () => {
    it('numbers a box by its 1-based position in the full containers list, including empty ones', async () => {
      await setup({ itemName: 'Chiavari Chairs', quantityRemaining: 15, containers: CONTAINERS });
      expect(component.containerLabel(CONTAINERS[2])).toBe('Box 3 (5 remaining)');
    });

    it('appends the location when set', async () => {
      await setup({ itemName: 'Chiavari Chairs', quantityRemaining: 15, containers: CONTAINERS });
      expect(component.containerLabel(CONTAINERS[0])).toBe('Box 1 (10 remaining) — Shelf A');
    });
  });

  describe('cancel()', () => {
    it('closes the dialog with no result', async () => {
      await setup({ itemName: 'Frame Tent', quantityRemaining: 8, containers: [] });
      const closeSpy = spyOn(dialogRef, 'close');

      component.cancel();

      expect(closeSpy).toHaveBeenCalledWith();
    });
  });
});
