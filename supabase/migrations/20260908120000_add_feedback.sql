-- Lets any signed-in user send free-form feedback (a bug report, a feature
-- request, or general feedback) straight to the app's own maintainer —
-- backs a new "Send feedback" button on /help (FeedbackModalComponent).
-- Unlike every other event this app emails about (see
-- add_notification_email_webhooks), the recipient here isn't another org
-- member — it's a fixed, out-of-band address (chris@studiorioconsulting.com,
-- hardcoded in the Edge Function itself, same as APP_URL/FROM_ADDRESS
-- already are) — so this table has no in-app reader at all, org-scoped or
-- otherwise: no SELECT policy for `authenticated`, and no accompanying
-- `notifications` row the way task/retirement/join events get (that table's
-- own `kind` check constraint doesn't need a fifth value for something
-- nobody in the app ever reads back). A candid bug report or complaint
-- shouldn't be visible to the rest of the org either, which a SELECT policy
-- scoped to admins/managers would otherwise invite.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  -- Same default-to-caller's-org technique activity_log/inventory_items/
  -- tasks already use, so a plain client insert never needs to pass this
  -- explicitly — see activity_log's own doc comment for the full reasoning
  -- (and why a pending/soft-deleted-org caller is naturally blocked: this
  -- resolves to null for them, which the not-null constraint below rejects).
  organization_id uuid not null references public.organizations (id) on delete cascade
    default public.current_user_org_id(),
  -- on delete set null (not cascade) — feedback should outlive the person
  -- who sent it being later removed, same reasoning inventory_item_activity/
  -- activity_log's own actor columns already use.
  user_id uuid references public.profiles (id) on delete set null,
  type text not null check (type in ('bug', 'feature_request', 'general', 'other')),
  message text not null check (length(trim(message)) > 0),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Any approved org member can send feedback, self-attributed only — same
-- shape as inventory_item_activity/activity_log's own insert policies.
-- Deliberately not gated to admin/manager: anyone using the app should be
-- able to report a bug or ask for a feature.
create policy "Authenticated users can submit their own feedback"
  on public.feedback for insert
  to authenticated
  with check (user_id = auth.uid() and organization_id = public.current_user_org_id());

-- No select/update/delete policy for any role — see this table's own
-- top-of-file comment for why. The maintainer reads submissions via
-- Supabase Studio (which bypasses RLS entirely) or, in practice, the email
-- notification below.

-- Reuses call_notification_webhook() unchanged (see
-- add_notification_email_webhooks) — it already posts tg_table_name/
-- record generically, so send-notification-email just needs a new branch
-- for payload.table === 'feedback', not a new trigger function. No `when`
-- clause needed, unlike that migration's other triggers — every insert
-- here is worth emailing about, there's no irrelevant transition to filter.
create trigger notify_on_feedback_submitted
  after insert on public.feedback
  for each row
  execute function public.call_notification_webhook();
