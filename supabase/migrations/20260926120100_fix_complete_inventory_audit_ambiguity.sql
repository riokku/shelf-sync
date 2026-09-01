-- Same-day follow-up to 20260926120000_allow_staff_complete_fully_counted_audit.sql,
-- caught live ("column reference \"audit_id\" is ambiguous") before this
-- shipped further: that migration's own new uncounted-count query
--
--   select count(*) into v_uncounted_count
--     from public.inventory_audit_counts
--     where audit_id = v_audit.id and counted_quantity is null;
--
-- left `audit_id` unqualified on the left-hand side of the comparison —
-- and this function's own parameter is *also* named `audit_id`, in scope
-- as a plpgsql variable for the whole function body. A bare `audit_id`
-- inside a query matches both the inventory_audit_counts column (via the
-- FROM clause) and the outer parameter, and plpgsql's default
-- `variable_conflict = error` setting refuses to silently pick one rather
-- than guessing wrong, so this failed every time it actually ran. Fixed by
-- aliasing the table and qualifying both column references — `v_audit.id`
-- on the right-hand side was already unambiguous (a record field, not a
-- bare identifier competing with anything), so this only needed the left
-- side qualified.
--
-- Diffed against that same migration's version (the only one that's ever
-- existed) per this repo's own "diff against the previous version" rule —
-- nothing else in the function changed. Worth remembering alongside this
-- repo's other same-day-caught ambiguity lessons
-- (fix_platform_organization_usage_ambiguity): a migration push succeeding
-- is not enough signal that a new/changed function body is correct — a
-- parameter name that happens to match a column name it queries against is
-- easy to miss on review and only surfaces once the function actually
-- runs.
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
    from public.inventory_audit_counts iac
    where iac.audit_id = v_audit.id and iac.counted_quantity is null;

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
