function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formats a Date as a local 'YYYY-MM-DD' string for Postgres `date` columns.
 *  Deliberately avoids `toISOString()`, which converts to UTC first and can
 *  shift the date by a day depending on the caller's timezone offset. */
export function toIsoDateString(date: Date | null): string | null {
  return date ? formatIsoDate(date) : null;
}

/** Today as a local 'YYYY-MM-DD' string. Comparing date-only strings this
 *  way (rather than parsing both sides into Date objects) sidesteps the
 *  same UTC-parsing pitfall — 'YYYY-MM-DD' strings sort lexicographically
 *  in the same order as chronologically. */
export function getTodayIsoDate(): string {
  return formatIsoDate(new Date());
}

/** Inverse of toIsoDateString: parses a 'YYYY-MM-DD' string into a local
 *  Date (midnight local time), rather than `new Date(str)`'s UTC parsing,
 *  which can shift the date by a day depending on the caller's timezone. */
export function parseIsoDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
