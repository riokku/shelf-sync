import { Component, Input, computed, signal } from '@angular/core';

/** A circular percentage gauge — the same "stroked circle with a partial
 *  dasharray" technique DonutChartComponent uses for its own slices, just
 *  a single arc against a full track instead of several arcs stacked
 *  together. Used for a headline percentage stat (e.g. task completion
 *  rate) where a plain "72%" text tile reads flatter than a gauge that
 *  visually fills in proportional to the number. */
@Component({
  selector: 'app-ring-stat',
  templateUrl: './ring-stat.component.html',
  styleUrl: './ring-stat.component.scss',
})
export class RingStatComponent {
  private readonly _percent = signal(0);
  @Input() set percent(value: number) {
    this._percent.set(Math.max(0, Math.min(100, value)));
  }

  @Input() label = '';
  @Input() colorToken = '--mat-sys-primary';

  readonly clampedPercent = computed(() => this._percent());
  readonly dashArray = computed(() => `${this.clampedPercent()} ${100 - this.clampedPercent()}`);
}
