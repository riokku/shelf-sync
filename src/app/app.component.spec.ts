import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthService } from './core/auth.service';
import { SiteSettingsService } from './core/site-settings.service';
import { createFakeAuthService } from './testing/fakes';

describe('AppComponent', () => {
  // A plain mutable object rather than provideRouter([]) — showChrome() only
  // ever reads router.url as a string, and driving that directly is simpler
  // and more deterministic than relying on real navigation against an empty
  // route config actually updating router.url as expected.
  const fakeRouter = { url: '/' };

  beforeEach(async () => {
    fakeRouter.url = '/';

    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      imports: [RouterOutlet],
      providers: [
        { provide: Router, useValue: fakeRouter },
        { provide: AuthService, useValue: createFakeAuthService() },
        // Real SiteSettingsService.load() queries Supabase — AppComponent's
        // constructor effect() calls it as soon as authService.profile()
        // is read, so this needs stubbing too or every test here would hit
        // the live hosted project.
        { provide: SiteSettingsService, useValue: { load: async () => {} } }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('has the ShelfSync title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.title).toEqual('ShelfSync');
  });

  it('hides header/footer chrome on the login and register paths, shows it elsewhere', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    fakeRouter.url = '/';
    expect(app.showChrome()).toBe(false);

    fakeRouter.url = '/register';
    expect(app.showChrome()).toBe(false);

    // Regression coverage for a real bug: showChrome() used to compare
    // router.url with strict equality, so a query string on /register
    // (e.g. an invite link) made chrome show up when it shouldn't have.
    fakeRouter.url = '/register?org=some-org';
    expect(app.showChrome()).toBe(false);

    fakeRouter.url = '/home';
    expect(app.showChrome()).toBe(true);

    fakeRouter.url = '/inventory?item=abc-123';
    expect(app.showChrome()).toBe(true);
  });
});
