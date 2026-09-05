import { buildIcsFile } from './calendar-export';

describe('buildIcsFile()', () => {
  it('wraps a single VEVENT in a VCALENDAR with the required boilerplate fields', () => {
    const ics = buildIcsFile({ id: 'abc-123', title: 'Folding Chairs reservation', startDate: '2026-06-01', endDate: '2026-06-03' });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:abc-123@shelf-sync');
    expect(ics).toContain('SUMMARY:Folding Chairs reservation');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('uses CRLF line endings, per the iCalendar spec', () => {
    const ics = buildIcsFile({ id: 'x', title: 'x', startDate: '2026-06-01' });
    expect(ics).toContain('\r\n');
    expect(ics.split('\n').every(line => line === '' || line.endsWith('\r'))).toBe(true);
  });

  it('sets an all-day DTSTART on the given start date', () => {
    const ics = buildIcsFile({ id: 'x', title: 'x', startDate: '2026-06-01' });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260601');
  });

  it('makes DTEND exclusive (one day past the given inclusive end date)', () => {
    const ics = buildIcsFile({ id: 'x', title: 'x', startDate: '2026-06-01', endDate: '2026-06-03' });
    // Inclusive June 1-3 needs an exclusive end of June 4 to actually cover
    // all three days in a real calendar app.
    expect(ics).toContain('DTEND;VALUE=DATE:20260604');
  });

  it('defaults endDate to startDate for a single-day event, still producing a one-day-later exclusive DTEND', () => {
    const ics = buildIcsFile({ id: 'x', title: 'Task due', startDate: '2026-06-01' });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260601');
    expect(ics).toContain('DTEND;VALUE=DATE:20260602');
  });

  it('correctly rolls DTEND over a month/year boundary', () => {
    const ics = buildIcsFile({ id: 'x', title: 'x', startDate: '2026-12-30', endDate: '2026-12-31' });
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
  });

  it('includes DESCRIPTION only when one is given', () => {
    const withDescription = buildIcsFile({ id: 'x', title: 'x', startDate: '2026-06-01', description: 'Some notes' });
    expect(withDescription).toContain('DESCRIPTION:Some notes');

    const withoutDescription = buildIcsFile({ id: 'x', title: 'x', startDate: '2026-06-01' });
    expect(withoutDescription).not.toContain('DESCRIPTION:');
  });

  it('escapes commas, semicolons, and newlines in text values', () => {
    const ics = buildIcsFile({
      id: 'x',
      title: 'Chairs, Tables; More',
      startDate: '2026-06-01',
      description: 'Line one\nLine two'
    });

    expect(ics).toContain('SUMMARY:Chairs\\, Tables\\; More');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
  });

  it('folds a content line longer than 75 characters onto a continuation line starting with a space', () => {
    const longTitle = 'A'.repeat(100);
    const ics = buildIcsFile({ id: 'x', title: longTitle, startDate: '2026-06-01' });

    const summaryLineStart = ics.indexOf('SUMMARY:');
    const nextCrlf = ics.indexOf('\r\n', summaryLineStart);
    const firstPhysicalLine = ics.slice(summaryLineStart, nextCrlf);
    expect(firstPhysicalLine.length).toBeLessThanOrEqual(75);
    // The continuation line (right after the fold) starts with a single
    // leading space, per RFC 5545.
    expect(ics[nextCrlf + 2]).toBe(' ');
  });
});
