import { parseIsoDate, toIsoDateString } from './date';

/** One all-day calendar event this app can hand off to a real calendar app
 *  (Google/Outlook/Apple) as a downloadable `.ics` file — backs "Add to
 *  calendar" on a reservation's date range (manage/reservations) and a
 *  task's own due date (TaskDetailModalComponent). Both of this app's own
 *  date fields are date-only ('YYYY-MM-DD', no time-of-day), so every event
 *  built here is a plain all-day event — no timezone handling needed,
 *  which is the one genuinely fiddly part of iCalendar files that isn't. */
export interface CalendarEventDetails {
  /** A stable id folded into the file's own UID — re-downloading the same
   *  reservation/task produces the same UID, so importing it again into a
   *  calendar app that dedupes by UID updates the existing event rather
   *  than creating a duplicate. */
  id: string;
  title: string;
  description?: string;
  /** Inclusive start date, 'YYYY-MM-DD'. */
  startDate: string;
  /** Inclusive end date, 'YYYY-MM-DD' — defaults to `startDate` for a
   *  single-day event (a task's own due date). iCalendar's own all-day
   *  DTEND is exclusive, so buildIcsFile() adds one day internally rather
   *  than making every caller remember to. */
  endDate?: string;
}

/** RFC 5545 TEXT value escaping — backslash first, so escaping the other
 *  three characters doesn't double-escape the backslashes it just added. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** RFC 5545 requires folding a content line over 75 octets, continuing on
 *  the next line with a single leading space. A plain character-count fold
 *  (rather than a fully UTF-8-byte-boundary-safe one) — this app's own
 *  content here (item names, task titles, short notes) is virtually always
 *  plain ASCII, so the distinction essentially never matters in practice,
 *  and getting it exactly byte-perfect isn't worth the extra complexity
 *  for a file every mainstream calendar app already tolerates being
 *  slightly under-folded on. */
function foldIcsLine(line: string): string {
  if (line.length <= 75) {
    return line;
  }
  const chunks = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  chunks.push(rest);
  return chunks.join('\r\n ');
}

function toIcsDateValue(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

/** DTSTAMP — "when this file was generated," a required VEVENT field
 *  distinct from the event's own start/end date. Real current time is used
 *  directly here (unlike a date-only reservation/due date, there's no
 *  timezone-shift pitfall to dodge for this one — it's a point-in-time
 *  instant, not a calendar date someone picked). */
function formatIcsTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** Builds a complete, single-event `.ics` file (a VCALENDAR wrapping one
 *  VEVENT) — this app never needs to bundle multiple events into one
 *  download, so there's no multi-VEVENT case to support. */
export function buildIcsFile(event: CalendarEventDetails): string {
  const endDate = event.endDate ?? event.startDate;
  const exclusiveEnd = parseIsoDate(endDate)!;
  exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ShelfSync//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@shelf-sync`,
    `DTSTAMP:${formatIcsTimestamp(new Date())}`,
    `DTSTART;VALUE=DATE:${toIcsDateValue(event.startDate)}`,
    `DTEND;VALUE=DATE:${toIcsDateValue(toIsoDateString(exclusiveEnd)!)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/** Plain client-side file download via a throwaway `<a download>` — same
 *  technique inventory-export.ts's own downloadCsv() already uses, no
 *  server round trip needed since the file is already fully built in
 *  memory. */
export function downloadIcsFile(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
