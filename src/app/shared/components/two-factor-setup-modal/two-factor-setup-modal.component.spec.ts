import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { TwoFactorSetupModalComponent } from './two-factor-setup-modal.component';
import { MfaService } from '../../../core/mfa.service';

// A real otpauth:// URI — QRCode.toDataURL() runs for real in these specs
// (no network, pure client-side canvas rendering), same convention
// QrLabelModalComponent's own spec already establishes for this library.
const SAMPLE_URI = 'otpauth://totp/ShelfSync:test%40example.com?secret=ABCDEFGHIJKLMNOP&issuer=ShelfSync';

describe('TwoFactorSetupModalComponent', () => {
  let fixture: ComponentFixture<TwoFactorSetupModalComponent>;
  let component: TwoFactorSetupModalComponent;
  let mfaService: jasmine.SpyObj<MfaService>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<TwoFactorSetupModalComponent>>;

  async function createComponent(
    enrollResult: { enrollment: { factorId: string; uri: string; secret: string } | null; error: string | null }
  ) {
    mfaService = jasmine.createSpyObj('MfaService', ['enrollTotp', 'confirmEnrollment']);
    mfaService.enrollTotp.and.returnValue(Promise.resolve(enrollResult));
    dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [TwoFactorSetupModalComponent],
      providers: [
        { provide: MfaService, useValue: mfaService },
        { provide: MatDialogRef, useValue: dialogRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TwoFactorSetupModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    // whenStable() only waits for ngOnInit's own async work to finish — it
    // doesn't itself re-render, so the DOM still reflects the pre-resolve
    // (loading) state until this second pass.
    fixture.detectChanges();
  }

  it('starts enrollment on init and shows the QR code plus manual secret once it resolves', async () => {
    await createComponent({
      enrollment: { factorId: 'factor-1', uri: SAMPLE_URI, secret: 'SECRET123' },
      error: null
    });

    expect(mfaService.enrollTotp).toHaveBeenCalled();
    expect(component.isLoading).toBeFalse();
    expect(component.enrollment?.factorId).toBe('factor-1');
    expect(component.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(fixture.nativeElement.querySelector('.manual-secret').textContent).toContain('SECRET123');
    const img: HTMLImageElement | null = fixture.nativeElement.querySelector('.qr-code');
    expect(img).not.toBeNull();
    expect(img?.src).toMatch(/^data:image\/png;base64,/);
  });

  it('shows an error and no form when enrollment itself fails', async () => {
    await createComponent({ enrollment: null, error: 'Could not start two-factor setup.' });

    expect(component.enrollment).toBeNull();
    expect(fixture.nativeElement.querySelector('.error-message').textContent).toContain('Could not start two-factor setup.');
    expect(fixture.nativeElement.querySelector('.qr-code')).toBeNull();
  });

  it('confirm() is a no-op with an invalid (non-6-digit) code', async () => {
    await createComponent({
      enrollment: { factorId: 'factor-1', uri: SAMPLE_URI, secret: 'SECRET' },
      error: null
    });

    component.codeControl.setValue('12');
    await component.confirm();

    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('confirm() calls confirmEnrollment() and closes with true on success', async () => {
    await createComponent({
      enrollment: { factorId: 'factor-1', uri: SAMPLE_URI, secret: 'SECRET' },
      error: null
    });
    mfaService.confirmEnrollment.and.returnValue(Promise.resolve(null));
    component.codeControl.setValue('123456');

    await component.confirm();

    expect(mfaService.confirmEnrollment).toHaveBeenCalledWith('factor-1', '123456');
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('confirm() surfaces an invalid-code error rather than closing', async () => {
    await createComponent({
      enrollment: { factorId: 'factor-1', uri: SAMPLE_URI, secret: 'SECRET' },
      error: null
    });
    mfaService.confirmEnrollment.and.returnValue(Promise.resolve('Invalid code.'));
    component.codeControl.setValue('123456');

    await component.confirm();

    expect(component.errorMessage).toBe('Invalid code.');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('cancel() closes with false', async () => {
    await createComponent({ enrollment: null, error: 'nope' });

    component.cancel();

    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });
});
