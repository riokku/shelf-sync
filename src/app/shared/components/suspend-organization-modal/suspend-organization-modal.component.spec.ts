import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { SuspendOrganizationModalComponent } from './suspend-organization-modal.component';
import { createFakeMatDialogRef } from '../../../testing/fakes';

describe('SuspendOrganizationModalComponent', () => {
  let component: SuspendOrganizationModalComponent;
  let fixture: ComponentFixture<SuspendOrganizationModalComponent>;
  let dialogRef: MatDialogRef<SuspendOrganizationModalComponent, string>;

  async function setup() {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<SuspendOrganizationModalComponent, string>;

    await TestBed.configureTestingModule({
      imports: [SuspendOrganizationModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { organizationName: 'Acme Events' } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SuspendOrganizationModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('does not close when the reason is left blank', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.confirm();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(component.reasonControl.touched).toBeTrue();
  });

  it('closes with the trimmed reason on confirm', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.reasonControl.setValue('  Repeated abuse reports  ');
    component.confirm();

    expect(closeSpy).toHaveBeenCalledWith('Repeated abuse reports');
  });

  it('cancel() closes with undefined', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.cancel();

    expect(closeSpy).toHaveBeenCalledWith(undefined);
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
    component.reasonControl.setValue('Repeated abuse reports');

    const formEl: HTMLFormElement = fixture.nativeElement.querySelector('form');
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    formEl.dispatchEvent(submitEvent);

    expect(submitEvent.defaultPrevented).toBeTrue();
    expect(closeSpy).toHaveBeenCalledWith('Repeated abuse reports');
  });
});
