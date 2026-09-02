import { InventoryAuditSchedule, isAuditScheduleLocked, isAuditScheduleUpcoming } from './inventory-audit.model';
import { toIsoDateString } from '../utils/date';

/** Builds a 'YYYY-MM-DD' string offset from today by the given number of
 *  days — same convention InventoryItem's own isCheckoutOverdue spec
 *  already establishes, avoiding a hardcoded date that would eventually go
 *  stale relative to isAuditScheduleUpcoming()/isAuditScheduleLocked()'s own
 *  getTodayIsoDate() comparison. */
function isoDateDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIsoDateString(date)!;
}

function buildSchedule(overrides: Partial<InventoryAuditSchedule> = {}): InventoryAuditSchedule {
  return {
    id: 'schedule-1',
    physicalLocation: '',
    frequency: 'monthly',
    note: '',
    nextOccurrenceDate: isoDateDaysFromToday(30),
    active: true,
    createdByLabel: 'Jane Doe',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

describe('isAuditScheduleUpcoming', () => {
  it('is false when the next occurrence is more than a week away', () => {
    const schedule = buildSchedule({ nextOccurrenceDate: isoDateDaysFromToday(8) });
    expect(isAuditScheduleUpcoming(schedule)).toBe(false);
  });

  it('is true when the next occurrence is within a week', () => {
    const schedule = buildSchedule({ nextOccurrenceDate: isoDateDaysFromToday(7) });
    expect(isAuditScheduleUpcoming(schedule)).toBe(true);
  });

  it('is true when the next occurrence is today', () => {
    const schedule = buildSchedule({ nextOccurrenceDate: isoDateDaysFromToday(0) });
    expect(isAuditScheduleUpcoming(schedule)).toBe(true);
  });

  it('is false for a paused schedule regardless of date', () => {
    const schedule = buildSchedule({ nextOccurrenceDate: isoDateDaysFromToday(1), active: false });
    expect(isAuditScheduleUpcoming(schedule)).toBe(false);
  });
});

describe('isAuditScheduleLocked', () => {
  it('is false when the next occurrence is more than a week away', () => {
    const schedule = buildSchedule({ nextOccurrenceDate: isoDateDaysFromToday(8) });
    expect(isAuditScheduleLocked(schedule)).toBe(false);
  });

  it('is true when the next occurrence is within a week', () => {
    const schedule = buildSchedule({ nextOccurrenceDate: isoDateDaysFromToday(3) });
    expect(isAuditScheduleLocked(schedule)).toBe(true);
  });

  // Unlike isAuditScheduleUpcoming(), the lock applies regardless of
  // active/paused — a paused schedule this close to its own next occurrence
  // still can't have its scope edited, only resumed/left paused (see
  // set_audit_schedule_active()'s own migration comment for why that
  // action alone stays exempt).
  it('is true for a paused schedule within the window too', () => {
    const schedule = buildSchedule({ nextOccurrenceDate: isoDateDaysFromToday(1), active: false });
    expect(isAuditScheduleLocked(schedule)).toBe(true);
  });
});
