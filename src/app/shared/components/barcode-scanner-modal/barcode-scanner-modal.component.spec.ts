import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { BarcodeScannerModalComponent } from './barcode-scanner-modal.component';

describe('BarcodeScannerModalComponent', () => {
  let component: BarcodeScannerModalComponent;
  let fixture: ComponentFixture<BarcodeScannerModalComponent>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<BarcodeScannerModalComponent, string | undefined>>;

  beforeEach(async () => {
    dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [BarcodeScannerModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BarcodeScannerModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // No fake camera is configured in the headless test browser, so
  // decodeFromConstraints() rejects the same way it would on a real device
  // with no camera or a denied permission prompt — the manual-entry
  // fallback below is what's actually under test here, not the camera path.

  it('closes with the trimmed manual code on submit', () => {
    component.manualForm.controls.code.setValue('  012345678905  ');

    component.submitManualCode();

    expect(dialogRef.close).toHaveBeenCalledWith('012345678905');
  });

  it('does not close on an empty manual code', () => {
    component.manualForm.controls.code.setValue('   ');

    component.submitManualCode();

    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('closes with no result on cancel', () => {
    component.cancel();

    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
