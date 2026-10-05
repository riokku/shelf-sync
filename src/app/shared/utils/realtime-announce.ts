import { LiveAnnouncer } from '@angular/cdk/a11y';
import { FlashTracker } from './flash-tracker';

/** Flashes every id in `ids` (see FlashTracker's own doc comment for the
 *  purely-visual `.realtime-flash` pulse this drives) and, for whichever
 *  ones resolve to a real label via `labelFor`, also speaks a live-region
 *  announcement via Angular CDK's `LiveAnnouncer` — the accessible
 *  counterpart to that same pulse, since a screen reader user gets nothing
 *  at all from a CSS animation alone. Reuses CDK's own `LiveAnnouncer`
 *  (already a transitive dependency via Angular Material/CDK, not a new
 *  one — this app's "hand-roll it" convention is about avoiding new
 *  *charting/calendar* dependencies, not reaching for CDK a11y helpers it
 *  already ships, e.g. `cdkTrapFocus`) rather than a hand-rolled `aria-live`
 *  region — `LiveAnnouncer` already handles the fiddly parts of one (a
 *  shared, deduped region; clearing stale text so a repeated identical
 *  message still gets re-announced).
 *
 *  Shared by every "debounced batch reload" realtime page
 *  (`TasksComponent`/`ManageTasksComponent`/`ManageTeamComponent`/
 *  `ManageOrdersComponent`/`ManageReservationsComponent`/
 *  `ManageAuditsComponent`/`BroadcastsComponent`) at the exact "reload
 *  finished, now flash every id that changed" moment each one's own
 *  `reloadAndFlashChangedX()` already reaches, plus the two single-row-patch
 *  pages (`InventoryComponent`/`ManageInventoryComponent`) passing a
 *  single-id array instead of a whole pending set. An id that no longer
 *  resolves to anything (deleted, or filtered out of the just-reloaded
 *  list) still flashes — the row itself might still be visible a beat
 *  longer — but isn't announced, since there's nothing sensible left to say
 *  about it. Never called from a component's own local-edit reload paths,
 *  only from an actual realtime handler — announcing your own just-made
 *  edit would be as pointless as flashing it, see `FlashTracker`'s own doc
 *  comment on that same rule. */
export function flashAndAnnounceChanges(
  ids: Iterable<string>,
  flashTracker: FlashTracker,
  liveAnnouncer: LiveAnnouncer,
  labelFor: (id: string) => string | null,
  describe: (label: string) => string
): void {
  for (const id of ids) {
    flashTracker.flash(id);
    const label = labelFor(id);
    if (label) {
      void liveAnnouncer.announce(describe(label), 'polite');
    }
  }
}
