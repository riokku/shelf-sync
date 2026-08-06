import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';

import { LoginComponent } from './login.component';
import { AuthService } from '../core/auth.service';
import { createFakeActivatedRoute, createFakeAuthService } from '../testing/fakes';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

/** Covers the returnUrl handling added alongside authGuard's redirect (see
 *  auth.guard.ts) — in particular that the open-redirect guard actually
 *  blocks a protocol-relative returnUrl, since that's the one case where
 *  getting this wrong would be a real security bug, not just a UX papercut. */
describe('LoginComponent post-login redirect', () => {
  async function attemptLoginWithReturnUrl(returnUrl: string | null): Promise<jasmine.Spy> {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute(returnUrl ? { returnUrl } : {}) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigateByUrl');

    component.form.setValue({ email: 'test@example.com', password: 'password123' });
    await component.attemptLogin();

    return navigateSpy;
  }

  it('goes to /home when there is no returnUrl', async () => {
    const navigateSpy = await attemptLoginWithReturnUrl(null);
    expect(navigateSpy).toHaveBeenCalledWith('/home');
  });

  it('follows a same-app returnUrl (e.g. a deep link that bounced through login)', async () => {
    const navigateSpy = await attemptLoginWithReturnUrl('/inventory?item=abc-123');
    expect(navigateSpy).toHaveBeenCalledWith('/inventory?item=abc-123');
  });

  it('ignores a protocol-relative returnUrl rather than treating it as safe', async () => {
    const navigateSpy = await attemptLoginWithReturnUrl('//evil.example.com');
    expect(navigateSpy).toHaveBeenCalledWith('/home');
  });
});
