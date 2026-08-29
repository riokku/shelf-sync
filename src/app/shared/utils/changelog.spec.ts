import { getUnseenChangelogCount, markChangelogSeen } from './changelog';
import { CHANGELOG_ENTRIES } from '../models/changelog';

describe('changelog', () => {
  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      // Same "best effort" reasoning this module's own storage access has.
    }
  });

  it('getUnseenChangelogCount() bootstraps a never-checked user as caught up (0), not showing every past entry', () => {
    expect(getUnseenChangelogCount('user-1')).toBe(0);
  });

  it('reports 0 again on a later check for the same user, since the bootstrap already recorded them as caught up', () => {
    getUnseenChangelogCount('user-1');
    expect(getUnseenChangelogCount('user-1')).toBe(0);
  });

  it('markChangelogSeen() then simulating an older last-seen date reports every entry shipped after it', () => {
    markChangelogSeen('user-1');
    // Simulate time passing: rewrite the stored last-seen value to before
    // every real entry in CHANGELOG_ENTRIES, so all of them count as unseen.
    localStorage.setItem('shelf-sync:changelog-last-seen:user-1', '2000-01-01');

    expect(getUnseenChangelogCount('user-1')).toBe(CHANGELOG_ENTRIES.length);
  });

  it('only counts entries strictly newer than the recorded last-seen date', () => {
    // Derived from CHANGELOG_ENTRIES itself rather than assuming it has
    // only two distinct dates total (true only by coincidence at one
    // point — the list keeps growing across more than two ship dates) —
    // the expected count is whatever a plain string-date filter says,
    // computed independently of getUnseenChangelogCount()'s own logic.
    const distinctDates = Array.from(new Set(CHANGELOG_ENTRIES.map(entry => entry.date))).sort();
    expect(distinctDates.length).toBeGreaterThan(1);
    const cutoffDate = distinctDates[0];
    const expectedUnseenCount = CHANGELOG_ENTRIES.filter(entry => entry.date > cutoffDate).length;
    localStorage.setItem('shelf-sync:changelog-last-seen:user-1', cutoffDate);

    expect(getUnseenChangelogCount('user-1')).toBe(expectedUnseenCount);
  });

  it('tracks each user independently', () => {
    localStorage.setItem('shelf-sync:changelog-last-seen:user-1', '2000-01-01');

    expect(getUnseenChangelogCount('user-1')).toBe(CHANGELOG_ENTRIES.length);
    expect(getUnseenChangelogCount('user-2')).toBe(0);
  });
});
