import { getTodayIsoDate, parseIsoDate } from '../utils/date';

/** A physical inventory audit ("cycle count") — reconciles what the system
 *  thinks is in stock against what's actually on the shelf. Started
 *  org-wide or scoped to one physicalLocation ('' means whole org, mirrors
 *  every other optional free-text field's empty-string-for-null convention
 *  in this app); totalItems/countedItems/discrepancyCount are computed
 *  client-side from this audit's own InventoryAuditCount rows (see
 *  shared/utils/inventory-audits.ts), not stored columns. */
export type InventoryAuditStatus = 'in_progress' | 'completed' | 'cancelled';

/** One org member claiming (or claimed as) responsibility for an audit —
 *  the lead, or one of possibly several support members. Carries the id
 *  (for the lead/support pickers' own pre-selected value), the
 *  already-resolved display label, and their avatarKey (for the "name with
 *  an icon beside it" chip AuditDetailComponent renders once the team is
 *  saved) — same "id + label(+ avatar) together" shape
 *  BroadcastReferencedMember already establishes for its own avatar+name
 *  chip, rather than making every consumer re-resolve a bare id against a
 *  profiles array. */
export interface InventoryAuditTeamMember {
  id: string;
  label: string;
  avatarKey: string | null;
}

export interface InventoryAudit {
  id: string;
  status: InventoryAuditStatus;
  physicalLocation: string;
  note: string;
  startedByLabel: string;
  startedAt: string;
  completedByLabel: string;
  completedAt: string;
  cancelledByLabel: string;
  cancelledAt: string;
  totalItems: number;
  countedItems: number;
  discrepancyCount: number;
  /** null until someone claims it — see set_audit_team()'s own migration
   *  comment. Purely organizational: doesn't change who's actually allowed
   *  to count/apply/complete, only who's on the hook for finishing it. */
  lead: InventoryAuditTeamMember | null;
  /** Sorted by label — set_audit_team() enforces the lead never also
   *  appears here, both client-side (the support picker excludes whoever's
   *  currently selected as lead) and server-side (stripped from the
   *  replacement set regardless of what the caller sent). */
  supporters: InventoryAuditTeamMember[];
}

/** One item's snapshot within an audit — expectedQuantity is captured when
 *  the audit started (see start_inventory_audit()'s own migration comment
 *  for why this is a point-in-time snapshot, not re-read live), and stays
 *  fixed regardless of what else happens to the item afterward.
 *  countedQuantity is null until someone submits a count.
 *  isContainerTracked gates whether "Apply" is offered at all — a
 *  container-tracked item's discrepancy is informational only, see
 *  apply_audit_count()'s own migration comment. */
export interface InventoryAuditCount {
  id: string;
  itemId: string;
  itemName: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  countedByLabel: string;
  countedAt: string;
  note: string;
  appliedByLabel: string;
  appliedAt: string;
  isContainerTracked: boolean;
}

/** True once counted and not matching expected — the only rows "Apply"
 *  applies to (and only when also flat-tracked). A never-counted row
 *  (countedQuantity === null) is neither a match nor a discrepancy. */
export function isAuditDiscrepancy(count: InventoryAuditCount): boolean {
  return count.countedQuantity !== null && count.countedQuantity !== count.expectedQuantity;
}

// --- Recurring audit schedules ---------------------------------------------

/** A recurring cadence for auto-starting real audits — see
 *  run_scheduled_inventory_audits()'s own migration comment for the
 *  server-side half. Deliberately a small fixed set (this schema's usual
 *  "small fixed set of options, not open-ended" convention — mirrors
 *  ReservationStatus/ReleaseNoteSeverity) rather than a free-form interval. */
export type AuditFrequency = 'weekly' | 'monthly' | 'quarterly';

export const AUDIT_FREQUENCY_LABELS: Record<AuditFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly'
};

/** physicalLocation '' means whole org, same empty-string-for-null
 *  convention InventoryAudit.physicalLocation itself already uses.
 *  nextOccurrenceDate is the one field run_scheduled_inventory_audits()
 *  advances each time it fires — everything else only ever changes via an
 *  explicit edit. */
export interface InventoryAuditSchedule {
  id: string;
  physicalLocation: string;
  frequency: AuditFrequency;
  note: string;
  nextOccurrenceDate: string;
  active: boolean;
  createdByLabel: string;
  createdAt: string;
}

/** How many days out "upcoming" starts — both for showing a schedule in the
 *  Upcoming list and for locking its own field edits, since they're the same
 *  threshold by design (see update_audit_schedule()'s own migration
 *  comment). */
const UPCOMING_WINDOW_DAYS = 7;

/** Exported for display too (e.g. "starts in 3 days") — not just the two
 *  boolean checks below. */
export function daysUntilAuditOccurrence(schedule: InventoryAuditSchedule): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  // parseIsoDate/getTodayIsoDate (shared/utils/date.ts) both parse as local
  // midnight, so the difference below is a whole number of local days —
  // reusing them here (rather than `new Date(isoDate)`'s UTC parsing) avoids
  // the same off-by-one-day pitfall their own doc comments already flag.
  const today = parseIsoDate(getTodayIsoDate())!;
  const target = parseIsoDate(schedule.nextOccurrenceDate)!;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

/** An active schedule whose next occurrence is within the upcoming window —
 *  what the Upcoming section in ManageAuditsComponent shows to every
 *  approved member. A paused schedule never shows here regardless of its
 *  date, since it isn't actually going to fire. */
export function isAuditScheduleUpcoming(schedule: InventoryAuditSchedule): boolean {
  return schedule.active && daysUntilAuditOccurrence(schedule) <= UPCOMING_WINDOW_DAYS;
}

/** Same threshold as isAuditScheduleUpcoming(), but gates field edits only
 *  (location/frequency/note) — pausing/resuming the whole series stays
 *  allowed regardless, mirroring set_audit_schedule_active()'s own lack of
 *  this check server-side. */
export function isAuditScheduleLocked(schedule: InventoryAuditSchedule): boolean {
  return daysUntilAuditOccurrence(schedule) <= UPCOMING_WINDOW_DAYS;
}
