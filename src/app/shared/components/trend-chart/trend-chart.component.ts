import { Component, Input, computed, signal } from '@angular/core';

export interface TrendPoint {
  label: string;
  value: number;
}

interface DrawnBar extends TrendPoint {
  heightPercent: number;
  isCurrent: boolean;
}

/** A small hand-rolled bar sparkline — no charting library, same "plain CSS
 *  bars, no library" convention ManageReportsComponent's own
 *  .bar-track/.bar-fill breakdown rows already established (a vertical
 *  variant of the same idea, rather than yet another SVG arc technique like
 *  DonutChartComponent/RingStatComponent). Deliberately treated as a
 *  compact "stat tile trend" rather than a full analytical chart — no
 *  axis/gridlines, a single theme-token hue de-emphasized (lower opacity)
 *  on every bar except the most recent one, which is the point a viewer's
 *  eye should land on. A plain `title` attribute per bar is the hover
 *  layer (an exact value on hover) without building a custom tooltip.
 *
 *  Caller passes already-bucketed `points` (see shared/utils/trend-buckets.ts) —
 *  this component doesn't bucket or sort its own input, same "caller
 *  decides the data, this just draws it" division DonutChartComponent
 *  already uses for its own slices. */
@Component({
  selector: 'app-trend-chart',
  templateUrl: './trend-chart.component.html',
  styleUrl: './trend-chart.component.scss',
})
export class TrendChartComponent {
  private readonly _points = signal<TrendPoint[]>([]);
  @Input() set points(value: TrendPoint[]) {
    this._points.set(value ?? []);
  }

  /** Caller-formatted headline above the bars (e.g. "14 new orgs") — same
   *  "a string, not a raw number, since what it should say varies by
   *  caller" reasoning DonutChartComponent.centerLabel already documents. */
  @Input() totalLabel = '';
  @Input() colorToken = '--mat-sys-primary';

  readonly color = computed(() => `var(${this.colorToken})`);
  readonly hasData = computed(() => this._points().length > 0);

  readonly bars = computed<DrawnBar[]>(() => {
    const points = this._points();
    const max = Math.max(1, ...points.map(point => point.value));
    return points.map((point, i) => ({
      ...point,
      // A zero-value week still renders a small visible nub rather than
      // vanishing entirely — an empty bar reading as "no data" would be
      // indistinguishable from a rendering bug.
      heightPercent: Math.max(4, (point.value / max) * 100),
      isCurrent: i === points.length - 1,
    }));
  });
}
