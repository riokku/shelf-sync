import { FlashTracker } from './flash-tracker';

/** The "you searched for this in the command palette, here it is" landing
 *  treatment for a page whose list has no per-id deep link of its own (see
 *  CommandPaletteService's own doc comment — Inventory/Tasks/Audits all
 *  reuse an existing `?item=`/`?task=`/`?audit=` deep link instead;
 *  Suppliers/Orders/Reservations/Broadcasts don't have one, so this backs
 *  a `?highlight=<id>` param for those four instead). Reuses the exact same
 *  `.realtime-flash` pulse a live update from another user already gets
 *  (via the caller's own FlashTracker) rather than inventing a second
 *  highlight style, plus scrolls the matching row into view since it may be
 *  off-screen on arrival. A no-op if `highlightId` is absent or doesn't
 *  match anything actually in `ids` (a stale/tampered link, or the row was
 *  since deleted).
 *
 *  Deferred one macrotask via a plain setTimeout — called right after the
 *  owning list finishes loading, before Angular's own change detection has
 *  necessarily flushed the new rows into the DOM yet, so an immediate
 *  document.getElementById() lookup could miss. */
export function flashAndScrollToHighlighted(
  highlightId: string | null,
  ids: string[],
  elementId: (id: string) => string,
  flashTracker: FlashTracker
): void {
  if (!highlightId || !ids.includes(highlightId)) {
    return;
  }
  setTimeout(() => {
    flashTracker.flash(highlightId);
    document.getElementById(elementId(highlightId))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 0);
}
