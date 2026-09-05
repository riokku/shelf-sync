import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

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
    groupId: null,
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

    it('resets the roving focus to the 1st of the newly-shown month', () => {
      const today = new Date();
      component.nextMonth();
      expect(component.focusedIso).toBe(toIsoDateString(new Date(today.getFullYear(), today.getMonth() + 1, 1))!);
    });
  });

  describe('keyboard navigation (roving tabindex, WAI-ARIA grid pattern)', () => {
    function keyEvent(key: string): KeyboardEvent {
      return { key, preventDefault: jasmine.createSpy('preventDefault') } as unknown as KeyboardEvent;
    }

    it('defaults focusedIso to today, the same as selectedIso', () => {
      expect(component.focusedIso).toBe(getTodayIsoDate());
    });

    it('selectDay() also moves the roving tab stop to the selected day', () => {
      const iso = isoDateDaysFromToday(3);
      component.selectDay(iso);
      expect(component.focusedIso).toBe(iso);
    });

    it('ArrowRight/ArrowLeft move focusedIso by one day and suppress the default scroll', () => {
      const startIso = getTodayIsoDate();

      const rightEvent = keyEvent('ArrowRight');
      component.onDayKeydown(rightEvent, startIso);
      expect(component.focusedIso).toBe(isoDateDaysFromToday(1));
      expect(rightEvent.preventDefault).toHaveBeenCalled();

      const leftEvent = keyEvent('ArrowLeft');
      component.onDayKeydown(leftEvent, component.focusedIso);
      expect(component.focusedIso).toBe(startIso);
    });

    it('ArrowDown/ArrowUp move focusedIso by one week', () => {
      const startIso = getTodayIsoDate();

      component.onDayKeydown(keyEvent('ArrowDown'), startIso);
      expect(component.focusedIso).toBe(isoDateDaysFromToday(7));

      component.onDayKeydown(keyEvent('ArrowUp'), component.focusedIso);
      expect(component.focusedIso).toBe(startIso);
    });

    it('Home/End jump to the start/end of the focused day\'s own week', () => {
      // A fixed, known Wednesday (2026-09-09) rather than "today" — Home/End's
      // own math only depends on day-of-week, not which date is current.
      component.onDayKeydown(keyEvent('Home'), '2026-09-09');
      expect(component.focusedIso).toBe('2026-09-06'); // Sunday

      component.onDayKeydown(keyEvent('End'), '2026-09-09');
      expect(component.focusedIso).toBe('2026-09-12'); // Saturday
    });

    it('leaves focusedIso untouched for a key it doesn\'t handle', () => {
      const startIso = getTodayIsoDate();
      const event = keyEvent('a');

      component.onDayKeydown(event, startIso);

      expect(component.focusedIso).toBe(startIso);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('jumps the displayed month when arrowing past the current 6-week window, then focuses the target cell', fakeAsync(() => {
      fixture.detectChanges();
      const originalLabel = component.monthLabel;

      // The grid's very last visible cell — stepping one more week forward
      // is guaranteed to land outside the currently-rendered 42 days.
      const lastVisibleIso = component.weeks.flat()[41].iso;
      component.onDayKeydown(keyEvent('ArrowDown'), lastVisibleIso);
      // Re-render with the new month's grid *before* the deferred focus
      // call's timer fires — in the real app this ordering comes for free
      // (NgZone runs a CD pass once the synchronous keydown handler's own
      // call stack unwinds, ahead of any macrotask like the setTimeout),
      // but a component test's manual detectChanges() doesn't replay that
      // zone-stabilization timing on its own.
      fixture.detectChanges();
      tick();

      expect(component.monthLabel).not.toBe(originalLabel);
      expect(component.weeks.flat().some(day => day.iso === component.focusedIso)).toBe(true);

      const focusedElement = fixture.nativeElement.querySelector(`[data-iso="${component.focusedIso}"]`);
      expect(document.activeElement).toBe(focusedElement);
    }));

    it('moves real DOM focus synchronously when the target cell is already in the rendered grid', () => {
      fixture.detectChanges();
      const startIso = getTodayIsoDate();

      component.onDayKeydown(keyEvent('ArrowRight'), startIso);

      const focusedElement = fixture.nativeElement.querySelector(`[data-iso="${component.focusedIso}"]`);
      expect(document.activeElement).toBe(focusedElement);
    });
  });

  describe('dayAriaLabel()', () => {
    it('names the date, and flags today/selected/reservation count when applicable', () => {
      component.reservations = [createTestReservation()];
      const day = todaysDay();

      const label = component.dayAriaLabel(day);

      expect(label).toContain('Today');
      expect(label).toContain('Selected');
      expect(label).toContain('1 reservation');
    });

    it('omits the optional flags for an ordinary, unselected day with nothing booked', () => {
      const futureIso = isoDateDaysFromToday(10);
      const day = component.weeks.flat().find(d => d.iso === futureIso)!;

      const label = component.dayAriaLabel(day);

      expect(label).not.toContain('Today');
      expect(label).not.toContain('Selected');
      expect(label).not.toContain('reservation');
    });
  });
});
