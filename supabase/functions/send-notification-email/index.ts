// Called by four Database Webhook triggers (see the
// add_notification_email_webhooks migration) whenever a row this app cares
// about changes in a way worth emailing someone about: a task gets directly
// assigned or a transfer gets offered, an item's retirement request needs
// approval, or someone's join request needs approval. Each trigger has its
// own `when (...)` clause scoping it to exactly that transition, so this
// function can mostly trust that if it's been called, the payload is
// relevant — it still re-checks defensively before sending anything.
//
// Authenticated via a shared secret (Vault-stored on the Postgres side, an
// Edge Function secret here) rather than the far more powerful
// service_role key, which this function *does* use internally (Supabase
// injects it automatically into every Edge Function) once a call has
// already passed that check — a raw trigger definition can't read Vault at
// definition time, only a plain string literal, so embedding the
// service_role key directly there would mean committing it to the repo.
// This shared secret is deliberately low-privilege instead: its only power
// is "can invoke this one function", not "can bypass every RLS policy".
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

Deno.serve(async req => {
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json() as WebhookPayload;

  let emails: EmailToSend[] = [];
  try {
    if (payload.table === 'tasks') {
      emails = await emailsForTaskChange(payload);
    } else if (payload.table === 'inventory_items') {
      emails = await emailsForRetirementRequest(payload);
    } else if (payload.table === 'profiles') {
      emails = await emailsForJoinRequest(payload);
    }
  } catch (error) {
    // A bug building the email shouldn't turn into Supabase retrying the
    // webhook delivery forever — log and return 200 either way, same
    // "best effort, never block the thing that triggered it" reasoning
    // this app's own client-side activity logging already follows.
    console.error('Failed to build notification email(s):', error);
    return new Response('OK', { status: 200 });
  }

  await Promise.all(emails.map(sendEmail));

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

async function profileEmail(id: string | null | undefined): Promise<{ email: string; label: string } | null> {
  if (!id) {
    return null;
  }
  const { data } = await supabase.from('profiles').select('email, full_name, nickname').eq('id', id).maybeSingle();
  if (!data) {
    return null;
  }
  return { email: data.email, label: data.nickname || data.full_name || data.email };
}

/** Same nickname -> full_name -> email fallback profileDisplayName() uses
 *  client-side, and the same audience a given approval action actually
 *  needs — admin-only for join requests (admin_approve_member() is
 *  admin-only), admin-or-manager for retirement (either can
 *  approve/decline) — not every approved member of the org. */
async function orgEmailsByRole(organizationId: string, roles: string[]): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('email')
    .eq('organization_id', organizationId)
    .eq('membership_status', 'approved')
    .in('role', roles);
  return (data ?? []).map(row => row.email as string);
}

async function emailsForTaskChange(payload: WebhookPayload): Promise<EmailToSend[]> {
  const record = payload.record as { title: string; assigned_to: string | null; pending_transfer_to: string | null } | null;
  const oldRecord = payload.old_record as { pending_transfer_to: string | null } | null;
  if (!record) {
    return [];
  }

  const emails: EmailToSend[] = [];

  if (payload.type === 'INSERT' && record.assigned_to) {
    const assignee = await profileEmail(record.assigned_to);
    if (assignee) {
      emails.push({
        to: assignee.email,
        subject: `You've been assigned a task: ${record.title}`,
        html: emailShell(
          'New task assigned to you',
          `You've been assigned <strong>${record.title}</strong> in ShelfSync.`,
          'View task',
          `${APP_URL}/tasks`
        )
      });
    }
  }

  if (payload.type === 'UPDATE' && record.pending_transfer_to && record.pending_transfer_to !== oldRecord?.pending_transfer_to) {
    const target = await profileEmail(record.pending_transfer_to);
    if (target) {
      emails.push({
        to: target.email,
        subject: `A task has been offered to you: ${record.title}`,
        html: emailShell(
          'Task transfer offered',
          `You've been offered <strong>${record.title}</strong> in ShelfSync. Accept it to add it to your queue.`,
          'View task',
          `${APP_URL}/tasks`
        )
      });
    }
  }

  return emails;
}

async function emailsForRetirementRequest(payload: WebhookPayload): Promise<EmailToSend[]> {
  const record = payload.record as { name: string; status: string; organization_id: string } | null;
  if (!record || payload.type !== 'UPDATE' || record.status !== 'retirement_pending') {
    return [];
  }

  const recipients = await orgEmailsByRole(record.organization_id, ['admin', 'manager']);
  return recipients.map(email => ({
    to: email,
    subject: `Retirement request needs approval: ${record.name}`,
    html: emailShell(
      'Retirement request needs approval',
      `<strong>${record.name}</strong> has a pending retirement request waiting for your review.`,
      'Review request',
      `${APP_URL}/manage/inventory`
    )
  }));
}

async function emailsForJoinRequest(payload: WebhookPayload): Promise<EmailToSend[]> {
  const record = payload.record as
    { email: string; full_name: string | null; nickname: string | null; membership_status: string; organization_id: string } | null;
  if (!record || payload.type !== 'INSERT' || record.membership_status !== 'pending') {
    return [];
  }

  const recipients = await orgEmailsByRole(record.organization_id, ['admin']);
  const requesterLabel = record.nickname || record.full_name || record.email;
  return recipients.map(email => ({
    to: email,
    subject: `${requesterLabel} wants to join your organization`,
    html: emailShell(
      'New join request',
      `<strong>${requesterLabel}</strong> (${record.email}) has requested to join your organization on ShelfSync.`,
      'Review request',
      `${APP_URL}/manage/team`
    )
  }));
}
