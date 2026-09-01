import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';

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

/** Records that `userId` has seen every release note posted through
 *  `latestPostedAt` — called from both ManageReleaseNotesComponent's and
 *  StudioReleaseNotesComponent's ngOnInit (the two "What's new" pages' own
 *  routes, Manage's hub and Studio's respectively — see each component's
 *  own doc comment), each passing the `postedAt` of the newest entry it
 *  just loaded rather than this function re-querying release_notes itself.
 *  Keyed only by userId, not by which of the two pages was visited, so
 *  seeing either clears both hubs' badges. A null latestPostedAt (no
 *  entries at all) is a no-op — nothing to mark seen. Best-effort, same
 *  try/catch shape every other localStorage write in this app already
 *  uses. */
export function markChangelogSeen(userId: string, latestPostedAt: string | null) {
  if (!latestPostedAt) {
    return;
  }
  try {
    localStorage.setItem(storageKey(userId), latestPostedAt);
  } catch {
    // Best-effort — worst case the badge just doesn't clear until a later
    // visit manages to write successfully.
  }
}

/** How many release notes `userId` hasn't seen yet — backs
 *  ManageComponent's and StudioComponent's own Release Notes card badges.
 *  Issues its own narrow release_notes query (just posted_at — not the full
 *  loadReleaseNotes()) since both hub pages need only a count, not the
 *  title/description text every row also carries; the table is small
 *  enough that this is cheap regardless. The very first time this is ever
 *  checked for a user (no stored value at all), it bootstraps them as
 *  caught-up-as-of-now rather than surfacing every entry that ever shipped
 *  before they first looked, the same way a freshly-connected email inbox
 *  doesn't retroactively mark years of old messages unread. */
export async function getUnseenChangelogCount(supabase: SupabaseClient<Database>, userId: string): Promise<number> {
  const lastSeen = readLastSeen(userId);

  const { data } = await supabase.from('release_notes').select('posted_at').order('posted_at', { ascending: false });
  const postedDates = (data ?? []).map(row => row.posted_at);

  if (lastSeen === null) {
    markChangelogSeen(userId, postedDates[0] ?? null);
    return 0;
  }
  return postedDates.filter(postedAt => postedAt > lastSeen).length;
}
