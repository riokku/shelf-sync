import { ChangeDetectionStrategy, Component } from '@angular/core';

interface ConfettiPiece {
  id: number;
  left: number;
  color: string;
  delay: number;
  duration: number;
  drift: number;
  rotation: number;
}

/** A brief, full-viewport confetti burst for a genuine "just happened,
 *  right here" celebration moment — see each trigger site's own doc comment
 *  for why that particular moment qualifies (ConfettiService.burst() is the
 *  only thing that ever creates this; nothing renders it from a template
 *  directly, so there's no [selector] usage anywhere to grep for). Hand-
 *  rolled CSS particles falling from the top of the screen, same "no new
 *  runtime dependency" convention DonutChartComponent/RingStatComponent/
 *  TrendChartComponent/ReservationCalendarComponent already established for
 *  their own hand-rolled visuals — a one-off celebration doesn't need a
 *  whole confetti library. Colors cycle through the live theme's own tokens
 *  (same "themed, not hardcoded" convention those components already
 *  follow) so this recolors itself automatically under any THEME_PRESETS
 *  preset. The host itself is pointer-events: none (see the stylesheet) so
 *  this never blocks interaction with whatever's underneath while it plays. */
@Component({
  selector: 'app-confetti-burst',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confetti-burst.component.html',
  styleUrl: './confetti-burst.component.scss'
})
export class ConfettiBurstComponent {
  /** How long the longest-lived piece takes to finish falling and fading
   *  out — ConfettiService's own cleanup timer is set to this exact value,
   *  so the component is only ever torn down once every piece has actually
   *  finished animating. */
  static readonly DURATION_MS = 2600;

  private static readonly PIECE_COUNT = 70;

  /** Cycled by index rather than randomly picked — a handful of pieces
   *  right next to each other landing on the same color by chance would
   *  read as a gap in the mix; cycling guarantees every color shows up
   *  repeatedly and roughly evenly across the burst. */
  private static readonly COLOR_TOKENS = [
    'var(--mat-sys-primary)',
    'var(--mat-sys-tertiary)',
    'var(--mat-sys-secondary)',
    'var(--app-success-bg)',
    'var(--app-warning-bg)'
  ];

  readonly pieces: ConfettiPiece[] = Array.from({ length: ConfettiBurstComponent.PIECE_COUNT }, (_, index) => ({
    id: index,
    left: Math.random() * 100,
    color: ConfettiBurstComponent.COLOR_TOKENS[index % ConfettiBurstComponent.COLOR_TOKENS.length],
    delay: Math.random() * 400,
    duration: 1800 + Math.random() * 700,
    drift: Math.round((Math.random() - 0.5) * 200),
    rotation: Math.round(360 + Math.random() * 360)
  }));
}
