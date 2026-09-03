import { Database } from './database.types';

/** notifications.kind and notification_email_log.kind both share one real
 *  Postgres enum, `notification_kind` (unify_notification_kind_enum) — unlike
 *  activity_log.entity_type (still a plain checked `text` column, see
 *  ActivityEntityType in shared/utils/activity-log.ts), so this resolves to
 *  a genuine literal union rather than `string`: 'task_assigned' |
 *  'task_transfer' | 'retirement_request' | 'join_request' | 'broadcast' |
 *  'checkout_overdue' | 'impersonation_started' | 'feedback' — a task
 *  directly assigned to you, a task transfer offered to you, an inventory
 *  item's retirement request needing admin/manager approval, a new member's
 *  join request needing admin approval, a new broadcast posted to the org, a
 *  checked-out item that's now overdue, a platform admin starting an
 *  impersonation session involving you or your org, or (for
 *  notification_email_log specifically — see that migration's own "shared
 *  type, deliberately slightly loosened per table" tradeoff) someone
 *  submitting feedback. 'feedback' is a member of this union for type
 *  purposes only where `notifications` itself is concerned — no row in that
 *  particular table is ever actually that kind, since feedback has no
 *  in-app notification at all (see add_feedback's own doc comment); it's
 *  real for notification_email_log rows. Every kind but broadcast is also
 *  emailed by send-notification-email (see that function's own doc comment
 *  for why both channels share one recipient resolution rather than
 *  duplicating it) — broadcast is in-app only, inserted directly by
 *  create_broadcast() itself rather than that Edge Function (see the
 *  add_broadcasts migration for why: no email is warranted here, so there's
 *  no reason to round-trip through it). impersonation_started is the other
 *  outlier in the opposite direction — unlike every kind besides feedback,
 *  its email send is never gated by the org's own Settings > Workflow
 *  toggle (see that migration's own doc comment for why a security/trust
 *  notice can't be muted the way an internal workflow convenience can). */
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
    case 'checkout_overdue':
      return 'schedule';
    case 'impersonation_started':
      return 'visibility';
    // No case for 'feedback' — it's a member of the NotificationKind union
    // (shared with notification_email_log, see that type's own doc comment)
    // but never actually appears in a `notifications` row in practice, so
    // this default covers it along with genuinely unexpected values.
    default:
      return 'notifications';
  }
}
