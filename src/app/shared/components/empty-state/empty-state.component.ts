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
 *  having nothing to show. */
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
}
