/** How long the `.realtime-flash` CSS animation (see
 *  shared/styles/_realtime-flash.scss) takes to fade out, and how long an id
 *  stays marked as flashing before FlashTracker auto-clears it — matched
 *  exactly so the CSS class comes off right as the animation finishes rather
 *  than lingering (a still-present class doesn't restart a CSS animation, so
 *  leaving it on would silently block a second flash on the same id) or
 *  coming off mid-fade. */
export const FLASH_DURATION_MS = 1500;

/** Tracks which ids should currently show the realtime-flash treatment —
 *  backs the brief "someone else just changed this" pulse on every page with
 *  a realtime subscription (see shared/utils/realtime.ts's
 *  subscribeToTableChanges()). A plain Set rather than a signal-per-id,
 *  matching this app's existing convention of plain class fields over a
 *  signals-based state layer (see CLAUDE.md's Architecture note) —
 *  components read it via isFlashing(id) from the template, and Angular's
 *  zone-patched setTimeout (same as every other timing need in this app)
 *  already triggers a change-detection pass when an id is added or
 *  removed. */
export class FlashTracker {
  private readonly ids = new Set<string>();
  private readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  isFlashing(id: string): boolean {
    return this.ids.has(id);
  }

  /** Marks `id` as flashing now. Restarts the timer if it's already
   *  flashing (e.g. a second rapid change to the same row) rather than
   *  letting an in-flight removal cut the new flash short. */
  flash(id: string): void {
    const existingTimeout = this.timeouts.get(id);
    if (existingTimeout !== undefined) {
      clearTimeout(existingTimeout);
    }
    this.ids.add(id);
    this.timeouts.set(id, setTimeout(() => {
      this.ids.delete(id);
      this.timeouts.delete(id);
    }, FLASH_DURATION_MS));
  }

  /** For a component's own DestroyRef.onDestroy() — cancels every pending
   *  removal so none fire after the component (and whatever it'd touch) is
   *  gone, same reasoning as debounce()'s own .cancel(). */
  clear(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    this.ids.clear();
  }
}
