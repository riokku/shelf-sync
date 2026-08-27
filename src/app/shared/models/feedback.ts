/** Mirrors `feedback.type`'s check constraint (see the add_feedback
 *  migration) and the FEEDBACK_TYPE_LABELS map duplicated in the
 *  send-notification-email Edge Function — that function can't import from
 *  this app's own source tree (it's a separately deployed Deno function),
 *  so the two are kept in sync by hand, the same way notifications.kind's
 *  own union type already is between this app and that function. */
export type FeedbackType = 'bug' | 'feature_request' | 'general' | 'other';

export const FEEDBACK_TYPES: FeedbackType[] = ['bug', 'feature_request', 'general', 'other'];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug: 'Bug report',
  feature_request: 'Feature request',
  general: 'General feedback',
  other: 'Other'
};
