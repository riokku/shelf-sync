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
    const newestDate = CHANGELOG_ENTRIES[0].date;
    const entriesOnNewestDate = CHANGELOG_ENTRIES.filter(entry => entry.date === newestDate).length;
    const oldestDate = CHANGELOG_ENTRIES[CHANGELOG_ENTRIES.length - 1].date;
    // A date strictly before the newest date but not before every entry —
    // rather than assuming any two adjacent entries fall on different
    // days, since several can (and do) ship the same day.
    expect(oldestDate < newestDate).toBeTrue();
    localStorage.setItem('shelf-sync:changelog-last-seen:user-1', oldestDate);

    expect(getUnseenChangelogCount('user-1')).toBe(entriesOnNewestDate);
  });

  it('tracks each user independently', () => {
    localStorage.setItem('shelf-sync:changelog-last-seen:user-1', '2000-01-01');

    expect(getUnseenChangelogCount('user-1')).toBe(CHANGELOG_ENTRIES.length);
    expect(getUnseenChangelogCount('user-2')).toBe(0);
  });
});
