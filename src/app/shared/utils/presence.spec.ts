import { formatLastSeen, isProfileOnline, ONLINE_THRESHOLD_MS } from './presence';

/** Real Date.now() offset by `ms` (negative = in the past), rather than
 *  mocking the clock — every assertion here only cares about the offset
 *  from "now", not a fixed point in time. */
function agoIso(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

describe('isProfileOnline', () => {
  it('is false for null (never recorded)', () => {
    expect(isProfileOnline(null)).toBeFalse();
  });

  it('is true just inside the threshold', () => {
    expect(isProfileOnline(agoIso(ONLINE_THRESHOLD_MS - 1000))).toBeTrue();
  });

  it('is true for a timestamp from right now', () => {
    expect(isProfileOnline(agoIso(0))).toBeTrue();
  });

  it('is false just past the threshold', () => {
    expect(isProfileOnline(agoIso(ONLINE_THRESHOLD_MS + 1000))).toBeFalse();
  });

  it('is false for a timestamp from hours ago', () => {
    expect(isProfileOnline(agoIso(3 * 60 * 60 * 1000))).toBeFalse();
  });
});

describe('formatLastSeen', () => {
  it('reads "Never signed in" for null', () => {
    expect(formatLastSeen(null)).toBe('Never signed in');
  });

  it('reads "just now" for anything under 45 seconds ago', () => {
    expect(formatLastSeen(agoIso(10_000))).toBe('Last seen just now');
  });

  it('formats minutes ago', () => {
    expect(formatLastSeen(agoIso(5 * 60_000))).toBe('Last seen 5 minutes ago');
  });

  it('formats a single minute without pluralizing', () => {
    expect(formatLastSeen(agoIso(60_000))).toBe('Last seen 1 minute ago');
  });

  it('formats hours ago once past 60 minutes', () => {
    expect(formatLastSeen(agoIso(2 * 60 * 60_000))).toBe('Last seen 2 hours ago');
  });

  it('formats days ago once past 24 hours', () => {
    expect(formatLastSeen(agoIso(3 * 86_400_000))).toBe('Last seen 3 days ago');
  });

  it('formats months ago once past 30 days', () => {
    expect(formatLastSeen(agoIso(60 * 86_400_000))).toBe('Last seen 2 months ago');
  });

  it('formats years ago once past 12 months', () => {
    // Intl.RelativeTimeFormat's { numeric: 'auto' } phrases exactly 1 unit
    // ago for day/month/year specially ("yesterday"/"last month"/"last
    // year") rather than "1 year ago" — deliberate (reads more naturally),
    // so this asserts 2 years instead to exercise the plain numeric path.
    expect(formatLastSeen(agoIso(800 * 86_400_000))).toBe('Last seen 2 years ago');
  });

  it('uses natural phrasing for exactly one year ago', () => {
    expect(formatLastSeen(agoIso(400 * 86_400_000))).toBe('Last seen last year');
  });
});
