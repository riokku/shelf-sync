import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { QrLabelModalComponent, QrLabelModalData } from './qr-label-modal.component';

describe('QrLabelModalComponent', () => {
  let component: QrLabelModalComponent;
  let fixture: ComponentFixture<QrLabelModalComponent>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<QrLabelModalComponent>>;

  const data: QrLabelModalData = { itemId: 'item-1', itemName: 'Test Item' };

  beforeEach(async () => {
    dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [QrLabelModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(QrLabelModalComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('generates a data URL for the item on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(component.generateError).toBeNull();
  });

  it('closes the dialog', () => {
    fixture.detectChanges();
    component.close();
    expect(dialogRef.close).toHaveBeenCalled();
  });
});
