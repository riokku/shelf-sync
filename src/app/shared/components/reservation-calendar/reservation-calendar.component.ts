import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { InventoryItemReservationWithItem } from '../../utils/inventory-item-reservations';
import { getTodayIsoDate, toIsoDateString } from '../../utils/date';

const MAX_VISIBLE_CHIPS_PER_DAY = 3;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

  readonly weekdayLabels = WEEKDAY_LABELS;

  private viewYear: number;
  private viewMonthIndex: number;
  selectedIso = getTodayIsoDate();

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
  }

  nextMonth() {
    this.shiftMonth(1);
  }

  goToToday() {
    const today = new Date();
    this.viewYear = today.getFullYear();
    this.viewMonthIndex = today.getMonth();
    this.selectDay(getTodayIsoDate());
  }

  selectDay(iso: string) {
    this.selectedIso = iso;
    this.daySelected.emit(iso);
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
