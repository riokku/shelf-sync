import { Component, Input, computed, signal } from '@angular/core';

export interface TrendPoint {
  label: string;
  value: number;
}

interface PlottedPoint extends TrendPoint {
  /** Percent from the left edge — evenly spaced across the series (a lone
   *  point centers itself at 50 rather than dividing by zero). */
  xPercent: number;
  /** Percent up from the bottom (matches DrawnBar.heightPercent's old
   *  "bigger value = taller" convention, so it composes directly with CSS
   *  `bottom: X%` the same way that used `height: X%`). Floored at 10, not
   *  0 — a zero-value point still sits visibly above the baseline rather
   *  than flush against it, the same "shouldn't read as a rendering bug"
   *  reasoning the old bar chart's own 4%-minimum height gave, just no
   *  longer needing an artificial minimum since a point (unlike a
   *  zero-height bar) is never actually invisible at 0. */
  bottomPercent: number;
  isCurrent: boolean;
}

/** A small hand-rolled line-chart sparkline — no charting library, same
 *  "plain SVG, no library" convention DonutChartComponent/RingStatComponent
 *  already establish (this replaced an earlier bar-sparkline version of
 *  this same component, itself modeled on ManageReportsComponent's own
 *  .bar-track/.bar-fill breakdown rows — a line reads more naturally as a
 *  *trend over time* than a row of independent bars does). Deliberately
 *  treated as a compact "stat tile trend" rather than a full analytical
 *  chart — no axis/gridlines, a soft gradient fill under the line for a bit
 *  of visual weight, and only the most recent point drawn as a visible dot
 *  (the point a viewer's eye should land on) — every other point stays
 *  individually hoverable (a native `title` per point, the same "exact
 *  value on hover without a custom tooltip" layer the old bar chart had)
 *  but invisible at rest, so the chart reads as line-plus-one-dot rather
 *  than a cluttered row of markers.
 *
 *  The connecting line/fill are drawn with a single SVG
 *  `viewBox="0 0 100 100"` + `preserveAspectRatio="none"` (so the chart
 *  always exactly fills whatever width/height its container gives it, the
 *  same "always fills its flex box" behavior the old height:X% bars had) —
 *  `vector-effect="non-scaling-stroke"` on the line keeps its stroke width
 *  a constant visual thickness under that non-uniform scaling. The per-
 *  point dots are deliberately plain HTML (position: absolute; left/bottom
 *  %), not SVG `<circle>`s, positioned by the same xPercent/bottomPercent
 *  math — an SVG circle's own radius would squash into an ellipse under
 *  the same non-uniform scaling the line's non-scaling-stroke fix doesn't
 *  cover (that fix only protects a shape's *stroke*, not a filled circle's
 *  underlying geometry), while a CSS border-radius circle is immune to it
 *  entirely since it's sized in real pixels, not viewBox units.
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
  // Distinguishes each instance's own <linearGradient> id — Studio renders
  // two of these side by side (see StudioComponent's own .studio-trends-row),
  // and an SVG gradient id has to be document-unique or the second
  // instance's <defs> would silently win and repaint the first's fill too.
  private static instanceCount = 0;
  readonly gradientId = `trend-chart-gradient-${TrendChartComponent.instanceCount++}`;

  private readonly _points = signal<TrendPoint[]>([]);
  @Input() set points(value: TrendPoint[]) {
    this._points.set(value ?? []);
  }

  /** Caller-formatted headline above the chart (e.g. "14 new orgs") — same
   *  "a string, not a raw number, since what it should say varies by
   *  caller" reasoning DonutChartComponent.centerLabel already documents. */
  @Input() totalLabel = '';
  @Input() colorToken = '--mat-sys-primary';

  readonly color = computed(() => `var(${this.colorToken})`);
  readonly hasData = computed(() => this._points().length > 0);
  /** A single point has nothing to draw a line/fill between — the template
   *  gates the <polyline>/<polygon> on this and still renders that one
   *  point's own dot regardless (see plottedPoints below). */
  readonly hasLine = computed(() => this._points().length > 1);

  readonly plottedPoints = computed<PlottedPoint[]>(() => {
    const points = this._points();
    const max = Math.max(1, ...points.map(point => point.value));
    const n = points.length;
    return points.map((point, i) => ({
      ...point,
      xPercent: n > 1 ? (i / (n - 1)) * 100 : 50,
      bottomPercent: 10 + (point.value / max) * 80,
      isCurrent: i === n - 1,
    }));
  });

  /** `x,y` pairs for the <polyline> — SVG y grows downward, so this flips
   *  bottomPercent (a "percent up from the bottom" value, matching the
   *  points above) into "percent down from the top". */
  readonly linePointsAttr = computed(() =>
    this.plottedPoints().map(point => `${point.xPercent},${100 - point.bottomPercent}`).join(' ')
  );

  /** Same coordinates as linePointsAttr, plus a leading/trailing vertex
   *  pinned to the baseline (y=100) so the <polygon> closes into a filled
   *  area under the line rather than just retracing the line itself. */
  readonly areaPointsAttr = computed(() => {
    const points = this.plottedPoints();
    if (points.length < 2) {
      return '';
    }
    const first = points[0];
    const last = points[points.length - 1];
    const coords = points.map(point => `${point.xPercent},${100 - point.bottomPercent}`).join(' ');
    return `${first.xPercent},100 ${coords} ${last.xPercent},100`;
  });
}
