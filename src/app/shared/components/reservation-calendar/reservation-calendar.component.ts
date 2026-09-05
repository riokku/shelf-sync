import { Component, ElementRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { InventoryItemReservationWithItem } from '../../utils/inventory-item-reservations';
import { getTodayIsoDate, parseIsoDate, toIsoDateString } from '../../utils/date';

const MAX_VISIBLE_CHIPS_PER_DAY = 3;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Arrow-key deltas in days, per the WAI-ARIA APG grid pattern — Left/Right
 *  move a day, Up/Down move a week. Home/End (a full row jump to the
 *  week's own start/end) are handled separately below since their delta
 *  depends on the focused day's own weekday, not a fixed constant. */
const ARROW_KEY_DAY_DELTAS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

export interface CalendarDay {
  iso: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  reservations: InventoryItemReservationWithItem[];
}

/** Hand-rolled CSS-grid month calendar (no charting/calendar library —
 *  matches this app's own DonutChartComponent/RingStatComponent/
 *  TrendChartComponent "no new runtime dependency" convention) backing
 *  manage/reservations' calendar view. Purely presentational: every input
 *  reservation is assumed already status-filtered by the caller (see
 *  ManageReservationsComponent's own filteredReservations getter), and this
 *  component holds no realtime subscription of its own — it just re-derives
 *  the grid from whatever `reservations` currently is. */
@Component({
  selector: 'app-reservation-calendar',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './reservation-calendar.component.html',
  styleUrl: './reservation-calendar.component.scss'
})
export class ReservationCalendarComponent {
  @Input() reservations: InventoryItemReservationWithItem[] = [];
  /** Emits the newly-selected day's ISO date whenever a cell is clicked, so
   *  the host page can render an agenda list below the grid — see
   *  ManageReservationsComponent's own selectedCalendarDate field. */
  @Output() daySelected = new EventEmitter<string>();

  private readonly hostElement: ElementRef<HTMLElement> = inject(ElementRef);

  readonly weekdayLabels = WEEKDAY_LABELS;

  private viewYear: number;
  private viewMonthIndex: number;
  selectedIso = getTodayIsoDate();
  /** The one cell that's actually in the Tab sequence at any given moment —
   *  the standard WAI-ARIA APG "grid" roving-tabindex pattern, since every
   *  cell being its own tab stop (what a plain <button> per cell gives you
   *  for free) would take 42 Tab presses to get through a month. Arrow
   *  keys move this; it's independent of `selectedIso` (which cell is the
   *  actual booking-agenda selection) so arrowing around to look doesn't
   *  change the agenda until Enter/Space is actually pressed on a cell. */
  focusedIso = getTodayIsoDate();

  constructor() {
    const today = new Date();
    this.viewYear = today.getFullYear();
    this.viewMonthIndex = today.getMonth();
  }

  get monthLabel(): string {
    return new Date(this.viewYear, this.viewMonthIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  /** Recomputed on every access rather than cached/invalidated via
   *  ngOnChanges — same "plain getter over the current @Input()" convention
   *  this app's other filtered-list getters (e.g. InventoryComponent's own
   *  filteredInventoryList) already use, cheap enough here for a 42-cell
   *  grid against a page-sized reservation list. */
  get weeks(): CalendarDay[][] {
    const days = this.buildMonthDays();
    const weeks: CalendarDay[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  }

  visibleReservations(day: CalendarDay): InventoryItemReservationWithItem[] {
    return day.reservations.slice(0, MAX_VISIBLE_CHIPS_PER_DAY);
  }

  overflowCount(day: CalendarDay): number {
    return Math.max(0, day.reservations.length - MAX_VISIBLE_CHIPS_PER_DAY);
  }

  previousMonth() {
    this.shiftMonth(-1);
    this.resetFocusToMonthStart();
  }

  nextMonth() {
    this.shiftMonth(1);
    this.resetFocusToMonthStart();
  }

  goToToday() {
    const today = new Date();
    this.viewYear = today.getFullYear();
    this.viewMonthIndex = today.getMonth();
    this.selectDay(getTodayIsoDate());
  }

  selectDay(iso: string) {
    this.selectedIso = iso;
    // Keep the roving tab stop on whatever cell was just actually chosen
    // (by click, or by Enter/Space on a native <button> — both land here)
    // — otherwise a plain click could leave tabindex="0" sitting on some
    // other, previously-focused cell, and the very next Tab press would
    // skip straight past the whole grid instead of landing back on it.
    this.focusedIso = iso;
    this.daySelected.emit(iso);
  }

  /** Arrow/Home/End keydown on a day cell — see ARROW_KEY_DAY_DELTAS' own
   *  comment and this field's own doc comment on `focusedIso` above. Never
   *  selects a day itself; only native button activation (Enter/Space,
   *  already free from the <button> element) does that via selectDay(). */
  onDayKeydown(event: KeyboardEvent, iso: string) {
    const delta = ARROW_KEY_DAY_DELTAS[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      this.shiftFocus(iso, delta);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const weekday = parseIsoDate(iso)!.getDay();
      this.shiftFocus(iso, event.key === 'Home' ? -weekday : 6 - weekday);
    }
  }

  /** A short, unambiguous accessible name per cell — the visible content
   *  alone (a bare day number, plus whatever reservation chips happen to
   *  be showing) doesn't say which month/year a screen reader user is on,
   *  especially for a leading/trailing pad day from an adjacent month. */
  dayAriaLabel(day: CalendarDay): string {
    const formatted = parseIsoDate(day.iso)!.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const parts = [formatted];
    if (day.isToday) {
      parts.push('Today');
    }
    if (day.iso === this.selectedIso) {
      parts.push('Selected');
    }
    if (day.reservations.length > 0) {
      parts.push(`${day.reservations.length} reservation${day.reservations.length === 1 ? '' : 's'}`);
    }
    return parts.join(', ');
  }

  /** Moves the roving `focusedIso` by `days` from `fromIso` and, once the
   *  target cell actually exists on screen, moves real DOM focus there
   *  too. If the target falls outside the currently-rendered 6-week
   *  window, the displayed month jumps to match first (same as clicking
   *  Previous/Next) — the `setTimeout` defers the actual .focus() call
   *  until after Angular has re-rendered that new month's grid, since the
   *  target button doesn't exist in the DOM yet this tick. */
  private shiftFocus(fromIso: string, days: number) {
    const date = parseIsoDate(fromIso)!;
    date.setDate(date.getDate() + days);
    const targetIso = toIsoDateString(date)!;
    this.focusedIso = targetIso;

    if (this.weeks.flat().some(day => day.iso === targetIso)) {
      this.focusCell(targetIso);
      return;
    }
    this.viewYear = date.getFullYear();
    this.viewMonthIndex = date.getMonth();
    setTimeout(() => this.focusCell(targetIso));
  }

  private focusCell(iso: string) {
    this.hostElement.nativeElement.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`)?.focus();
  }

  private resetFocusToMonthStart() {
    this.focusedIso = toIsoDateString(new Date(this.viewYear, this.viewMonthIndex, 1))!;
  }

  private shiftMonth(delta: number) {
    // JS Date normalizes an out-of-range month (e.g. month: -1 becomes
    // December of the previous year), so this doesn't need its own
    // year-rollover branching.
    const next = new Date(this.viewYear, this.viewMonthIndex + delta, 1);
    this.viewYear = next.getFullYear();
    this.viewMonthIndex = next.getMonth();
  }

  /** A fixed 6-week (42-day) grid, padded with the trailing days of the
   *  previous month and leading days of the next, so the grid's own height
   *  never jumps between a 4-week and 6-week month. */
  private buildMonthDays(): CalendarDay[] {
    const firstOfMonth = new Date(this.viewYear, this.viewMonthIndex, 1);
    const gridStart = new Date(this.viewYear, this.viewMonthIndex, 1 - firstOfMonth.getDay());
    const todayIso = getTodayIsoDate();

    const days: CalendarDay[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const iso = toIsoDateString(date)!;
      days.push({
        iso,
        dayOfMonth: date.getDate(),
        inCurrentMonth: date.getMonth() === this.viewMonthIndex,
        isToday: iso === todayIso,
        // Reservation date ranges are already 'YYYY-MM-DD' strings, which
        // sort/compare lexicographically the same as chronologically — no
        // need to parse either side into a Date first.
        reservations: this.reservations.filter(r => iso >= r.startDate && iso <= r.endDate)
      });
    }
    return days;
  }
}
