import { CHANGELOG_ENTRIES } from '../models/changelog';

const STORAGE_PREFIX = 'shelf-sync:changelog-last-seen';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function readLastSeen(userId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

/** Records that `userId` has seen every changelog entry up through the
 *  newest one right now — called from HelpComponent's ngOnInit, since
 *  that's the "What's new" section's own page. Best-effort, same try/catch
 *  shape every other localStorage write in this app already uses. */
export function markChangelogSeen(userId: string) {
  try {
    localStorage.setItem(storageKey(userId), CHANGELOG_ENTRIES[0]?.date ?? '');
  } catch {
    // Best-effort — worst case the badge just doesn't clear until a later
    // visit manages to write successfully.
  }
}

/** How many changelog entries `userId` hasn't seen yet — backs
 *  HeaderComponent's badge on the Help nav link. The very first time this
 *  is ever checked for a user (no stored value at all), this bootstraps
 *  them as caught-up-as-of-now rather than surfacing every entry that
 *  shipped before they ever looked — the same reasoning a fresh email
 *  inbox doesn't retroactively mark years of old messages unread. Only
 *  entries genuinely shipped *after* that point (or after their last real
 *  visit to the Help page) ever show up as unseen. */
export function getUnseenChangelogCount(userId: string): number {
  const lastSeen = readLastSeen(userId);
  if (lastSeen === null) {
    markChangelogSeen(userId);
    return 0;
  }
  return CHANGELOG_ENTRIES.filter(entry => entry.date > lastSeen).length;
}
