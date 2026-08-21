/** Collapses a burst of calls into one, `delayMs` after the last one —
 *  backs the realtime change handlers on the task pages (a task update can
 *  fire more than one WAL event in quick succession, e.g. an RPC touching
 *  several columns at once) so a burst reloads the list once instead of
 *  once per event. Plain `setTimeout`, matching this app's own convention
 *  (no RxJS operators used anywhere in this codebase — every other timing
 *  need, e.g. AuthService's heartbeat or HeaderComponent's presence poll,
 *  is a plain `window.setInterval`/`setTimeout` too). `.cancel()` is for a
 *  component's own `DestroyRef.onDestroy()`, so an already-scheduled call
 *  doesn't fire after the component (and whatever it'd touch) is gone. */
export function debounce<T extends (...args: never[]) => void>(fn: T, delayMs: number): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof window.setTimeout> | undefined;

  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => fn(...args), delayMs);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return debounced;
}
