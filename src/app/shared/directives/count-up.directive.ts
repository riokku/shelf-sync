import { Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { countUpNumber } from '../utils/count-up-format';

/** Animates a stat tile counting up (or down) from its previously-rendered value to a new one,
 *  rather than the number just popping in — a small "fun design tweak" pass over the plain
 *  `.stat-value`/`.page-hero-pulse-value` tiles on Reports/Studio's own hero. Writes straight to
 *  the host element's `textContent` via ElementRef rather than through an Angular binding, so it
 *  never touches anything change-detection-bound — the underlying component property this reads
 *  from (`totalOrgCount`, `totalValue`, etc.) is completely unaffected either way, which is what
 *  every existing spec for these pages already asserts against; this is a purely decorative
 *  overlay on top, not a replacement.
 *
 *  Pass `null` to render an em dash immediately with no animation (e.g. a failed load) — matches
 *  the `loadError ? '—' : someCount` ternary these tiles already used before this existed.
 *
 *  Deliberately `OnChanges`, not a plain `@Input() set value()` — a caller binds both
 *  `[appCountUp]="value"` and `[countUpFormat]="someFormatter"` on the same element, and Angular
 *  applies bound inputs to a directive in the *template's own attribute order*, not by property
 *  declaration order in this class; a `value` setter that reads `this.countUpFormat` synchronously
 *  could fire before `countUpFormat` itself had been assigned for that change-detection pass,
 *  silently formatting with the *previous* function for one render (caught exactly this way, via
 *  this directive's own spec). `ngOnChanges` runs once per change-detection pass, after every
 *  `@Input()` on the directive has already been assigned regardless of binding order, so reading
 *  `this.countUpFormat` inside it is always the value the caller actually bound this same pass.
 *
 *  The rAF loop runs via `NgZone.runOutsideAngular()` and never re-enters — same reasoning
 *  LoadingCaptionComponent/PartyModeService already establish for their own timers, just doubly
 *  true here since a naive in-zone rAF would trigger a full app-wide change-detection pass on
 *  every animation frame for a value nothing else is bound to. Skips straight to the formatted
 *  final value under prefers-reduced-motion, same as every other ambient animation in this app. */
@Directive({
  selector: '[appCountUp]',
})
export class CountUpDirective implements OnChanges, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly ngZone = inject(NgZone);

  private displayedValue: number | null = null;
  private rafId: number | null = null;

  @Input('appCountUp') value: number | null | undefined = null;

  /** How to render each intermediate (and the final) value — defaults to a plain grouped integer,
   *  matching `| number` with no digitsInfo. Pass e.g. `countUpCurrency` from
   *  shared/utils/count-up-format.ts for a tile that would otherwise use `| currency`. */
  @Input() countUpFormat: (n: number) => string = countUpNumber;

  @Input() countUpDurationMs = 700;

  ngOnChanges(changes: SimpleChanges): void {
    if (!('value' in changes)) {
      return;
    }

    const target = this.value;
    if (target === null || target === undefined || Number.isNaN(target)) {
      this.cancelAnimation();
      this.displayedValue = null;
      this.el.nativeElement.textContent = '—';
      return;
    }

    const from = this.displayedValue ?? 0;
    if (from === target || prefersReducedMotion()) {
      this.cancelAnimation();
      this.render(target);
      return;
    }

    this.animate(from, target);
  }

  ngOnDestroy(): void {
    this.cancelAnimation();
  }

  private animate(from: number, to: number): void {
    this.cancelAnimation();
    const start = performance.now();
    const duration = this.countUpDurationMs;

    this.ngZone.runOutsideAngular(() => {
      const step = (now: number) => {
        const t = duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic — quick start, gentle settle
        this.render(from + (to - from) * eased);
        this.rafId = t < 1 ? requestAnimationFrame(step) : null;
      };
      this.rafId = requestAnimationFrame(step);
    });
  }

  private render(value: number): void {
    this.displayedValue = value;
    this.el.nativeElement.textContent = this.countUpFormat(value);
  }

  private cancelAnimation(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
