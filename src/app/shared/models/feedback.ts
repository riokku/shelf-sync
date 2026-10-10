/** Mirrors `feedback.type`'s check constraint (see the add_feedback
 *  migration) and the FEEDBACK_TYPE_LABELS map duplicated in the
 *  send-notification-email Edge Function — that function can't import from
 *  this app's own source tree (it's a separately deployed Deno function),
 *  so the two are kept in sync by hand, the same way notifications.kind's
 *  own union type already is between this app and that function. */
export type FeedbackType = 'support_ticket' | 'bug' | 'feature_request' | 'general' | 'other';

/** Drives the dropdown's own option order (FeedbackModalComponent iterates
 *  this array directly). 'support_ticket' leads because "I need help with
 *  something" is the most actionable reason to open this dialog — added in
 *  the same pass that retitled the dialog itself to "Submit feedback or
 *  support ticket", which until then promised a ticket option the dropdown
 *  never actually offered; 'other' stays last as the catch-all.
 *  Nothing behaves differently per position — the form seeds no default
 *  type at all (see FeedbackModalComponent's own comment on why), so this
 *  is purely presentational. */
export const FEEDBACK_TYPES: FeedbackType[] = ['support_ticket', 'bug', 'feature_request', 'general', 'other'];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  support_ticket: 'Support ticket',
  bug: 'Bug report',
  feature_request: 'Feature request',
  general: 'General feedback',
  other: 'Other'
};

/** Mirrors `feedback.status`'s check constraint (see the add_feedback_status
 *  migration) — backs StudioFeedbackComponent's review workflow. Unlike
 *  FeedbackType above, this column is never read by the Edge Function, so
 *  there's no second copy to keep in sync. */
export type FeedbackStatus = 'new' | 'reviewed' | 'resolved';

export const FEEDBACK_STATUSES: FeedbackStatus[] = ['new', 'reviewed', 'resolved'];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  resolved: 'Resolved'
};
