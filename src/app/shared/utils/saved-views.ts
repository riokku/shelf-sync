const STORAGE_PREFIX = 'shelf-sync:saved-views';

/** A user's own named snapshot of one page's filter/search/sort state —
 *  `filters` is deliberately an opaque, page-defined shape (`TFilters`):
 *  this module has no idea whether it's Inventory's category/stock-level/
 *  search combo or Manage Tasks' assignee/status/due-date one, it just
 *  stores and returns whatever plain, JSON-serializable object the page
 *  handed it. */
export interface SavedView<TFilters> {
  id: string;
  name: string;
  filters: TFilters;
}

function storageKey(userId: string, pageKey: string): string {
  return `${STORAGE_PREFIX}:${userId}:${pageKey}`;
}

/** Best-effort, same try/catch shape every other localStorage read/write in
 *  this app already uses (see e.g. PageIntroComponent's own
 *  readDismissed()/dismiss()) — a private-browsing/storage-blocked context
 *  just means saved views silently don't persist, not a thrown error. */
export function loadSavedViews<TFilters>(userId: string, pageKey: string): SavedView<TFilters>[] {
  try {
    const raw = localStorage.getItem(storageKey(userId, pageKey));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist<TFilters>(userId: string, pageKey: string, views: SavedView<TFilters>[]) {
  try {
    localStorage.setItem(storageKey(userId, pageKey), JSON.stringify(views));
  } catch {
    // Best-effort — worst case the new/removed view just doesn't survive a
    // refresh, same as every other localStorage write in this app.
  }
}

/** Appends one new saved view and persists the whole updated list —
 *  returns it too, so a caller (SavedViewsBarComponent) can update its own
 *  in-memory `views` field from the return value rather than re-reading
 *  storage right back out again. */
export function addSavedView<TFilters>(userId: string, pageKey: string, name: string, filters: TFilters): SavedView<TFilters>[] {
  const views = [...loadSavedViews<TFilters>(userId, pageKey), { id: crypto.randomUUID(), name, filters }];
  persist(userId, pageKey, views);
  return views;
}

export function removeSavedView<TFilters>(userId: string, pageKey: string, viewId: string): SavedView<TFilters>[] {
  const views = loadSavedViews<TFilters>(userId, pageKey).filter(view => view.id !== viewId);
  persist(userId, pageKey, views);
  return views;
}
