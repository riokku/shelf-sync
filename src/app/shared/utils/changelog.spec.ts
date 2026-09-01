import { SupabaseClient } from '@supabase/supabase-js';
import { getUnseenChangelogCount, markChangelogSeen } from './changelog';
import { createFakeQueryBuilder } from '../../testing/fakes';
import { Database } from '../models/database.types';

/** A fixed set of posted_at dates, standing in for release_notes rows —
 *  getUnseenChangelogCount() only ever selects that one column, so this is
 *  all the fake supabase client needs to return. */
const POSTED_DATES = ['2026-09-24', '2026-09-23', '2026-08-31', '2026-08-24'];

function createFakeSupabase(postedDates: string[] = POSTED_DATES): SupabaseClient<Database> {
  const rows = postedDates.map(posted_at => ({ posted_at }));
  const fake = {
    from: () => createFakeQueryBuilder({ data: rows, error: null })
  };
  return fake as unknown as SupabaseClient<Database>;
}

describe('changelog', () => {
  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      // Same "best effort" reasoning this module's own storage access has.
    }
  });

  it('getUnseenChangelogCount() bootstraps a never-checked user as caught up (0), not showing every past entry', async () => {
    await expectAsync(getUnseenChangelogCount(createFakeSupabase(), 'user-1')).toBeResolvedTo(0);
  });

  it('reports 0 again on a later check for the same user, since the bootstrap already recorded them as caught up', async () => {
    const supabase = createFakeSupabase();
    await getUnseenChangelogCount(supabase, 'user-1');
    await expectAsync(getUnseenChangelogCount(supabase, 'user-1')).toBeResolvedTo(0);
  });

  it('markChangelogSeen() then simulating an older last-seen date reports every entry posted after it', async () => {
    markChangelogSeen('user-1', POSTED_DATES[0]);
    // Simulate time passing: rewrite the stored last-seen value to before
    // every posted date, so all of them count as unseen.
    localStorage.setItem('shelf-sync:changelog-last-seen:user-1', '2000-01-01');

    await expectAsync(getUnseenChangelogCount(createFakeSupabase(), 'user-1')).toBeResolvedTo(POSTED_DATES.length);
  });

  it('only counts entries strictly newer than the recorded last-seen date', async () => {
    const distinctDates = Array.from(new Set(POSTED_DATES)).sort();
    const cutoffDate = distinctDates[0];
    const expectedUnseenCount = POSTED_DATES.filter(date => date > cutoffDate).length;
    localStorage.setItem('shelf-sync:changelog-last-seen:user-1', cutoffDate);

    await expectAsync(getUnseenChangelogCount(createFakeSupabase(), 'user-1')).toBeResolvedTo(expectedUnseenCount);
  });

  it('tracks each user independently', async () => {
    localStorage.setItem('shelf-sync:changelog-last-seen:user-1', '2000-01-01');
    const supabase = createFakeSupabase();

    await expectAsync(getUnseenChangelogCount(supabase, 'user-1')).toBeResolvedTo(POSTED_DATES.length);
    await expectAsync(getUnseenChangelogCount(supabase, 'user-2')).toBeResolvedTo(0);
  });

  it('markChangelogSeen() is a no-op when there is nothing to mark seen', () => {
    markChangelogSeen('user-1', null);
    expect(localStorage.getItem('shelf-sync:changelog-last-seen:user-1')).toBeNull();
  });
});
