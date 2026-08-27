-- Feedback had no review workflow at all (add_feedback.sql) — every
-- submission just sat there until someone happened to read the email.
-- Backs StudioFeedbackComponent's "Mark reviewed"/"Mark resolved" actions.
alter table public.feedback add column status text not null default 'new'
  check (status in ('new', 'reviewed', 'resolved'));
alter table public.feedback add column reviewed_by uuid references public.profiles (id) on delete set null;
alter table public.feedback add column reviewed_at timestamptz;

-- feedback never had an UPDATE grant at all before this (only INSERT — see
-- add_feedback.sql), so no revoke is needed first, unlike
-- add_inventory_item_retirement's identical-in-spirit column-scoped grant
-- on inventory_items. Column-scoped so even a platform admin can't rewrite
-- the original type/message through this path.
grant update (status, reviewed_by, reviewed_at) on public.feedback to authenticated;

create policy "Platform admins can update feedback status"
  on public.feedback for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
