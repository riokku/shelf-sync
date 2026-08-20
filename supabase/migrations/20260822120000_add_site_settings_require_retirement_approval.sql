-- Lets an admin turn off the second-approver step in the retirement
-- workflow, via Customize's new "Workflow" tab. Default true preserves
-- today's behavior exactly (request -> retirement_pending -> approve/
-- decline) for every existing org. No RLS/grant changes needed: same
-- reasoning as inventory_table_columns/inventory_form_fields — site_settings'
-- UPDATE policy is already a flat, non-column-scoped "admin of own org"
-- check, so a new plain column rides along under it.
alter table public.site_settings
  add column require_retirement_approval boolean not null default true;

-- request_item_retirement(): when the toggle is off, skip straight to
-- 'retired' instead of 'retirement_pending' — approve_item_retirement/
-- decline_item_retirement/cancel_item_retirement_request are unchanged and
-- simply never reached on this path. Diffed against the previous version in
-- 20260820130000_add_activity_log.sql (the org-null-safety guard and the
-- activity_log insert it added) before making this change, per that
-- migration's own "diff against the previous version" lesson.
create or replace function public.request_item_retirement(item_id uuid, note text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_require_approval boolean;
begin
  select * into v_item from public.inventory_items where id = item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'item not found';
  end if;

  if v_item.status != 'active' then
    raise exception 'item is not active';
  end if;

  if v_item.quantity_remaining != 0 then
    raise exception 'item still has stock remaining';
  end if;

  select require_retirement_approval into v_require_approval
    from public.site_settings where organization_id = v_item.organization_id;
  v_require_approval := coalesce(v_require_approval, true);

  if v_require_approval then
    update public.inventory_items
      set status = 'retirement_pending',
        retirement_requested_by = auth.uid(),
        retirement_requested_at = now(),
        retirement_request_note = note
      where id = item_id;

    insert into public.inventory_item_activity (item_id, user_id, message)
      values (
        item_id,
        auth.uid(),
        case when note is null or note = ''
          then 'Requested retirement'
          else 'Requested retirement. Reason: ' || note
        end
      );

    insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
      values (
        v_item.organization_id,
        auth.uid(),
        'inventory_item',
        item_id,
        v_item.name || ': ' || case when note is null or note = ''
          then 'Requested retirement'
          else 'Requested retirement. Reason: ' || note
        end
      );
  else
    update public.inventory_items
      set status = 'retired',
        retirement_requested_by = auth.uid(),
        retirement_requested_at = now(),
        retirement_request_note = note,
        retired_by = auth.uid(),
        retired_at = now()
      where id = item_id;

    insert into public.inventory_item_activity (item_id, user_id, message)
      values (
        item_id,
        auth.uid(),
        'Retired item (approval not required)' || case when note is null or note = ''
          then ''
          else '. Reason: ' || note
        end
      );

    insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
      values (
        v_item.organization_id,
        auth.uid(),
        'inventory_item',
        item_id,
        v_item.name || ': Retired (approval not required)' || case when note is null or note = ''
          then ''
          else '. Reason: ' || note
        end
      );
  end if;
end;
$$;
