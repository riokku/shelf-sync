import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { MfaVerifyComponent } from './mfa-verify.component';
import { AuthService } from '../core/auth.service';
import { MfaService } from '../core/mfa.service';
import { createFakeActivatedRoute, createFakeAuthService, createFakeMfaService } from '../testing/fakes';

describe('MfaVerifyComponent', () => {
  let fixture: ComponentFixture<MfaVerifyComponent>;
  let component: MfaVerifyComponent;
  let navigateByUrlSpy: jasmine.Spy;

  async function createComponent(
    mfaService: MfaService,
    route: ActivatedRoute = createFakeActivatedRoute()
  ) {
    await TestBed.configureTestingModule({
      imports: [MfaVerifyComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: MfaService, useValue: mfaService },
        { provide: ActivatedRoute, useValue: route }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MfaVerifyComponent);
    component = fixture.componentInstance;
    navigateByUrlSpy = spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.detectChanges();
    await fixture.whenStable();
    // whenStable() only waits for ngOnInit's own async work to finish — it
    // doesn't itself re-render, so the DOM still reflects the pre-resolve
    // (loading) state until this second pass.
    fixture.detectChanges();
  }

  it('bounces straight to /home when nothing is actually pending (stale bookmark/back-button)', async () => {
    await createComponent(createFakeMfaService({ isVerificationPending: false }));

    expect(navigateByUrlSpy).toHaveBeenCalledWith('/home');
  });

  it('follows a same-app returnUrl when bouncing away with nothing pending', async () => {
    await createComponent(
      createFakeMfaService({ isVerificationPending: false }),
      createFakeActivatedRoute({ returnUrl: '/inventory?item=abc-123' })
    );

    expect(navigateByUrlSpy).toHaveBeenCalledWith('/inventory?item=abc-123');
  });

  it('shows the code form once a challenge is actually owed', async () => {
    await createComponent(createFakeMfaService({ isVerificationPending: true, factorIdToVerify: 'factor-1' }));

    expect(component.isLoading).toBeFalse();
    expect(component.factorId).toBe('factor-1');
    expect(fixture.nativeElement.querySelector('input[inputmode="numeric"]')).not.toBeNull();
  });

  it('shows an error state if no factor id could be resolved despite a pending challenge', async () => {
    await createComponent(createFakeMfaService({ isVerificationPending: true, factorIdToVerify: null }));

    expect(component.factorId).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Something went wrong');
  });

  it('confirm() verifies the code and navigates to /home on success', async () => {
    const mfaService = createFakeMfaService({ isVerificationPending: true, factorIdToVerify: 'factor-1' });
    spyOn(mfaService, 'verifyLogin').and.returnValue(Promise.resolve(null));
    await createComponent(mfaService);

    component.codeControl.setValue('123456');
    await component.confirm();

    expect(mfaService.verifyLogin).toHaveBeenCalledWith('factor-1', '123456');
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/home');
  });

  it('confirm() surfaces an invalid-code error and clears the field rather than navigating', async () => {
    const mfaService = createFakeMfaService({ isVerificationPending: true, factorIdToVerify: 'factor-1' });
    spyOn(mfaService, 'verifyLogin').and.returnValue(Promise.resolve('Invalid code.'));
    await createComponent(mfaService);

    component.codeControl.setValue('123456');
    await component.confirm();

    expect(component.errorMessage).toBe('Invalid code.');
    expect(component.codeControl.value).toBe('');
    expect(navigateByUrlSpy).not.toHaveBeenCalledWith('/home');
  });

  it('confirm() is a no-op with an invalid (non-6-digit) code', async () => {
    const mfaService = createFakeMfaService({ isVerificationPending: true, factorIdToVerify: 'factor-1' });
    const verifySpy = spyOn(mfaService, 'verifyLogin');
    await createComponent(mfaService);

    component.codeControl.setValue('12');
    await component.confirm();

    expect(verifySpy).not.toHaveBeenCalled();
  });
});
