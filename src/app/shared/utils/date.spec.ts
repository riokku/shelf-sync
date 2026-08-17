import { getTodayIsoDate, parseIsoDate, toIsoDateString } from './date';

describe('toIsoDateString', () => {
  it('returns null for a null date', () => {
    expect(toIsoDateString(null)).toBeNull();
  });

  it('formats a date as local YYYY-MM-DD', () => {
    expect(toIsoDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toIsoDateString(new Date(2026, 8, 9))).toBe('2026-09-09');
  });

  // The whole reason this helper exists instead of toISOString() — a date
  // constructed at a local time that toISOString() would convert across a
  // UTC day boundary must still format as the *local* calendar date.
  it('does not shift the date across a UTC day boundary the way toISOString() would', () => {
    const lateNightLocal = new Date(2026, 0, 1, 23, 30);
    expect(toIsoDateString(lateNightLocal)).toBe('2026-01-01');
  });
});

describe('getTodayIsoDate', () => {
  it('matches the YYYY-MM-DD shape', () => {
    expect(getTodayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches toIsoDateString(new Date()) for "right now"', () => {
    const todayViaToIsoDateString = toIsoDateString(new Date()) ?? '';
    expect(getTodayIsoDate()).toBe(todayViaToIsoDateString);
  });
});

describe('parseIsoDate', () => {
  it('returns null for a null value', () => {
    expect(parseIsoDate(null)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseIsoDate('')).toBeNull();
  });

  it('parses into a local midnight Date rather than UTC-parsing new Date(str) would', () => {
    const parsed = parseIsoDate('2026-03-15');
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(2); // 0-indexed
    expect(parsed!.getDate()).toBe(15);
    expect(parsed!.getHours()).toBe(0);
  });

  it('round-trips with toIsoDateString', () => {
    expect(toIsoDateString(parseIsoDate('2026-12-31'))).toBe('2026-12-31');
  });
});
