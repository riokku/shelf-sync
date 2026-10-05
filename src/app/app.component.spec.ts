import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subject } from 'rxjs';
import { AppComponent } from './app.component';
import { AuthService } from './core/auth.service';
import { SiteSettingsService } from './core/site-settings.service';
import { createFakeAuthService } from './testing/fakes';

describe('AppComponent', () => {
  // A plain mutable object rather than provideRouter([]) — showChrome() only
  // ever reads router.url as a string, and driving that directly is simpler
  // and more deterministic than relying on real navigation against an empty
  // route config actually updating router.url as expected. `events` is a
  // real Subject (rather than e.g. rxjs' EMPTY) so the focus-management
  // tests below can drive real NavigationEnd events through it.
  const fakeRouter = { url: '/', events: new Subject<NavigationEnd>() };

  beforeEach(async () => {
    fakeRouter.url = '/';
    fakeRouter.events = new Subject<NavigationEnd>();

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

  it('hides header/footer chrome on the landing, login, and register paths, shows it elsewhere', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    fakeRouter.url = '/';
    expect(app.showChrome()).toBe(false);

    fakeRouter.url = '/login';
    expect(app.showChrome()).toBe(false);

    fakeRouter.url = '/register';
    expect(app.showChrome()).toBe(false);

    // Regression coverage for a real bug: showChrome() used to compare
    // router.url with strict equality, so a query string on /register
    // (e.g. an invite link) made chrome show up when it shouldn't have.
    fakeRouter.url = '/register?org=some-org';
    expect(app.showChrome()).toBe(false);

    fakeRouter.url = '/privacy';
    expect(app.showChrome()).toBe(false);

    fakeRouter.url = '/terms';
    expect(app.showChrome()).toBe(false);

    fakeRouter.url = '/pricing';
    expect(app.showChrome()).toBe(false);

    fakeRouter.url = '/home';
    expect(app.showChrome()).toBe(true);

    fakeRouter.url = '/inventory?item=abc-123';
    expect(app.showChrome()).toBe(true);
  });
});

describe('AppComponent route-change focus management', () => {
  const fakeRouter = { url: '/', events: new Subject<NavigationEnd>() };

  beforeEach(async () => {
    fakeRouter.url = '/';
    fakeRouter.events = new Subject<NavigationEnd>();

    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      imports: [RouterOutlet],
      providers: [
        { provide: Router, useValue: fakeRouter },
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SiteSettingsService, useValue: { load: async () => {} } }
      ]
    }).compileComponents();
  });

  /** Simulates the routed page having already rendered its own heading by
   *  the time NavigationEnd's deferred focus call goes looking for one —
   *  AppComponent's own template has no real routed content behind its
   *  bare <router-outlet>, so nothing renders a heading on its own here. */
  function createFixtureWithHeading(): { fixture: ComponentFixture<AppComponent>; heading: HTMLElement } {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const heading = document.createElement('h1');
    heading.textContent = 'Inventory';
    fixture.nativeElement.querySelector('#main-content')!.appendChild(heading);
    return { fixture, heading };
  }

  it('moves focus to the new page\'s real <h1> after a real navigation', fakeAsync(() => {
    const { heading } = createFixtureWithHeading();

    fakeRouter.events.next(new NavigationEnd(1, '/inventory', '/inventory'));
    tick();

    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
    // Suppresses the browser's default focus outline (see .route-focus-heading's
    // own styles.scss comment) — a sighted keyboard user can never actually
    // Tab onto a tabindex="-1" element, so a ring there would only ever be a
    // distracting side effect of this programmatic .focus() call.
    expect(heading.classList.contains('route-focus-heading')).toBe(true);
  }));

  it('falls back to a role="heading"/aria-level="1" element — PageHeaderComponent\'s own <h1> override — when there is no literal <h1>', fakeAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const heading = document.createElement('h2');
    heading.setAttribute('role', 'heading');
    heading.setAttribute('aria-level', '1');
    fixture.nativeElement.querySelector('#main-content')!.appendChild(heading);

    fakeRouter.events.next(new NavigationEnd(1, '/manage/suppliers', '/manage/suppliers'));
    tick();

    expect(document.activeElement).toBe(heading);
  }));

  it('does not re-focus the heading for a same-page, query-param-only navigation (a tab switch or deep link)', fakeAsync(() => {
    const { heading } = createFixtureWithHeading();

    fakeRouter.events.next(new NavigationEnd(1, '/manage/settings', '/manage/settings'));
    tick();
    expect(document.activeElement).toBe(heading); // sanity: the real navigation above did move focus

    const unrelatedButton = document.createElement('button');
    document.body.appendChild(unrelatedButton);
    unrelatedButton.focus();

    fakeRouter.events.next(new NavigationEnd(2, '/manage/settings?tab=workflow', '/manage/settings?tab=workflow'));
    tick();

    expect(document.activeElement).toBe(unrelatedButton);
    document.body.removeChild(unrelatedButton);
  }));

  it('ignores router events other than NavigationEnd', fakeAsync(() => {
    const { heading } = createFixtureWithHeading();

    fakeRouter.events.next({ id: 1 } as unknown as NavigationEnd);
    tick();

    expect(document.activeElement).not.toBe(heading);
  }));
});
