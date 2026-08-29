import { Database } from './database.types';

/** notifications.kind is a plain checked `text` column, not a real Postgres
 *  enum (same shape activity_log.entity_type already has — see
 *  ActivityEntityType in shared/utils/activity-log.ts for the identical
 *  derive-from-the-row-type precedent this mirrors), so this resolves to
 *  `string` rather than a narrower literal union — the check constraint
 *  itself (see the add_notifications migration, widened by add_broadcasts)
 *  is what actually constrains it to one of 'task_assigned' |
 *  'task_transfer' | 'retirement_request' | 'join_request' | 'broadcast': a
 *  task directly assigned to you, a task transfer offered to you, an
 *  inventory item's retirement request needing admin/manager approval, a
 *  new member's join request needing admin approval, or a new broadcast
 *  posted to the org. The first four are also emailed by
 *  send-notification-email (see that function's own doc comment for why
 *  both channels share one recipient resolution rather than duplicating
 *  it) — broadcast is in-app only, inserted directly by create_broadcast()
 *  itself rather than that Edge Function (see the add_broadcasts migration
 *  for why: no email is warranted here, so there's no reason to round-trip
 *  through it). */
export type NotificationKind = Database['public']['Tables']['notifications']['Row']['kind'];

/** One row from the `notifications` table, camelCased for client use —
 *  same "plain interface, not the generated snake_case DB row type"
 *  treatment this app's other client-facing shapes (InventoryItem, Supplier)
 *  already get. Backs HeaderComponent's bell dropdown via
 *  NotificationCenterService. */
export interface UserNotification {
  id: string;
  kind: NotificationKind;
  message: string;
  /** App-relative path (e.g. '/tasks') the dropdown row navigates to on
   *  click — set server-side by send-notification-email, one per kind. */
  link: string;
  readAt: string | null;
  createdAt: string;
}

/** Maps a Material icon name to each kind, used by the bell dropdown so a
 *  row's icon hints at what it's about without reading the message text —
 *  mirrors the icon each kind's own page section already uses elsewhere in
 *  this app (TaskCardComponent's assignee icon, the Requests tab's retire
 *  icon, Manage Team's join-request icon). */
export function notificationIcon(kind: NotificationKind): string {
  switch (kind) {
    case 'task_assigned':
      return 'checklist';
    case 'task_transfer':
      return 'swap_horiz';
    case 'retirement_request':
      return 'inventory_2';
    case 'join_request':
      return 'person_add';
    case 'broadcast':
      return 'campaign';
    // kind is plain `string` (see NotificationKind's own doc comment) —
    // this default only guards against a value outside the DB check
    // constraint's five kinds ever reaching the client, not a real case.
    default:
      return 'notifications';
  }
}
