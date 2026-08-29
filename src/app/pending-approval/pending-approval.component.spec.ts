import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { PendingApprovalComponent } from './pending-approval.component';
import { AuthService, Profile } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { createFakeAuthService, createFakeProfile, createFakeSupabaseService } from '../testing/fakes';

describe('PendingApprovalComponent', () => {
  let component: PendingApprovalComponent;
  let fixture: ComponentFixture<PendingApprovalComponent>;

  // beforeCreate runs after configureTestingModule/compileComponents but
  // before createComponent (which is what actually triggers ngOnInit via
  // detectChanges below) — the one hook point a test can still call
  // TestBed.inject(...) from itself (e.g. to install a spy ngOnInit's own
  // navigate() call needs to already be in place before it runs) without
  // hitting "Cannot configure the test module when the test module has
  // already been instantiated".
  async function setup(
    options: { profile?: Profile | null; organizationName?: string | null } = {},
    beforeCreate?: () => void
  ) {
    await TestBed.configureTestingModule({
      imports: [PendingApprovalComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(options.profile ?? null) },
        {
          provide: SupabaseService,
          useValue: createFakeSupabaseService({ data: { name: options.organizationName ?? null }, error: null })
        }
      ]
    }).compileComponents();

    beforeCreate?.();

    fixture = TestBed.createComponent(PendingApprovalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('shows the "couldn\'t find your account" state when there is no profile at all (denied/removed)', async () => {
    await setup({ profile: null });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("We couldn't find your account");
  });

  it('shows the awaiting-approval state with the org name for a pending profile', async () => {
    await setup({
      profile: createFakeProfile({ membership_status: 'pending' }),
      organizationName: 'Acme Events'
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Awaiting approval');
    expect(fixture.nativeElement.textContent).toContain('Acme Events');
  });

  it('redirects to /home for an already-approved profile (stale bookmark/back-button case)', async () => {
    let navigateSpy!: jasmine.Spy;

    await setup({ profile: createFakeProfile({ membership_status: 'approved' }) }, () => {
      navigateSpy = spyOn(TestBed.inject(Router), 'navigate');
    });

    expect(navigateSpy).toHaveBeenCalledWith(['/home']);
  });

  it('shows the account-locked state (not the pending state, and does not redirect home) for a locked-but-approved profile', async () => {
    let navigateSpy!: jasmine.Spy;

    await setup(
      {
        profile: createFakeProfile({ membership_status: 'approved', account_locked_at: '2026-01-01T00:00:00.000Z' }),
        organizationName: 'Acme Events'
      },
      () => {
        navigateSpy = spyOn(TestBed.inject(Router), 'navigate');
      }
    );
    fixture.detectChanges();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(component.isLocked).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Account locked');
    expect(fixture.nativeElement.textContent).toContain('Acme Events');
    expect(fixture.nativeElement.textContent).not.toContain('Awaiting approval');
  });

  describe('logout()', () => {
    it('signs out and navigates to /', async () => {
      await setup({ profile: null });
      const authService = TestBed.inject(AuthService);
      const signOutSpy = spyOn(authService, 'signOut').and.resolveTo();
      const navigateSpy = spyOn(TestBed.inject(Router), 'navigate');

      await component.logout();

      expect(signOutSpy).toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledWith(['/']);
    });
  });
});
