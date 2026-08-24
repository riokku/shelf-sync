import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TurnstileWidgetComponent } from './turnstile-widget.component';
import { environment } from '../../../../environments/environment';

describe('TurnstileWidgetComponent', () => {
  let component: TurnstileWidgetComponent;
  let fixture: ComponentFixture<TurnstileWidgetComponent>;
  let renderSpy: jasmine.Spy;
  let resetSpy: jasmine.Spy;
  let removeSpy: jasmine.Spy;
  let capturedOptions: {
    sitekey: string;
    callback: (token: string) => void;
    'expired-callback'?: () => void;
    'error-callback'?: () => void;
  };

  beforeEach(async () => {
    // Faked before the component ever mounts, so ngOnInit's loadTurnstile()
    // short-circuits on `window.turnstile` already being set rather than
    // appending a real <script> tag and making a live network request —
    // see the component's own doc comment on why this check is fresh every
    // call rather than a one-time cached check.
    renderSpy = jasmine.createSpy('render').and.callFake((_container: HTMLElement, options: typeof capturedOptions) => {
      capturedOptions = options;
      return 'widget-1';
    });
    resetSpy = jasmine.createSpy('reset');
    removeSpy = jasmine.createSpy('remove');
    window.turnstile = { render: renderSpy, reset: resetSpy, remove: removeSpy };

    await TestBed.configureTestingModule({
      imports: [TurnstileWidgetComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TurnstileWidgetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    // Cleans up the shared global so an earlier spec's fake can't leak into
    // a later, unrelated spec file run in the same browser tab.
    delete window.turnstile;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the widget against its own container with the configured site key', () => {
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy.calls.mostRecent().args[0]).toBeInstanceOf(HTMLElement);
    expect(capturedOptions.sitekey).toBe(environment.turnstileSiteKey);
  });

  it('emits verified with the token once Turnstile calls its callback', () => {
    const verifiedSpy = jasmine.createSpy('verified');
    component.verified.subscribe(verifiedSpy);

    capturedOptions.callback('a-real-token');

    expect(verifiedSpy).toHaveBeenCalledWith('a-real-token');
  });

  it('emits cleared when Turnstile reports the token expired', () => {
    const clearedSpy = jasmine.createSpy('cleared');
    component.cleared.subscribe(clearedSpy);

    capturedOptions['expired-callback']!();

    expect(clearedSpy).toHaveBeenCalled();
  });

  it('emits cleared when Turnstile reports an error', () => {
    const clearedSpy = jasmine.createSpy('cleared');
    component.cleared.subscribe(clearedSpy);

    capturedOptions['error-callback']!();

    expect(clearedSpy).toHaveBeenCalled();
  });

  it('reset() asks Turnstile to reset this specific widget instance', () => {
    component.reset();
    expect(resetSpy).toHaveBeenCalledWith('widget-1');
  });

  it('reset() is a no-op if the widget never finished rendering', () => {
    delete window.turnstile;
    const freshFixture = TestBed.createComponent(TurnstileWidgetComponent);
    // Never ran ngOnInit/detectChanges, so widgetId is still null.
    expect(() => freshFixture.componentInstance.reset()).not.toThrow();
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('removes the widget instance on destroy', () => {
    fixture.destroy();
    expect(removeSpy).toHaveBeenCalledWith('widget-1');
  });
});
