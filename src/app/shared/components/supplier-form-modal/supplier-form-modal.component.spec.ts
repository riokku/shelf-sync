import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { SupplierFormModalComponent } from './supplier-form-modal.component';
import { SupplierService } from '../../../core/supplier.service';
import { createFakeMatDialogRef, createFakeSupplierService } from '../../../testing/fakes';
import { Supplier } from '../../models/supplier.model';

describe('SupplierFormModalComponent', () => {
  let component: SupplierFormModalComponent;
  let fixture: ComponentFixture<SupplierFormModalComponent>;
  let dialogRef: MatDialogRef<SupplierFormModalComponent>;
  let supplierService: SupplierService;

  async function setup(data: { supplier?: Supplier } = {}) {
    supplierService = createFakeSupplierService();
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<SupplierFormModalComponent>;

    await TestBed.configureTestingModule({
      imports: [SupplierFormModalComponent],
      providers: [
        { provide: SupplierService, useValue: supplierService },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierFormModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('is not in edit mode and starts with blank fields when no supplier is passed', async () => {
    await setup();
    expect(component.isEditing).toBeFalse();
    expect(component.form.controls.name.value).toBe('');
  });

  it('is in edit mode and prefills the form when a supplier is passed', async () => {
    const supplier: Supplier = {
      id: 'supplier-1',
      name: 'Gatherwell Event Furniture Co.',
      contactName: 'Alex Rivera',
      email: 'alex@gatherwell.example.com',
      phone: '555-0100',
      website: 'https://gatherwell.example.com',
      notes: 'Preferred furniture vendor'
    };
    await setup({ supplier });

    expect(component.isEditing).toBeTrue();
    expect(component.form.controls.name.value).toBe('Gatherwell Event Furniture Co.');
    expect(component.form.controls.contactName.value).toBe('Alex Rivera');
  });

  it('does not save when the name field is left blank', async () => {
    await setup();
    const createSpy = spyOn(supplierService, 'create');

    await component.save();

    expect(createSpy).not.toHaveBeenCalled();
    expect(component.form.controls.name.hasError('required')).toBeTrue();
  });

  it('creates a new supplier and closes with true on success', async () => {
    await setup();
    const createSpy = spyOn(supplierService, 'create').and.resolveTo(null);
    const closeSpy = spyOn(dialogRef, 'close');

    component.form.controls.name.setValue('New Supplier Co.');
    await component.save();

    expect(createSpy).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'New Supplier Co.' }));
    expect(closeSpy).toHaveBeenCalledWith(true);
    expect(component.error).toBeNull();
  });

  it('updates an existing supplier rather than creating one when editing', async () => {
    const supplier: Supplier = {
      id: 'supplier-1',
      name: 'Gatherwell Event Furniture Co.',
      contactName: '',
      email: '',
      phone: '',
      website: '',
      notes: ''
    };
    await setup({ supplier });
    const updateSpy = spyOn(supplierService, 'update').and.resolveTo(null);
    const createSpy = spyOn(supplierService, 'create');

    await component.save();

    expect(updateSpy).toHaveBeenCalledWith('supplier-1', jasmine.objectContaining({ name: 'Gatherwell Event Furniture Co.' }));
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('surfaces a save failure inline rather than closing the dialog', async () => {
    await setup();
    spyOn(supplierService, 'create').and.resolveTo('Name already exists');
    const closeSpy = spyOn(dialogRef, 'close');

    component.form.controls.name.setValue('Duplicate Co.');
    await component.save();

    expect(component.error).toBe('Name already exists');
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('cancel() closes the dialog with no result', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.cancel();

    expect(closeSpy).toHaveBeenCalledWith();
  });
});
