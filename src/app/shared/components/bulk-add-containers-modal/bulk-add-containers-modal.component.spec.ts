import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { BulkAddContainersModalComponent, BulkAddContainersModalData } from './bulk-add-containers-modal.component';
import { createFakeMatDialogRef } from '../../../testing/fakes';

describe('BulkAddContainersModalComponent', () => {
  let component: BulkAddContainersModalComponent;
  let fixture: ComponentFixture<BulkAddContainersModalComponent>;
  let dialogRef: ReturnType<typeof createFakeMatDialogRef>;

  function createComponent(data: BulkAddContainersModalData): void {
    dialogRef = createFakeMatDialogRef();

    TestBed.configureTestingModule({
      imports: [BulkAddContainersModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    });

    fixture = TestBed.createComponent(BulkAddContainersModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', () => {
    createComponent({ locationOptions: [], defaultLocation: '' });
    expect(component).toBeTruthy();
  });

  it('pre-fills location from the data passed in, not blank', () => {
    createComponent({ locationOptions: ['Warehouse A', 'Warehouse B'], defaultLocation: 'Warehouse A' });
    expect(component.form.controls.location.value).toBe('Warehouse A');
  });

  it('defaults count to 1', () => {
    createComponent({ locationOptions: [], defaultLocation: '' });
    expect(component.form.controls.count.value).toBe(1);
  });

  describe('apply()', () => {
    it('closes with the count and location entered', () => {
      createComponent({ locationOptions: ['Warehouse A'], defaultLocation: 'Warehouse A' });
      spyOn(dialogRef, 'close');
      component.form.setValue({ count: 4, location: 'Warehouse A' });

      component.apply();

      expect(dialogRef.close).toHaveBeenCalledWith({ count: 4, location: 'Warehouse A' });
    });

    it('is blocked, without closing, when count is missing or below 1', () => {
      createComponent({ locationOptions: [], defaultLocation: '' });
      spyOn(dialogRef, 'close');
      component.form.controls.count.setValue(0);

      component.apply();

      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(component.form.controls.count.touched).toBeTrue();
    });
  });

  it('cancel() closes with no result', () => {
    createComponent({ locationOptions: [], defaultLocation: '' });
    spyOn(dialogRef, 'close');
    component.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
