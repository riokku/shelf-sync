import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { AddFieldOptionModalComponent, AddFieldOptionModalData } from './add-field-option-modal.component';
import { InventoryFieldOptionsService } from '../../../core/inventory-field-options.service';
import { createFakeInventoryFieldOptionsService, createFakeMatDialogRef } from '../../../testing/fakes';

describe('AddFieldOptionModalComponent', () => {
  let component: AddFieldOptionModalComponent;
  let fixture: ComponentFixture<AddFieldOptionModalComponent>;
  let dialogRef: MatDialogRef<AddFieldOptionModalComponent>;
  let fieldOptions: InventoryFieldOptionsService;

  async function setup(data: AddFieldOptionModalData = { field: 'category', label: 'category' }) {
    fieldOptions = createFakeInventoryFieldOptionsService();
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<AddFieldOptionModalComponent>;

    await TestBed.configureTestingModule({
      imports: [AddFieldOptionModalComponent],
      providers: [
        { provide: InventoryFieldOptionsService, useValue: fieldOptions },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AddFieldOptionModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('does not save when the value field is left blank', async () => {
    await setup();
    const addSpy = spyOn(fieldOptions, 'addOption');

    await component.save();

    expect(addSpy).not.toHaveBeenCalled();
    expect(component.form.controls.value.hasError('required')).toBeTrue();
  });

  it('adds the new option and closes with the trimmed value on success', async () => {
    await setup({ field: 'physical_location', label: 'physical location' });
    const addSpy = spyOn(fieldOptions, 'addOption').and.resolveTo(null);
    const closeSpy = spyOn(dialogRef, 'close');

    component.form.controls.value.setValue('  Back Warehouse  ');
    await component.save();

    expect(addSpy).toHaveBeenCalledWith('physical_location', 'Back Warehouse');
    expect(closeSpy).toHaveBeenCalledWith('Back Warehouse');
    expect(component.error).toBeNull();
  });

  it('surfaces a save failure inline rather than closing the dialog', async () => {
    await setup();
    spyOn(fieldOptions, 'addOption').and.resolveTo('Already exists');
    const closeSpy = spyOn(dialogRef, 'close');

    component.form.controls.value.setValue('Furniture');
    await component.save();

    expect(component.error).toBe('Already exists');
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('cancel() closes the dialog with no result', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.cancel();

    expect(closeSpy).toHaveBeenCalledWith();
  });
});
