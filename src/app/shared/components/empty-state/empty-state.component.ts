import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** A small pool of genuinely meaningless one-liners — deliberately generic
 *  rather than tied to whatever's actually empty (this component has no
 *  idea what kind of list it's standing in for), so `playful` can drop one
 *  in under *any* caller's own specific `message` without it ever reading
 *  as though it's describing that particular list. */
const PLAYFUL_LINES = [
  'Nothing to see here. Literally.',
  'Crickets. 🦗',
  'So... quiet.',
  'Tumbleweeds only.',
  'This space intentionally left blank (for now).',
  'The shelf is bare and the silence is deafening.',
];

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
 *  each page's own `loadError` field for where this gets used.
 *
 *  `playful` adds one random line from PLAYFUL_LINES above *underneath* the
 *  caller's own `message` — never replacing it, since `message` is the
 *  thing that actually tells a visitor what's missing (see e.g. Inventory's
 *  own "No inventory items yet."), and swapping it out for a joke would
 *  lose that information. Ignored outright on an `error`/`compact` empty
 *  state — a failed load isn't the moment for a joke, and a compact,
 *  inline empty state has no room for a second line. Picked once per
 *  render (an empty state mounts once and stays, nothing re-triggers this),
 *  and deliberately not wired up everywhere this component is used — same
 *  "started narrow on the busiest couple of pages" precedent
 *  LoadingCaptionComponent's own doc comment gives for itself. */
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
  @Input() playful = false;

  readonly playfulLine = PLAYFUL_LINES[Math.floor(Math.random() * PLAYFUL_LINES.length)];

  get showPlayfulLine(): boolean {
    return this.playful && !this.compact && this.variant !== 'error';
  }
}
