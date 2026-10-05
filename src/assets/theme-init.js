// Runs synchronously in <head>, before Angular boots and before first paint.
// Pulled out of index.html as a real external file (rather than an inline
// <script> block) specifically so the site's Content-Security-Policy
// (see src/_headers) can keep a strict script-src with no 'unsafe-inline' —
// a static site with no per-request templating has no way to mint a fresh
// nonce per request, so a hash-pinned inline script was the only other
// option, and that hash would silently go stale the next time this file's
// content changed. A plain <script src="..."> with no async/defer still
// blocks parsing and runs immediately in document order, so moving this out
// changes nothing about *when* it runs relative to the inline version it
// replaces.

// Browsers natively try to restore a page's previous scroll offset on
// reload/back-forward (history.scrollRestoration defaults to 'auto'),
// independent of and *before* Angular Router's own
// scrollPositionRestoration handling (app-routing.module.ts) even
// boots — most visible as a hard reload or direct URL load (e.g.
// /privacy from a bookmark) briefly landing scrolled down, sometimes
// with a visible snap back to top once Angular catches up. Set as
// early as possible, before first paint, so the browser never attempts
// its own restoration in the first place; Angular's Router still
// handles scroll behavior for in-app navigations from here.
history.scrollRestoration = 'manual';

// Applies the saved light/dark mode before Angular boots (and before
// first paint), so light-mode users don't see a flash of the dark
// default while the app loads. Kept in sync with the storage key and
// fallback in ThemeModeService (core/theme-mode.service.ts) — update
// both together if either changes.
(function () {
  try {
    var mode = localStorage.getItem('shelfsync-theme-mode');
    if (mode === 'light' || mode === 'dark') {
      document.documentElement.setAttribute('data-mode', mode);
    }
  } catch (e) {
    // localStorage unavailable (private browsing, disabled storage) —
    // fall back to the default dark mode compiled into styles.scss.
  }
})();
