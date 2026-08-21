import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { BulkReassignModalComponent, BulkReassignModalData } from './bulk-reassign-modal.component';
import { createFakeMatDialogRef } from '../../../testing/fakes';

describe('BulkReassignModalComponent', () => {
  let component: BulkReassignModalComponent;
  let fixture: ComponentFixture<BulkReassignModalComponent>;
  let dialogRef: ReturnType<typeof createFakeMatDialogRef>;

  const data: BulkReassignModalData = {
    itemCount: 3,
    categoryOptions: ['Tools', 'Safety'],
    physicalLocationOptions: ['Warehouse A', 'Warehouse B']
  };

  beforeEach(async () => {
    dialogRef = createFakeMatDialogRef();

    await TestBed.configureTestingModule({
      imports: [BulkReassignModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BulkReassignModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('canApply', () => {
    it('is false when neither field is checked', () => {
      expect(component.canApply).toBeFalse();
    });

    it('is true once either field is checked', () => {
      component.form.controls.updateCategory.setValue(true);
      expect(component.canApply).toBeTrue();

      component.form.controls.updateCategory.setValue(false);
      component.form.controls.updatePhysicalLocation.setValue(true);
      expect(component.canApply).toBeTrue();
    });
  });

  describe('apply()', () => {
    it('does nothing if neither field is checked', () => {
      spyOn(dialogRef, 'close');
      component.apply();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('closes with only the checked field(s), leaving the other null', () => {
      spyOn(dialogRef, 'close');
      component.form.controls.updateCategory.setValue(true);
      component.form.controls.category.setValue('Tools');

      component.apply();

      expect(dialogRef.close).toHaveBeenCalledWith({
        category: { value: 'Tools' },
        physicalLocation: null
      });
    });

    it('closes with both fields when both are checked', () => {
      spyOn(dialogRef, 'close');
      component.form.setValue({
        updateCategory: true,
        category: 'Safety',
        updatePhysicalLocation: true,
        physicalLocation: 'Warehouse B'
      });

      component.apply();

      expect(dialogRef.close).toHaveBeenCalledWith({
        category: { value: 'Safety' },
        physicalLocation: { value: 'Warehouse B' }
      });
    });

    it('closes with an explicit empty value when "(None)" is chosen for a checked field', () => {
      spyOn(dialogRef, 'close');
      component.form.controls.updateCategory.setValue(true);
      component.form.controls.category.setValue('');

      component.apply();

      expect(dialogRef.close).toHaveBeenCalledWith({
        category: { value: '' },
        physicalLocation: null
      });
    });
  });

  it('cancel() closes with no result', () => {
    spyOn(dialogRef, 'close');
    component.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
