// Called by five Database Webhook triggers (see the
// add_notification_email_webhooks and add_feedback migrations) whenever a
// row this app cares about changes in a way worth telling someone about: a
// task gets directly assigned or a transfer gets offered, an item's
// retirement request needs approval, someone's join request needs approval,
// or a user submits feedback. Each trigger has its own `when (...)` clause
// (feedback's own trigger has none — every insert there is worth emailing
// about) scoping it to exactly that transition, so this function can mostly
// trust that if it's been called, the payload is relevant — it still
// re-checks defensively before sending anything.
//
// Two independent outputs per event: an email (gated by the org's own
// Settings > Workflow "Email notifications" toggle, see
// isNotificationEnabled() below) and an in-app row in the `notifications`
// table (see add_notifications — always inserted regardless of that toggle,
// since it's a different, no-cost channel — HeaderComponent's bell
// dropdown). Both share the same recipient-resolution logic
// (profileEmail()/orgEmailsByRole() below) so "who gets notified" is
// computed once per event, not twice.
//
// Authenticated via a shared secret (Vault-stored on the Postgres side, an
// Edge Function secret here) rather than the far more powerful
// service_role key, which this function *does* use internally (Supabase
// injects it automatically into every Edge Function) once a call has
// already passed that check — a raw trigger definition can't read Vault at
// definition time, only a plain string literal, so embedding the
// service_role key directly there would mean committing it to the repo.
// This shared secret is deliberately low-privilege instead: its only power
// is "can invoke this one function", not "can bypass every RLS policy". The
// same service_role client is what lets this function insert into
// `notifications` at all — that table has no INSERT policy for
// `authenticated`/`anon`, see add_notifications' own doc comment for why.
//
// No custom domain verified with Resend yet — sends from Resend's own
// onboarding@resend.dev test address, which works immediately but is
// somewhat more likely to land in spam than a verified sending domain
// would. Swap FROM_ADDRESS once a real domain is verified.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const APP_URL = 'https://shelf-sync.chrisistinson.workers.dev';
const FROM_ADDRESS = 'ShelfSync <onboarding@resend.dev>';
// Feedback's one fixed recipient — unlike every other email this function
// sends, this one never goes to an org member, so it isn't resolved from
// `profiles` the way everything else here is.
const FEEDBACK_TO_ADDRESS = 'chris@studiorioconsulting.com';

const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  bug: 'Bug report',
  feature_request: 'Feature request',
  general: 'General feedback',
  other: 'Other'
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

interface EmailToSend {
  to: string;
  subject: string;
  html: string;
}

// Mirrors notifications.kind's check constraint (add_notifications) and
// notifications.organization_id/user_id/message/link's own columns —
// read_at/created_at/id are left for Postgres to default.
interface NotificationToInsert {
  organization_id: string;
  user_id: string;
  kind: 'task_assigned' | 'task_transfer' | 'retirement_request' | 'join_request';
  message: string;
  link: string;
}

interface EventResult {
  emails: EmailToSend[];
  notifications: NotificationToInsert[];
}

const EMPTY_RESULT: EventResult = { emails: [], notifications: [] };

Deno.serve(async req => {
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json() as WebhookPayload;

  let result: EventResult = EMPTY_RESULT;
  try {
    if (payload.table === 'tasks') {
      result = await resultForTaskChange(payload);
    } else if (payload.table === 'inventory_items') {
      result = await resultForRetirementRequest(payload);
    } else if (payload.table === 'profiles') {
      result = await resultForJoinRequest(payload);
    } else if (payload.table === 'feedback') {
      result = await resultForFeedback(payload);
    }
  } catch (error) {
    // A bug building the notification shouldn't turn into Supabase
    // retrying the webhook delivery forever — log and return 200 either
    // way, same "best effort, never block the thing that triggered it"
    // reasoning this app's own client-side activity logging already
    // follows.
    console.error('Failed to build notification(s):', error);
    return new Response('OK', { status: 200 });
  }

  await Promise.all([
    Promise.all(result.emails.map(sendEmail)),
    insertNotifications(result.notifications)
  ]);

  return new Response('OK', { status: 200 });
});

async function sendEmail(email: EmailToSend) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: email.to,
        subject: email.subject,
        html: email.html
      })
    });
    if (!response.ok) {
      console.error('Resend API error:', response.status, await response.text());
    }
  } catch (error) {
    console.error('Failed to send email via Resend:', error);
  }
}

async function insertNotifications(notifications: NotificationToInsert[]) {
  if (notifications.length === 0) {
    return;
  }
  const { error } = await supabase.from('notifications').insert(notifications);
  if (error) {
    console.error('Failed to insert notification(s):', error);
  }
}

/** Escapes a plain-text value (a task title, item name, or signup name —
 *  every one of these is freely user-editable, and the join-request case is
 *  reachable by a completely unauthenticated visitor via the public signup
 *  form) before it's interpolated into an email's HTML body — emailShell()'s
 *  own bodyHtml param is otherwise raw HTML with no escaping applied
 *  anywhere in this file, so injecting markup/links into a real recipient's
 *  inbox (a phishing vector, e.g. `<a href="...">` styled as a legitimate
 *  CTA) took nothing more than naming a task or item, or signing up with a
 *  crafted display name. Every call below wraps its interpolated value in
 *  this — never the surrounding literal markup itself. notifications.message
 *  is plain text rendered by Angular templates (auto-escaped, see
 *  NotificationCenterComponent), so it deliberately uses the raw,
 *  unescaped label instead — only the HTML email body needs this. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function emailShell(heading: string, bodyHtml: string, ctaLabel: string, ctaHref: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 32rem; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin: 0 0 1rem;">${heading}</h2>
      <p style="margin: 0 0 1.5rem; line-height: 1.5;">${bodyHtml}</p>
      <a href="${ctaHref}" style="display: inline-block; background: #5b6ee1; color: #fff; text-decoration: none; padding: 0.625rem 1.25rem; border-radius: 0.5rem; font-weight: 600;">${ctaLabel}</a>
      <p style="margin: 2rem 0 0; color: #767676; font-size: 0.8125rem;">ShelfSync</p>
    </div>
  `;
}

async function profileEmail(id: string | null | undefined): Promise<{ id: string; email: string; label: string } | null> {
  if (!id) {
    return null;
  }
  const { data } = await supabase.from('profiles').select('id, email, full_name, nickname').eq('id', id).maybeSingle();
  if (!data) {
    return null;
  }
  return { id: data.id, email: data.email, label: data.nickname || data.full_name || data.email };
}

/** Same nickname -> full_name -> email fallback profileDisplayName() uses
 *  client-side, and the same audience a given approval action actually
 *  needs — admin-only for join requests (admin_approve_member() is
 *  admin-only), admin-or-manager for retirement (either can
 *  approve/decline) — not every approved member of the org. */
async function orgProfilesByRole(organizationId: string, roles: string[]): Promise<{ id: string; email: string }[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('organization_id', organizationId)
    .eq('membership_status', 'approved')
    .in('role', roles);
  return data ?? [];
}

/** Settings > Workflow's per-org "Email notifications" toggles — checked
 *  here (not on the Postgres trigger side, which always fires regardless;
 *  see the add_site_settings_email_notification_toggles migration's own
 *  doc comment for why) right before each notification kind would
 *  otherwise send an email. Defaults to true (same as the column's own DB
 *  default) when there's no site_settings row yet for the org. Deliberately
 *  NOT consulted for the in-app notifications.insert() below — see
 *  add_notifications' own doc comment for why that's a separate, always-on
 *  channel. */
async function isEmailNotificationEnabled(organizationId: string, column: string): Promise<boolean> {
  const { data } = await supabase
    .from('site_settings')
    .select(column)
    .eq('organization_id', organizationId)
    .maybeSingle();
  const row = data as Record<string, boolean> | null;
  return row?.[column] ?? true;
}

async function resultForTaskChange(payload: WebhookPayload): Promise<EventResult> {
  const record = payload.record as
    { id: string; title: string; assigned_to: string | null; pending_transfer_to: string | null; organization_id: string } | null;
  const oldRecord = payload.old_record as { pending_transfer_to: string | null } | null;
  if (!record) {
    return EMPTY_RESULT;
  }

  const emails: EmailToSend[] = [];
  const notifications: NotificationToInsert[] = [];

  if (payload.type === 'INSERT' && record.assigned_to) {
    const assignee = await profileEmail(record.assigned_to);
    if (assignee) {
      notifications.push({
        organization_id: record.organization_id,
        user_id: assignee.id,
        kind: 'task_assigned',
        message: `You've been assigned "${record.title}"`,
        link: '/tasks'
      });
      if (await isEmailNotificationEnabled(record.organization_id, 'notify_task_assigned')) {
        emails.push({
          to: assignee.email,
          subject: `You've been assigned a task: ${record.title}`,
          html: emailShell(
            'New task assigned to you',
            `You've been assigned <strong>${escapeHtml(record.title)}</strong> in ShelfSync.`,
            'View task',
            `${APP_URL}/tasks`
          )
        });
      }
    }
  }

  if (
    payload.type === 'UPDATE' &&
    record.pending_transfer_to &&
    record.pending_transfer_to !== oldRecord?.pending_transfer_to
  ) {
    const target = await profileEmail(record.pending_transfer_to);
    if (target) {
      notifications.push({
        organization_id: record.organization_id,
        user_id: target.id,
        kind: 'task_transfer',
        message: `You've been offered "${record.title}"`,
        link: '/tasks'
      });
      if (await isEmailNotificationEnabled(record.organization_id, 'notify_task_transfer')) {
        emails.push({
          to: target.email,
          subject: `A task has been offered to you: ${record.title}`,
          html: emailShell(
            'Task transfer offered',
            `You've been offered <strong>${escapeHtml(record.title)}</strong> in ShelfSync. Accept it to add it to your queue.`,
            'View task',
            `${APP_URL}/tasks`
          )
        });
      }
    }
  }

  return { emails, notifications };
}

async function resultForRetirementRequest(payload: WebhookPayload): Promise<EventResult> {
  const record = payload.record as { name: string; status: string; organization_id: string } | null;
  if (!record || payload.type !== 'UPDATE' || record.status !== 'retirement_pending') {
    return EMPTY_RESULT;
  }

  const recipients = await orgProfilesByRole(record.organization_id, ['admin', 'manager']);
  const notifications: NotificationToInsert[] = recipients.map(recipient => ({
    organization_id: record.organization_id,
    user_id: recipient.id,
    kind: 'retirement_request',
    message: `"${record.name}" has a pending retirement request`,
    link: '/manage/inventory'
  }));

  let emails: EmailToSend[] = [];
  if (await isEmailNotificationEnabled(record.organization_id, 'notify_retirement_request')) {
    emails = recipients.map(recipient => ({
      to: recipient.email,
      subject: `Retirement request needs approval: ${record.name}`,
      html: emailShell(
        'Retirement request needs approval',
        `<strong>${escapeHtml(record.name)}</strong> has a pending retirement request waiting for your review.`,
        'Review request',
        `${APP_URL}/manage/inventory`
      )
    }));
  }

  return { emails, notifications };
}

async function resultForJoinRequest(payload: WebhookPayload): Promise<EventResult> {
  const record = payload.record as
    { email: string; full_name: string | null; nickname: string | null; membership_status: string; organization_id: string } | null;
  if (!record || payload.type !== 'INSERT' || record.membership_status !== 'pending') {
    return EMPTY_RESULT;
  }

  const recipients = await orgProfilesByRole(record.organization_id, ['admin']);
  const requesterLabel = record.nickname || record.full_name || record.email;
  const notifications: NotificationToInsert[] = recipients.map(recipient => ({
    organization_id: record.organization_id,
    user_id: recipient.id,
    kind: 'join_request',
    message: `${requesterLabel} wants to join your organization`,
    link: '/manage/team'
  }));

  let emails: EmailToSend[] = [];
  if (await isEmailNotificationEnabled(record.organization_id, 'notify_join_request')) {
    emails = recipients.map(recipient => ({
      to: recipient.email,
      subject: `${requesterLabel} wants to join your organization`,
      html: emailShell(
        'New join request',
        `<strong>${escapeHtml(requesterLabel)}</strong> (${escapeHtml(record.email)}) has requested to join your organization on ShelfSync.`,
        'Review request',
        `${APP_URL}/manage/team`
      )
    }));
  }

  return { emails, notifications };
}

/** Feedback always sends — there's no per-org "Email notifications" toggle
 *  to check (see FEEDBACK_TO_ADDRESS's own comment for why: the recipient
 *  isn't an org member, so none of Settings > Workflow's org-scoped toggles
 *  apply here), and no notifications row either, since nobody in the app
 *  ever reads this back. Org name and the submitter's name/email are looked
 *  up here rather than carried on the row itself, mirroring how every other
 *  handler above resolves recipient labels from `profiles` rather than
 *  trusting anything the client could have sent directly. */
async function resultForFeedback(payload: WebhookPayload): Promise<EventResult> {
  const record = payload.record as
    { organization_id: string; user_id: string | null; type: string; message: string } | null;
  if (!record || payload.type !== 'INSERT') {
    return EMPTY_RESULT;
  }

  const [{ data: org }, submitter] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', record.organization_id).maybeSingle(),
    profileEmail(record.user_id)
  ]);

  const orgName = org?.name ?? 'Unknown organization';
  const personLabel = submitter?.label ?? 'Unknown user';
  const personEmail = submitter?.email ?? 'unknown';
  const typeLabel = FEEDBACK_TYPE_LABELS[record.type] ?? record.type;

  return {
    emails: [{
      to: FEEDBACK_TO_ADDRESS,
      // Standardized shape — same "<kind>: <type> — <org> (<person>)" every
      // time — so these are easy to scan/search/filter in an inbox
      // regardless of what the message itself says.
      subject: `New feedback: ${typeLabel} — ${orgName} (${personLabel})`,
      html: emailShell(
        'New feedback submitted',
        `<strong>${escapeHtml(typeLabel)}</strong> from ${escapeHtml(personLabel)} (${escapeHtml(personEmail)}) ` +
          `at <strong>${escapeHtml(orgName)}</strong>:<br><br>${escapeHtml(record.message).replaceAll('\n', '<br>')}`,
        'Open ShelfSync',
        APP_URL
      )
    }],
    notifications: []
  };
}
