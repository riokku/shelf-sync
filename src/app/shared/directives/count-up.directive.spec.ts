import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CountUpDirective } from './count-up.directive';
import { countUpCurrency, countUpNumber } from '../utils/count-up-format';

// Deliberately doesn't test the animated-rAF path itself (mid-animation
// frames, or ticking through to the eventual settled value) — the directive
// schedules its loop against real performance.now(), which fakeAsync's
// tick() never advances, so trying to drive it through fake time would
// either spin indefinitely inside tick() or depend on incidental real wall-
// clock jitter between flushed frames. Every branch that's actually
// deterministic (null, reduced-motion, an unchanged value, formatting) is
// covered directly instead — see LoadingCaptionComponent's own spec for the
// same spyOn(window, 'matchMedia') convention used below.
@Component({
  template: `<span class="value" [appCountUp]="value" [countUpFormat]="format"></span>`,
  imports: [CountUpDirective],
})
class HostComponent {
  value: number | null = null;
  format: (n: number) => string = countUpNumber;
}

describe('CountUpDirective', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
  });

  function valueText(): string | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.value')?.textContent ?? null;
  }

  it('renders an em dash immediately for a null value', () => {
    fixture.componentInstance.value = null;
    fixture.detectChanges();

    expect(valueText()).toBe('—');
  });

  it('renders straight to the final formatted value, no animation, under prefers-reduced-motion', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    fixture.componentInstance.value = 1234;
    fixture.detectChanges();

    expect(valueText()).toBe('1,234');
  });

  it('applies whatever countUpFormat it is given', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    fixture.componentInstance.format = countUpCurrency;
    fixture.componentInstance.value = 42;
    fixture.detectChanges();

    expect(valueText()).toBe('$42.00');
  });

  it('renders immediately when the new value is already what is displayed, regardless of motion preference', () => {
    fixture.componentInstance.value = 0;
    fixture.detectChanges();

    expect(valueText()).toBe('0');
  });

  it('switches back to an em dash if a later value is null', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    fixture.componentInstance.value = 10;
    fixture.detectChanges();
    fixture.componentInstance.value = null;
    fixture.detectChanges();

    expect(valueText()).toBe('—');
  });
});
