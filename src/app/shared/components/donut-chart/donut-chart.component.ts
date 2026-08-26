import { Component, Input, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface DonutChartSlice {
  label: string;
  value: number;
}

interface DrawnSlice extends DonutChartSlice {
  color: string;
  /** SVG circle circumference math — see the component's own doc comment
   *  for why a donut is drawn as a stack of stroked circles rather than
   *  actual pie-wedge <path> arcs. */
  dashArray: string;
  dashOffset: number;
  percent: number;
}

// Reused per-slice, cycling if there are more slices than colors — built
// from the live theme's own tokens (same "recolors itself per-organization"
// convention every other themed visual in this app already follows, e.g.
// HeaderComponent's brand-online-count or the old Home hero glow) rather
// than fixed hex values, so a chart drawn under a different color preset
// picks up that preset's own palette automatically.
const SLICE_COLOR_TOKENS = [
  '--mat-sys-primary',
  '--mat-sys-tertiary',
  '--mat-sys-secondary',
  '--mat-sys-primary-container',
  '--mat-sys-tertiary-container',
  '--mat-sys-secondary-container',
];

/** A small hand-rolled donut chart — no charting library: this app has no
 *  existing charting dependency, and a handful of slices doesn't need one.
 *  Drawn as a stack of concentric-radius `<circle>` elements, each given a
 *  `stroke-dasharray` covering just its own share of the circle's
 *  circumference and a `stroke-dashoffset` that picks up where the
 *  previous slice's arc ended — the standard "fake a pie wedge with a
 *  stroked circle" SVG technique, simpler and more robust than computing
 *  real `<path>` arc commands for the same visual result. All circles
 *  share one `transform: rotate(-90deg)` (via the shared `.donut-svg`
 *  rule) so the first slice starts at 12 o'clock instead of the default
 *  3 o'clock a plain stroked circle would start from.
 *
 *  Caller passes plain `{label, value}` slices (already sorted/limited
 *  the way it wants — this component doesn't re-sort or cap the input);
 *  color assignment and the legend are both owned here so every consumer
 *  gets the same palette-cycling and legend layout for free. */
@Component({
  selector: 'app-donut-chart',
  imports: [DecimalPipe],
  templateUrl: './donut-chart.component.html',
  styleUrl: './donut-chart.component.scss',
})
export class DonutChartComponent {
  private readonly _slices = signal<DonutChartSlice[]>([]);
  @Input() set data(value: DonutChartSlice[]) {
    this._slices.set(value ?? []);
  }

  /** Center label — a caller-formatted string (e.g. already run through
   *  CurrencyPipe) rather than a raw number, since what the center of the
   *  donut should actually say (a total, a count, "N items") varies by
   *  caller and this component has no business assuming which. */
  @Input() centerLabel = '';
  @Input() centerSublabel = '';

  private static readonly RADIUS = 15.9155; // makes the circumference exactly 100 — % values map to path length 1:1

  readonly slices = computed<DrawnSlice[]>(() => {
    const raw = this._slices();
    const total = raw.reduce((sum, slice) => sum + slice.value, 0);
    if (total <= 0) {
      return [];
    }

    let offset = 0;
    return raw.map((slice, i) => {
      const percent = (slice.value / total) * 100;
      const drawn: DrawnSlice = {
        ...slice,
        color: `var(${SLICE_COLOR_TOKENS[i % SLICE_COLOR_TOKENS.length]})`,
        dashArray: `${percent} ${100 - percent}`,
        dashOffset: -offset,
        percent,
      };
      offset += percent;
      return drawn;
    });
  });

  readonly hasData = computed(() => this.slices().length > 0);
}
