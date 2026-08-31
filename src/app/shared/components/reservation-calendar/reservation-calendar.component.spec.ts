import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReservationCalendarComponent, CalendarDay } from './reservation-calendar.component';
import { InventoryItemReservationWithItem } from '../../utils/inventory-item-reservations';
import { getTodayIsoDate, toIsoDateString } from '../../utils/date';

function isoDateDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIsoDateString(date)!;
}

function createTestReservation(overrides: Partial<InventoryItemReservationWithItem> = {}): InventoryItemReservationWithItem {
  return {
    id: 'reservation-1',
    itemId: 'item-1',
    itemName: 'Chiavari Chairs',
    startDate: isoDateDaysFromToday(-1),
    endDate: isoDateDaysFromToday(1),
    quantity: 30,
    reservedFor: 'Smith wedding',
    note: '',
    status: 'reserved',
    reservedByLabel: 'Jamie Lee',
    reservedAt: '2026-01-15T00:00:00.000Z',
    pickedUpByLabel: '',
    pickedUpAt: '',
    returnedByLabel: '',
    returnedAt: '',
    cancelledByLabel: '',
    cancelledAt: '',
    ...overrides,
  };
}

describe('ReservationCalendarComponent', () => {
  let component: ReservationCalendarComponent;
  let fixture: ComponentFixture<ReservationCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationCalendarComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ReservationCalendarComponent);
    component = fixture.componentInstance;
  });

  function todaysDay(): CalendarDay {
    const todayIso = getTodayIsoDate();
    const day = component.weeks.flat().find(d => d.iso === todayIso);
    if (!day) {
      throw new Error('Expected today to be in the current month grid');
    }
    return day;
  }

  it('always builds a fixed 6-week (42-day) grid regardless of the month', () => {
    expect(component.weeks.length).toBe(6);
    expect(component.weeks.flat().length).toBe(42);
  });

  it('renders all seven weekday headers', () => {
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    for (const label of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      expect(text).toContain(label);
    }
  });

  it('places a reservation on every day within its date range', () => {
    component.reservations = [createTestReservation()];

    expect(todaysDay().reservations.map(r => r.id)).toEqual(['reservation-1']);
  });

  it('does not place a reservation on a day outside its date range', () => {
    component.reservations = [
      createTestReservation({ id: 'far-future', startDate: isoDateDaysFromToday(60), endDate: isoDateDaysFromToday(61) })
    ];

    expect(todaysDay().reservations).toEqual([]);
  });

  it('caps visibleReservations at 3 and reports the rest via overflowCount', () => {
    component.reservations = ['a', 'b', 'c', 'd', 'e'].map(id => createTestReservation({ id }));

    const day = todaysDay();
    expect(component.visibleReservations(day).length).toBe(3);
    expect(component.overflowCount(day)).toBe(2);
  });

  it('overflowCount is 0 when there is nothing to hide', () => {
    component.reservations = [createTestReservation()];
    expect(component.overflowCount(todaysDay())).toBe(0);
  });

  describe('selectDay()', () => {
    it('updates selectedIso and emits the day\'s iso date', () => {
      const emitted: string[] = [];
      component.daySelected.subscribe(iso => emitted.push(iso));

      const someIso = isoDateDaysFromToday(5);
      component.selectDay(someIso);

      expect(component.selectedIso).toBe(someIso);
      expect(emitted).toEqual([someIso]);
    });
  });

  describe('month navigation', () => {
    it('nextMonth() then previousMonth() returns to the original month label', () => {
      const originalLabel = component.monthLabel;

      component.nextMonth();
      expect(component.monthLabel).not.toBe(originalLabel);

      component.previousMonth();
      expect(component.monthLabel).toBe(originalLabel);
    });

    it('goToToday() re-selects and emits today\'s date, and returns to the current month', () => {
      const originalLabel = component.monthLabel;
      const emitted: string[] = [];
      component.daySelected.subscribe(iso => emitted.push(iso));

      component.nextMonth();
      component.nextMonth();
      component.goToToday();

      expect(component.monthLabel).toBe(originalLabel);
      expect(component.selectedIso).toBe(getTodayIsoDate());
      expect(emitted).toEqual([getTodayIsoDate()]);
    });
  });
});
