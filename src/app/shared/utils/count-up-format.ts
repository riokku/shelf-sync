/** Shared formatters for CountUpDirective's `countUpFormat` input — matching the exact precision
 *  Angular's own `number`/`currency` pipes would produce for these same stat tiles, so switching a
 *  tile onto the count-up directive changes only how it *arrives* at its resting value, not the
 *  resting value's own formatting. */

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Default `countUpFormat` — a plain grouped integer, e.g. "1,234". Matches `| number` with no
 *  digitsInfo (the shape every plain count stat tile in this app already uses). */
export function countUpNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Matches Angular's `| currency` default (`en-US`, `USD`, 2 fraction digits), e.g. "$1,234.56". */
export function countUpCurrency(n: number): string {
  return CURRENCY_FORMATTER.format(n);
}
