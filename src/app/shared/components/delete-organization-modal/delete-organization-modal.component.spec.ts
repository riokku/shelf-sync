import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { DeleteOrganizationModalComponent } from './delete-organization-modal.component';
import { createFakeMatDialogRef } from '../../../testing/fakes';

describe('DeleteOrganizationModalComponent', () => {
  let component: DeleteOrganizationModalComponent;
  let fixture: ComponentFixture<DeleteOrganizationModalComponent>;
  let dialogRef: MatDialogRef<DeleteOrganizationModalComponent, boolean>;

  async function setup() {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<DeleteOrganizationModalComponent, boolean>;

    await TestBed.configureTestingModule({
      imports: [DeleteOrganizationModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { organizationName: 'Acme Events' } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DeleteOrganizationModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('canConfirm is false until the typed text exactly matches the org name', async () => {
    await setup();

    component.confirmationControl.setValue('Acme');
    expect(component.canConfirm).toBeFalse();

    component.confirmationControl.setValue('Acme Events');
    expect(component.canConfirm).toBeTrue();
  });

  it('does not close when the typed text doesn\'t match', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.confirmationControl.setValue('wrong');
    component.confirm();

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('closes with true once the typed text matches', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.confirmationControl.setValue('Acme Events');
    component.confirm();

    expect(closeSpy).toHaveBeenCalledWith(true);
  });

  it('cancel() closes with false', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.cancel();

    expect(closeSpy).toHaveBeenCalledWith(false);
  });

  // Regression test — see LockUserAccountModalComponent's own identical test
  // for the full story: this template's bare <form (ngSubmit)> (no
  // [formGroup]) silently fell through to a native, page-reloading form
  // submission without FormsModule imported alongside ReactiveFormsModule,
  // uncaught by every test above since calling confirm() directly bypasses
  // the DOM/(ngSubmit) binding entirely.
  it('intercepts the native form submit (via NgForm) rather than letting the browser navigate', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');
    component.confirmationControl.setValue('Acme Events');

    const formEl: HTMLFormElement = fixture.nativeElement.querySelector('form');
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    formEl.dispatchEvent(submitEvent);

    expect(submitEvent.defaultPrevented).toBeTrue();
    expect(closeSpy).toHaveBeenCalledWith(true);
  });
});
