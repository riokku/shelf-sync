import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { RecoveryCodesModalComponent } from './recovery-codes-modal.component';
import { MfaService } from '../../../core/mfa.service';

describe('RecoveryCodesModalComponent', () => {
  let fixture: ComponentFixture<RecoveryCodesModalComponent>;
  let component: RecoveryCodesModalComponent;
  let mfaService: jasmine.SpyObj<MfaService>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<RecoveryCodesModalComponent>>;

  async function createComponent(result: { codes: string[] | null; error: string | null }) {
    mfaService = jasmine.createSpyObj('MfaService', ['generateRecoveryCodes']);
    mfaService.generateRecoveryCodes.and.returnValue(Promise.resolve(result));
    dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [RecoveryCodesModalComponent],
      providers: [
        { provide: MfaService, useValue: mfaService },
        { provide: MatDialogRef, useValue: dialogRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RecoveryCodesModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    // whenStable() only waits for ngOnInit's own async work to finish — it
    // doesn't itself re-render, so the DOM still reflects the pre-resolve
    // (loading) state until this second pass.
    fixture.detectChanges();
  }

  it('generates codes on init and lists them, dash-grouped for readability', async () => {
    await createComponent({ codes: ['a1b2c3d4e5f6a7b8'], error: null });

    expect(mfaService.generateRecoveryCodes).toHaveBeenCalled();
    expect(component.codes).toEqual(['a1b2c3d4e5f6a7b8']);
    expect(fixture.nativeElement.querySelector('.recovery-codes-list').textContent).toContain('a1b2-c3d4-e5f6-a7b8');
  });

  it('shows an error and no code list when generation fails', async () => {
    await createComponent({ codes: null, error: 'Could not generate recovery codes.' });

    expect(fixture.nativeElement.querySelector('.error-message').textContent).toContain('Could not generate recovery codes.');
    expect(fixture.nativeElement.querySelector('.recovery-codes-list')).toBeNull();
  });

  it('close() is a no-op until the "I\'ve saved these codes" checkbox is checked', async () => {
    await createComponent({ codes: ['a1b2c3d4e5f6a7b8'], error: null });

    component.close();
    expect(dialogRef.close).not.toHaveBeenCalled();

    component.confirmedSaved = true;
    component.close();
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('cancel() closes unconditionally, for the error-path Close button', async () => {
    await createComponent({ codes: null, error: 'nope' });

    component.cancel();

    expect(dialogRef.close).toHaveBeenCalled();
  });
});
