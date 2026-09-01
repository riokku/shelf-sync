-- complete_inventory_audit() was admin/manager-only outright, regardless of
-- how much of the audit was actually counted — appropriate when completing
-- means exercising judgment about leaving discrepancies/uncounted items
-- unresolved (see this table's own top-of-file comment: "a manager might
-- deliberately choose not to trust a particular count"), but that judgment
-- call doesn't exist once every item already has a submitted count — at
-- that point completing is purely mechanical, the same staff-level trust
-- submit_audit_count() itself already extends to counting in the first
-- place. So: an admin/manager can still complete anytime, same as before;
-- any other approved org member can only complete once nothing in the
-- audit is left uncounted.
--
-- Diffed against this function's only previous version
-- (20260920120000_add_inventory_audits.sql) per this repo's own "diff
-- against the previous version" rule — the org-scoping/not-found/
-- not-in-progress checks above the role check are otherwise unchanged.
create or replace function public.complete_inventory_audit(audit_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_audit public.inventory_audits;
  v_uncounted_count integer;
begin
  select * into v_audit from public.inventory_audits where id = audit_id;
  if v_audit is null or public.current_user_org_id() is null or v_audit.organization_id != public.current_user_org_id() then
    raise exception 'audit not found';
  end if;

  if v_audit.status != 'in_progress' then
    raise exception 'this audit is not in progress';
  end if;

  select count(*) into v_uncounted_count
    from public.inventory_audit_counts
    where audit_id = v_audit.id and counted_quantity is null;

  if v_uncounted_count > 0 and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can complete an audit with items still uncounted';
  end if;

  update public.inventory_audits
    set status = 'completed', completed_by = auth.uid(), completed_at = now()
    where id = audit_id;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_audit.organization_id, auth.uid(), 'inventory_audit', audit_id, 'Completed an inventory audit');
end;
$$;

grant execute on function public.complete_inventory_audit(uuid) to authenticated;
