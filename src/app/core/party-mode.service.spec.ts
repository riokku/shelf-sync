import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PartyModeService } from './party-mode.service';
import { SiteSettingsService } from './site-settings.service';
import { ConfettiService } from './confetti.service';

describe('PartyModeService', () => {
  let service: PartyModeService;
  let siteSettings: SiteSettingsService;
  let confettiBurstSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PartyModeService);
    siteSettings = TestBed.inject(SiteSettingsService);
    // A plain spy, not .and.callThrough() — the real ConfettiService creates
    // a DOM component with its own DURATION_MS cleanup setTimeout, which
    // this test would otherwise need to separately tick() through on every
    // one of party mode's own repeated bursts just to keep fakeAsync's
    // "no pending timers left" check happy. Whether party mode calls
    // burst() the right number of times, at the right moments, is what
    // these tests actually care about — not confetti's own rendering.
    confettiBurstSpy = spyOn(TestBed.inject(ConfettiService), 'burst');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('swaps in the party theme and fires an immediate confetti burst', fakeAsync(() => {
    service.start();

    expect(document.documentElement.getAttribute('data-theme')).toBe('party');
    expect(confettiBurstSpy).toHaveBeenCalledTimes(1);

    // start()'s own setInterval/setTimeout are real timers — every test in
    // this file has to run them to completion (fakeAsync + tick, not just
    // asserting the synchronous effects above and returning) or they leak
    // into whatever test in this Karma session happens to run next and
    // fire for real, potentially well after that test's own TestBed
    // environment has already been torn down. Caught exactly that way: an
    // earlier version of this test returned right after the assertions
    // above with no fakeAsync wrapper, and a later, unrelated spec file
    // failed with "Injector has already been destroyed" once this file's
    // own leftover 8s timeout finally fired mid-suite.
    tick(8000);
  }));

  it('fires repeated bursts while active, then reverts to the org\'s real theme', fakeAsync(() => {
    // SiteSettingsService.theme is the source-of-truth signal start() reads
    // to know what to revert to — reached into directly (no public setter
    // besides the network-backed load()/updateTheme()), same "cast to a
    // private field when there's no other way to substitute behavior"
    // convention this app's other specs already establish.
    (siteSettings as unknown as { _theme: { set: (value: string) => void } })._theme.set('violet');

    service.start();
    tick(1400 * 3); // a few interval bursts land well before the 8s duration ends

    expect(confettiBurstSpy.calls.count()).toBeGreaterThan(1);
    expect(document.documentElement.getAttribute('data-theme')).toBe('party');

    tick(8000); // run out the remaining duration

    expect(document.documentElement.getAttribute('data-theme')).toBe('violet');
  }));

  it('reverts to no [data-theme] attribute when the org theme is the default', fakeAsync(() => {
    service.start();

    tick(8000);

    expect(document.documentElement.hasAttribute('data-theme')).toBeFalse();
  }));

  it('ignores a second start() call while already active, rather than restacking timers', fakeAsync(() => {
    (siteSettings as unknown as { _theme: { set: (value: string) => void } })._theme.set('violet');

    service.start();
    service.start();

    expect(confettiBurstSpy).toHaveBeenCalledTimes(1);

    tick(8000);

    expect(document.documentElement.getAttribute('data-theme')).toBe('violet');
  }));
});
