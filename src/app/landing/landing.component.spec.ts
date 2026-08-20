import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { LandingComponent } from './landing.component';
import { AuthService } from '../core/auth.service';
import { createFakeAuthService, createFakeProfile } from '../testing/fakes';

describe('LandingComponent', () => {
  let component: LandingComponent;
  let fixture: ComponentFixture<LandingComponent>;
  let authService: AuthService;

  function setup(profile: ReturnType<typeof createFakeProfile> | null = null) {
    authService = createFakeAuthService(profile);

    TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService }
      ]
    });

    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', () => {
    setup();
    expect(component).toBeTruthy();
  });

  // Scoped to .landing-nav-actions specifically — the hero CTAs further
  // down the page always show "Get started free"/"Log in" regardless of
  // session (see LandingComponent's own doc comment), so asserting against
  // the whole page's text would false-negative on the signed-in case.
  function navText(): string {
    return (fixture.nativeElement as HTMLElement).querySelector('.landing-nav-actions')?.textContent ?? '';
  }

  it('shows the signed-out nav (Pricing/Log in/Sign up) when there is no session', () => {
    setup();
    const nav = navText();
    expect(nav).toContain('Log in');
    expect(nav).toContain('Get started free');
    expect(nav).not.toContain('Dashboard');
  });

  it('shows the signed-in nav (Dashboard/Logout) when a session exists', () => {
    setup(createFakeProfile());
    const nav = navText();
    expect(nav).toContain('Dashboard');
    expect(nav).toContain('Logout');
    expect(nav).not.toContain('Log in');
  });

  it('logout() signs out and navigates back to the landing page', async () => {
    setup(createFakeProfile());
    const signOutSpy = spyOn(authService, 'signOut').and.returnValue(Promise.resolve());
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate');

    await component.logout();

    expect(signOutSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });
});
