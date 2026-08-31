-- apply_audit_count() (20260920120000_add_inventory_audits.sql) had no
-- guard against being called twice on the same already-applied row —
-- clicking "Apply" a second time (a double-click, a stale render after a
-- realtime reload, retrying a slow request) would shift
-- quantity_remaining/quantity_total by the same delta again, silently
-- corrupting the item's stock. Caught before this shipped to any real
-- client code. create or replace here is diffed against that same
-- migration's version (the only one that's ever existed) — adds exactly
-- one check, nothing else changed.
create or replace function public.apply_audit_count(audit_count_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_count public.inventory_audit_counts;
  v_audit public.inventory_audits;
  v_item public.inventory_items;
  v_has_containers boolean;
  v_delta integer;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can apply an audit count';
  end if;

  select * into v_count from public.inventory_audit_counts where id = audit_count_id;
  if v_count is null then
    raise exception 'audit count row not found';
  end if;

  select * into v_audit from public.inventory_audits where id = v_count.audit_id;
  if v_audit is null or public.current_user_org_id() is null or v_audit.organization_id != public.current_user_org_id() then
    raise exception 'audit not found';
  end if;

  if v_audit.status != 'in_progress' then
    raise exception 'this audit is no longer in progress';
  end if;

  if v_count.counted_quantity is null then
    raise exception 'this item has not been counted yet';
  end if;

  if v_count.applied_at is not null then
    raise exception 'this count has already been applied';
  end if;

  select * into v_item from public.inventory_items where id = v_count.item_id;
  if v_item is null then
    raise exception 'item not found';
  end if;

  select exists (
    select 1 from public.inventory_item_containers where item_id = v_item.id
  ) into v_has_containers;

  if v_has_containers then
    raise exception 'this item is tracked by container — adjust its boxes directly instead';
  end if;

  v_delta := v_count.counted_quantity - v_count.expected_quantity;

  update public.inventory_items
    set quantity_remaining = quantity_remaining + v_delta,
      quantity_total = quantity_total + v_delta
    where id = v_item.id;

  update public.inventory_audit_counts
    set applied_by = auth.uid(), applied_at = now()
    where id = audit_count_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (
      v_item.id, auth.uid(),
      format('Applied inventory audit count: expected %s, counted %s (adjusted by %s%s)',
        v_count.expected_quantity, v_count.counted_quantity,
        case when v_delta > 0 then '+' else '' end, v_delta)
    );

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_item.organization_id, auth.uid(), 'inventory_item', v_item.id,
      format('%s: Applied inventory audit count (expected %s, counted %s)',
        v_item.name, v_count.expected_quantity, v_count.counted_quantity)
    );
end;
$$;

grant execute on function public.apply_audit_count(uuid) to authenticated;
