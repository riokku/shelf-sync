import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Shared "nothing here" treatment — icon + message, with an optional
 *  action (e.g. "Clear filters") passed in via content projection so this
 *  stays agnostic of what that action actually does. Extracted from the
 *  filtered-to-zero state on the Inventory page, which was the one place
 *  in the app that already got this right; every other empty list was a
 *  bare, easy-to-miss line of text.
 *
 *  `compact` swaps the centered icon-on-top layout for a smaller inline
 *  one, for empty states nested inside an otherwise-populated page (e.g. a
 *  "Completed" section with nothing in it yet) rather than a whole page/tab
 *  having nothing to show.
 *
 *  `variant: 'error'` reuses this same icon-plus-message-plus-projected-
 *  action shape for a failed data load (a "Retry" button projected in,
 *  rather than "Clear filters") instead of introducing a second, near-
 *  identical component — the only difference is tone: the icon/text pick up
 *  `--app-error-text` (the same token this app's inline `.error-message`
 *  already uses) instead of the neutral muted color, so a load failure
 *  reads as a problem rather than as an ordinary "nothing here yet". See
 *  each page's own `loadError` field for where this gets used. */
@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  @Input() icon = 'info';
  @Input() message = '';
  @Input() compact = false;
  @Input() variant: 'neutral' | 'error' = 'neutral';
}
