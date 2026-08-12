import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { DiscardInventoryModalComponent } from './discard-inventory-modal.component';
import { createFakeMatDialogRef } from '../../../testing/fakes';

describe('DiscardInventoryModalComponent', () => {
  let component: DiscardInventoryModalComponent;
  let fixture: ComponentFixture<DiscardInventoryModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiscardInventoryModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
        { provide: MAT_DIALOG_DATA, useValue: { itemName: 'Test Item', quantityRemaining: 50 } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DiscardInventoryModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('defaults to discarding the full remaining quantity', () => {
    expect(component.effectiveQuantity).toBe(50);
    expect(component.canSubmit).toBe(false); // notes still required
  });

  it('requires a valid quantity when discarding a specific amount', () => {
    component.discardForm.controls.mode.setValue('partial');
    component.discardForm.controls.notes.setValue('Water damage');
    component.discardForm.controls.quantity.setValue(0);
    expect(component.canSubmit).toBe(false);

    component.discardForm.controls.quantity.setValue(75);
    expect(component.canSubmit).toBe(false);

    component.discardForm.controls.quantity.setValue(10);
    expect(component.canSubmit).toBe(true);
    expect(component.effectiveQuantity).toBe(10);
  });

  it('closes with the discarded quantity and trimmed notes on submit', () => {
    const closeSpy = spyOn(component.dialogRef, 'close');
    component.discardForm.controls.notes.setValue('  Expired stock  ');
    component.submit();
    expect(closeSpy).toHaveBeenCalledWith({ quantity: 50, notes: 'Expired stock' });
  });
});
