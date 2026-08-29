import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { LockUserAccountModalComponent } from './lock-user-account-modal.component';
import { createFakeMatDialogRef } from '../../../testing/fakes';

describe('LockUserAccountModalComponent', () => {
  let component: LockUserAccountModalComponent;
  let fixture: ComponentFixture<LockUserAccountModalComponent>;
  let dialogRef: MatDialogRef<LockUserAccountModalComponent, string>;

  async function setup() {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<LockUserAccountModalComponent, string>;

    await TestBed.configureTestingModule({
      imports: [LockUserAccountModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { userName: 'Alex Rivera' } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LockUserAccountModalComponent);
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

    component.reasonControl.setValue('  Suspicious repeated logins  ');
    component.confirm();

    expect(closeSpy).toHaveBeenCalledWith('Suspicious repeated logins');
  });

  it('cancel() closes with undefined', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.cancel();

    expect(closeSpy).toHaveBeenCalledWith(undefined);
  });

  // Regression test for a real bug: this template's <form (ngSubmit)> has no
  // [formGroup] (reasonControl is a bare FormControl), so nothing provides
  // Angular's ngSubmit output without FormsModule imported alongside
  // ReactiveFormsModule — and Angular's strict template checking doesn't
  // catch a missing *event* binding the way it does a missing property one,
  // so this compiled fine while silently never firing. Calling confirm()
  // directly (every other test above) can't catch that, since it bypasses
  // the DOM entirely — only dispatching a real 'submit' event does.
  it('intercepts the native form submit (via NgForm) rather than letting the browser navigate', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');
    component.reasonControl.setValue('Suspicious repeated logins');

    const formEl: HTMLFormElement = fixture.nativeElement.querySelector('form');
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    formEl.dispatchEvent(submitEvent);

    expect(submitEvent.defaultPrevented).toBeTrue();
    expect(closeSpy).toHaveBeenCalledWith('Suspicious repeated logins');
  });
});
