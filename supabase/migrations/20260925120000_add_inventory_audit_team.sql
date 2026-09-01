-- Lets one or more org members claim responsibility for an in-progress
-- inventory audit: a single "lead" plus any number of "support" members.
-- Purely organizational — neither changes what anyone is actually allowed
-- to do (counting/applying/completing are all still gated exactly as
-- before), this just answers "who owns finishing this."
--
-- lead_id is a plain nullable FK directly on inventory_audits (same
-- on delete set null shape started_by/completed_by/cancelled_by already
-- use — losing the profile just clears the claim, doesn't touch the audit
-- itself). Support is many-to-many, so it's a child table rather than a
-- second FK column — same real-FK-cascades-cleanly shape
-- broadcast_references already established for its own member references,
-- not an unenforced uuid[].
alter table public.inventory_audits
  add column lead_id uuid references public.profiles (id) on delete set null;

create table public.inventory_audit_supporters (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.inventory_audits (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  unique (audit_id, user_id)
);

create index inventory_audit_supporters_audit_id_idx on public.inventory_audit_supporters (audit_id);

alter table public.inventory_audit_supporters enable row level security;

-- Same join-through-to-the-parent-audit shape inventory_audit_counts'
-- own SELECT policy already established.
create policy "Authenticated users can view inventory audit supporters"
  on public.inventory_audit_supporters for select
  to authenticated
  using (
    exists (
      select 1 from public.inventory_audits a
      where a.id = inventory_audit_supporters.audit_id
        and a.organization_id = public.current_user_org_id()
    )
  );

-- No insert/update/delete policy for `authenticated` — set_audit_team()
-- below is the only way this table (or inventory_audits.lead_id) changes.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_audit_supporters'
  ) then
    alter publication supabase_realtime add table public.inventory_audit_supporters;
  end if;
end $$;

alter table public.inventory_audit_supporters replica identity full;

-- Sets (or clears) an in-progress audit's lead/support in one call — no
-- role check beyond org membership, same staff-level trust
-- submit_audit_count() already established: this is meant to be
-- self-claimable ("I've got this one") by any approved member, not an
-- admin/manager-only assignment. p_support_ids is the full replacement set
-- (not an add/remove delta) — simpler for a caller re-submitting a
-- mat-select's whole current selection, same shape create_broadcast()'s own
-- reference arrays already use.
--
-- A lead can't also be listed as support (the client-side dropdown already
-- excludes the current lead from the support list, but this strips it
-- server-side too rather than trusting that alone — same "the client hint
-- is UX only, the server is what actually enforces it" precedent this
-- schema's column-scoped grants already follow elsewhere) and every
-- support id is silently dropped unless it resolves to an approved member
-- of this audit's own org, rather than rejecting the whole call over one
-- bad id.
create or replace function public.set_audit_team(
  p_audit_id uuid,
  p_lead_id uuid default null,
  p_support_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_audit public.inventory_audits;
  v_support_ids uuid[];
  v_lead_label text;
  v_support_label text;
begin
  select * into v_audit from public.inventory_audits where id = p_audit_id;
  if v_audit is null or public.current_user_org_id() is null or v_audit.organization_id != public.current_user_org_id() then
    raise exception 'audit not found';
  end if;

  if v_audit.status != 'in_progress' then
    raise exception 'this audit is no longer in progress';
  end if;

  if p_lead_id is not null and not exists (
    select 1 from public.profiles
    where id = p_lead_id and organization_id = v_audit.organization_id and membership_status = 'approved'
  ) then
    raise exception 'lead must be an approved member of this organization';
  end if;

  update public.inventory_audits set lead_id = p_lead_id where id = p_audit_id;

  delete from public.inventory_audit_supporters where audit_id = p_audit_id;

  insert into public.inventory_audit_supporters (audit_id, user_id)
    select p_audit_id, p.id
    from public.profiles p
    where p.id = any (coalesce(p_support_ids, '{}'))
      and p.organization_id = v_audit.organization_id
      and p.membership_status = 'approved'
      and p.id is distinct from p_lead_id;

  select array_agg(user_id) into v_support_ids from public.inventory_audit_supporters where audit_id = p_audit_id;

  v_lead_label := case when p_lead_id is null then 'nobody' else public.profile_display_name(p_lead_id) end;
  select string_agg(public.profile_display_name(uid), ', ') into v_support_label from unnest(v_support_ids) as uid;
  v_support_label := coalesce(v_support_label, 'nobody');

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_audit.organization_id, auth.uid(), 'inventory_audit', p_audit_id,
      format('Set audit team — lead: %s; support: %s', v_lead_label, v_support_label)
    );
end;
$$;

grant execute on function public.set_audit_team(uuid, uuid, uuid[]) to authenticated;
