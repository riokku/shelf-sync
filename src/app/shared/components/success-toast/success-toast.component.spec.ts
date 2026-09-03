import { TestBed } from '@angular/core/testing';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { SuccessToastComponent } from './success-toast.component';

/** SuccessToastComponent is rendered by NotificationService via
 *  openFromComponent(), never a template — mounted directly here with a
 *  fake MatSnackBarRef, the same way any other MAT_SNACK_BAR_DATA-consuming
 *  component would be tested in isolation from the snack bar machinery
 *  itself. */
function createFakeSnackBarRef() {
  return {
    dismissWithAction: jasmine.createSpy('dismissWithAction')
  } as unknown as MatSnackBarRef<SuccessToastComponent>;
}

describe('SuccessToastComponent', () => {
  it('renders no action button when undoLabel is omitted', async () => {
    await TestBed.configureTestingModule({
      imports: [SuccessToastComponent],
      providers: [
        { provide: MAT_SNACK_BAR_DATA, useValue: { message: 'Task created' } },
        { provide: MatSnackBarRef, useValue: createFakeSnackBarRef() }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(SuccessToastComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.success-toast-undo')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Task created');
  });

  it('renders the undo button with the given label, and clicking it dismisses with the action', async () => {
    const snackBarRef = createFakeSnackBarRef();
    await TestBed.configureTestingModule({
      imports: [SuccessToastComponent],
      providers: [
        { provide: MAT_SNACK_BAR_DATA, useValue: { message: 'Updated 3 items', undoLabel: 'Undo' } },
        { provide: MatSnackBarRef, useValue: snackBarRef }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(SuccessToastComponent);
    fixture.detectChanges();

    const undoButton = fixture.nativeElement.querySelector('.success-toast-undo') as HTMLButtonElement | null;
    expect(undoButton).not.toBeNull();
    expect(undoButton?.textContent).toContain('Undo');

    undoButton?.click();

    expect(snackBarRef.dismissWithAction).toHaveBeenCalled();
  });
});
