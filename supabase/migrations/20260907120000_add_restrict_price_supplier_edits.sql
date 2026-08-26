-- Lets an admin restrict who can change an inventory item's price/supplier,
-- via Settings > Workflow's new "Price & supplier edits" section. Default
-- false preserves every existing org's current behavior exactly (any
-- signed-in user can edit any inventory_items field via the widened grant
-- add_inventory_item_activity_and_edit_access established) — this is an
-- opt-in tightening, not a new restriction anyone gets by surprise.
alter table public.site_settings
  add column restrict_price_supplier_edits boolean not null default false;

-- No column-scoped grant needed for the new setting column itself: same
-- reasoning every other site_settings column addition already gives —
-- its UPDATE policy is a flat, non-column-scoped "admin of own org" check,
-- so a new plain column just rides along under it.

-- inventory_items.price_per_unit/price_per_container/supplier_id stay in
-- the existing any-authenticated-user column grant either way (this
-- toggle doesn't change *who can attempt* the write, only whether it's
-- allowed to go through) — a flat Postgres GRANT can't express "staff can
-- write column X only when some other table's flag is false," the same
-- "Important RLS constraint" this schema already hits for role/
-- membership_status/is_locked. Unlike those, though, this needs an old-vs-
-- new value *comparison* (not just "what's the new value"), which a plain
-- RLS `with check` can't do without a fragile self-referencing subquery —
-- a BEFORE UPDATE trigger gets clean OLD/NEW access instead.
create or replace function public.enforce_price_supplier_edit_restriction()
returns trigger
language plpgsql
as $$
declare
  v_restricted boolean;
begin
  if public.current_user_role() in ('admin', 'manager') then
    return new;
  end if;

  select restrict_price_supplier_edits into v_restricted
    from public.site_settings where organization_id = new.organization_id;
  v_restricted := coalesce(v_restricted, false);

  if not v_restricted then
    return new;
  end if;

  if new.price_per_unit is distinct from old.price_per_unit
     or new.price_per_container is distinct from old.price_per_container
     or new.supplier_id is distinct from old.supplier_id then
    raise exception 'Editing price or supplier requires manager or admin access';
  end if;

  return new;
end;
$$;

create trigger enforce_price_supplier_edit_restriction
  before update on public.inventory_items
  for each row
  execute function public.enforce_price_supplier_edit_restriction();
