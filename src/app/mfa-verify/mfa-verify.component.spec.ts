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

  describe('recovery code ("lost your device") path', () => {
    it('toggleRecoveryForm() reveals the recovery-code field in place of the 6-digit one', async () => {
      await createComponent(createFakeMfaService({ isVerificationPending: true, factorIdToVerify: 'factor-1' }));

      expect(fixture.nativeElement.querySelector('input[inputmode="numeric"]')).not.toBeNull();

      component.toggleRecoveryForm();
      fixture.detectChanges();

      expect(component.showRecoveryForm).toBeTrue();
      expect(fixture.nativeElement.querySelector('input[inputmode="numeric"]')).toBeNull();
    });

    it('recoverWithCode() is a no-op with an empty code', async () => {
      const mfaService = createFakeMfaService({ isVerificationPending: true, factorIdToVerify: 'factor-1' });
      const redeemSpy = spyOn(mfaService, 'redeemRecoveryCode');
      await createComponent(mfaService);

      await component.recoverWithCode();

      expect(redeemSpy).not.toHaveBeenCalled();
    });

    it('signs out and lands on /login?mfaRecovered=1 once a code is redeemed', async () => {
      const mfaService = createFakeMfaService({
        isVerificationPending: true,
        factorIdToVerify: 'factor-1',
        redeemRecoveryCodeError: null
      });
      const redeemSpy = spyOn(mfaService, 'redeemRecoveryCode').and.callThrough();
      const authService = createFakeAuthService();
      const signOutSpy = spyOn(authService, 'signOut').and.callThrough();
      await TestBed.configureTestingModule({
        imports: [MfaVerifyComponent],
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: authService },
          { provide: MfaService, useValue: mfaService },
          { provide: ActivatedRoute, useValue: createFakeActivatedRoute() }
        ]
      }).compileComponents();
      const localFixture = TestBed.createComponent(MfaVerifyComponent);
      const navigateSpy = spyOn(TestBed.inject(Router), 'navigate');
      localFixture.detectChanges();
      await localFixture.whenStable();

      localFixture.componentInstance.recoveryCodeControl.setValue('a1b2-c3d4-e5f6-a7b8');
      await localFixture.componentInstance.recoverWithCode();

      expect(redeemSpy).toHaveBeenCalledWith('a1b2-c3d4-e5f6-a7b8');
      expect(signOutSpy).toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledWith(['/login'], { queryParams: { mfaRecovered: '1' } });
    });

    it('surfaces an invalid-code error without signing out', async () => {
      const mfaService = createFakeMfaService({
        isVerificationPending: true,
        factorIdToVerify: 'factor-1',
        redeemRecoveryCodeError: 'That recovery code is invalid or has already been used.'
      });
      const authService = createFakeAuthService();
      const signOutSpy = spyOn(authService, 'signOut');
      await TestBed.configureTestingModule({
        imports: [MfaVerifyComponent],
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: authService },
          { provide: MfaService, useValue: mfaService },
          { provide: ActivatedRoute, useValue: createFakeActivatedRoute() }
        ]
      }).compileComponents();
      const localFixture = TestBed.createComponent(MfaVerifyComponent);
      localFixture.detectChanges();
      await localFixture.whenStable();

      localFixture.componentInstance.recoveryCodeControl.setValue('bogus');
      await localFixture.componentInstance.recoverWithCode();

      expect(localFixture.componentInstance.recoveryError).toBe('That recovery code is invalid or has already been used.');
      expect(signOutSpy).not.toHaveBeenCalled();
    });
  });
});
