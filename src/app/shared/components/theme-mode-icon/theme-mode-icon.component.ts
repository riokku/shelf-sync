import { Component, Input } from '@angular/core';
import { ThemeMode } from '../../../core/theme-mode.service';

let nextInstanceId = 0;

/** Sun-to-moon morph icon backing HeaderComponent's own light/dark toggle button — a small
 *  hand-rolled SVG (no library, same "no new runtime dependency" convention DonutChart/RingStat/
 *  TrendChart/etc. already established) in place of that button's old instant swap between two
 *  unrelated Material icon glyphs.
 *
 *  The moon's crescent is the classic two-circle mask trick: a second, invisible "cutout" circle
 *  slides over the icon's own body circle through an SVG `<mask>` — far away and shrunk in light
 *  mode (no overlap, so the body renders as a full disc = sun), close and full-size in dark mode
 *  (overlaps enough to bite a crescent out of the body = moon). The eight rays fade and shrink
 *  toward the center at the same time. Driven entirely by a `.is-dark` class swap plus CSS
 *  `transform`/`opacity` transitions (universally animatable, unlike animating raw `cx`/`r`
 *  attributes directly) — nothing here is Angular-bound beyond the one `mode` input, so there's no
 *  JS-driven animation loop to worry about zone/testing side effects for.
 *
 *  Every mask needs its own unique id (a plain instance counter, not Math.random() — this only
 *  ever needs to be unique *within one page load*, not globally) since two `<mask id="...">`
 *  elements sharing an id would silently collide if this icon were ever rendered twice on the
 *  same page — not true today (HeaderComponent's own toggle is the only usage), but cheap to
 *  guard against up front the way DonutChartComponent/RingStatComponent's own single-instance
 *  usage never needed to. */
@Component({
  selector: 'app-theme-mode-icon',
  templateUrl: './theme-mode-icon.component.html',
  styleUrl: './theme-mode-icon.component.scss',
})
export class ThemeModeIconComponent {
  @Input() mode: ThemeMode = 'dark';

  readonly maskId = `theme-mode-icon-mask-${++nextInstanceId}`;

  /** Eight rays, evenly spaced — each just a static rotation of the same short rounded rect
   *  around the icon's own center; the fade/shrink animation applies to the whole group at once,
   *  not per-ray. */
  readonly rayAngles = [0, 45, 90, 135, 180, 225, 270, 315];
}
