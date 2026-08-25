import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

/** Small "?" affordance for explaining a non-obvious field/toggle inline,
 *  without permanently occupying space the way a `<p class="empty-hint">`
 *  below the control would. Backed by `matTooltip` (already this app's
 *  established tooltip mechanism — see `HeaderComponent`'s bell/mode-toggle
 *  buttons) rather than a custom popover, so hover/focus/touch-and-hold
 *  behavior, positioning, and viewport-edge flipping all come for free.
 *
 *  A real `<button type="button">`, not a bare icon — keyboard-focusable
 *  (so the tooltip is reachable by Tab, not just by mouse hover) and
 *  `type="button"` specifically so dropping this into a `<form>` never
 *  accidentally submits it. `(click)="$event.stopPropagation()"` stops it
 *  from also triggering a parent row's own click handler on pages that
 *  place this inside a clickable row (e.g. a list item that opens a detail
 *  view on click). */
@Component({
  selector: 'app-help-tooltip',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './help-tooltip.component.html',
  styleUrl: './help-tooltip.component.scss',
})
export class HelpTooltipComponent {
  @Input({ required: true }) text = '';
}
