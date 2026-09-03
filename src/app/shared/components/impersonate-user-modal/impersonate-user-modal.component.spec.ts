import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { ImpersonateUserModalComponent } from './impersonate-user-modal.component';
import { createFakeMatDialogRef } from '../../../testing/fakes';

describe('ImpersonateUserModalComponent', () => {
  let component: ImpersonateUserModalComponent;
  let fixture: ComponentFixture<ImpersonateUserModalComponent>;
  let dialogRef: MatDialogRef<ImpersonateUserModalComponent, string>;

  async function setup() {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<ImpersonateUserModalComponent, string>;

    await TestBed.configureTestingModule({
      imports: [ImpersonateUserModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { userName: 'Alex Rivera', orgName: 'Studio Rio' } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ImpersonateUserModalComponent);
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

    component.reasonControl.setValue('  Customer reports missing inventory items  ');
    component.confirm();

    expect(closeSpy).toHaveBeenCalledWith('Customer reports missing inventory items');
  });

  it('cancel() closes with undefined', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.cancel();

    expect(closeSpy).toHaveBeenCalledWith(undefined);
  });

  // Regression test for the same class of bug LockUserAccountModalComponent's
  // own identical test guards against: this template's <form (ngSubmit)> has
  // no [formGroup] (reasonControl is a bare FormControl), so nothing
  // provides Angular's ngSubmit output without FormsModule imported
  // alongside ReactiveFormsModule — calling confirm() directly (every other
  // test above) can't catch that, since it bypasses the DOM entirely; only
  // dispatching a real 'submit' event does.
  it('intercepts the native form submit (via NgForm) rather than letting the browser navigate', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');
    component.reasonControl.setValue('Customer reports missing inventory items');

    const formEl: HTMLFormElement = fixture.nativeElement.querySelector('form');
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    formEl.dispatchEvent(submitEvent);

    expect(submitEvent.defaultPrevented).toBeTrue();
    expect(closeSpy).toHaveBeenCalledWith('Customer reports missing inventory items');
  });
});
