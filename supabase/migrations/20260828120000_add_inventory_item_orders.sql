-- Supplier ordering: admins/managers can place a restock order for an item
-- against its linked supplier ("Reorder" in ModalTableComponent's new
-- Orders tab), then later mark it received or cancel it. One order = one
-- item + one quantity (not a multi-item purchase order) — the simpler shape
-- matches this app's other per-item action patterns (retirement requests,
-- containers) rather than a cart-style multi-line PO.
--
-- supplier_name is a denormalized snapshot of the supplier's name at order
-- time, captured alongside the nullable supplier_id FK — an order should
-- still read correctly if its supplier is later renamed or removed from the
-- directory (on delete set null), same "outlive the thing it references"
-- reasoning checked_out_to/retirement_requested_by already apply via their
-- own on delete set null, just with an extra text snapshot here since the
-- supplier's *name*, not just its existence, matters for display.
create table public.inventory_item_orders (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  supplier_name text not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'ordered' check (status in ('ordered', 'received', 'cancelled')),
  note text,
  ordered_by uuid references public.profiles (id) on delete set null,
  ordered_at timestamptz not null default now(),
  received_by uuid references public.profiles (id) on delete set null,
  received_at timestamptz
);

create index inventory_item_orders_item_id_idx on public.inventory_item_orders (item_id);

alter table public.inventory_item_orders enable row level security;

-- Any org member can see an item's order history (same read breadth as
-- inventory_item_activity/containers/images), joined through to the parent
-- item for org scoping rather than the no-join `using (true)` those tables
-- originally shipped with (see add_inventory_item_locking's own retrofit of
-- that gap on inventory_item_containers) — this table starts with the join
-- from day one instead of needing a follow-up fix.
create policy "Authenticated users can view inventory item orders"
  on public.inventory_item_orders for select
  to authenticated
  using (
    exists (
      select 1 from public.inventory_items i
      where i.id = inventory_item_orders.item_id
        and i.organization_id = public.current_user_org_id()
    )
  );

-- Admin/manager only — ordering has a real financial cost, same trust level
-- as inventory_items' own insert policy (item creation) rather than the
-- wider any-authenticated-user reach containers/images editing has. No
-- is_locked check needed here (unlike containers' own CUD policies): an
-- admin/manager already bypasses is_locked in every other check that has
-- one, and only admin/manager can reach this policy at all.
create policy "Admins and managers can place inventory item orders"
  on public.inventory_item_orders for insert
  to authenticated
  with check (
    public.current_user_role() in ('admin', 'manager')
    and status = 'ordered'
    and exists (
      select 1 from public.inventory_items i
      where i.id = inventory_item_orders.item_id
        and i.organization_id = public.current_user_org_id()
    )
  );

-- No update/delete policy for `authenticated` at all — status only ever
-- moves ordered -> received/cancelled through the two SECURITY DEFINER
-- RPCs below (receiving also has to atomically touch inventory_items'
-- quantity columns, which a plain RLS policy can't do), and the row is
-- otherwise a permanent audit trail, same append-only shape activity_log/
-- inventory_item_activity already have.

create or replace function public.cancel_inventory_item_order(order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.inventory_item_orders;
  v_item public.inventory_items;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can cancel an order';
  end if;

  select * into v_order from public.inventory_item_orders where id = order_id;
  if v_order is null then
    raise exception 'order not found';
  end if;

  select * into v_item from public.inventory_items where id = v_order.item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'order not found';
  end if;

  if v_order.status != 'ordered' then
    raise exception 'order is not awaiting receipt';
  end if;

  update public.inventory_item_orders set status = 'cancelled' where id = order_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (v_item.id, auth.uid(), format('Cancelled order of %s units from %s', v_order.quantity, v_order.supplier_name));
end;
$$;

grant execute on function public.cancel_inventory_item_order(uuid) to authenticated;

-- Auto-restocks quantity_remaining/quantity_total by the ordered amount,
-- but only for a flat-tracked item (no containers) — a container-tracked
-- item's new stock needs a location assigned to a specific box, which this
-- can't safely guess, so those items just get a prompt in the activity log
-- to add a container instead (same "derived once containers exist" rule
-- ModalTableComponent's edit flow already enforces for these two columns).
create or replace function public.receive_inventory_item_order(order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.inventory_item_orders;
  v_item public.inventory_items;
  v_has_containers boolean;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can mark an order received';
  end if;

  select * into v_order from public.inventory_item_orders where id = order_id;
  if v_order is null then
    raise exception 'order not found';
  end if;

  select * into v_item from public.inventory_items where id = v_order.item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'order not found';
  end if;

  if v_order.status != 'ordered' then
    raise exception 'order is not awaiting receipt';
  end if;

  update public.inventory_item_orders
    set status = 'received', received_by = auth.uid(), received_at = now()
    where id = order_id;

  select exists (
    select 1 from public.inventory_item_containers where item_id = v_item.id
  ) into v_has_containers;

  if not v_has_containers then
    update public.inventory_items
      set quantity_remaining = quantity_remaining + v_order.quantity,
        quantity_total = quantity_total + v_order.quantity
      where id = v_item.id;

    insert into public.inventory_item_activity (item_id, user_id, message)
      values (v_item.id, auth.uid(), format('Received order of %s units from %s — stock updated', v_order.quantity, v_order.supplier_name));
  else
    insert into public.inventory_item_activity (item_id, user_id, message)
      values (v_item.id, auth.uid(), format('Received order of %s units from %s — add a container to reflect the new stock', v_order.quantity, v_order.supplier_name));
  end if;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_item.organization_id, auth.uid(), 'inventory_item', v_item.id,
      format('%s: Received order of %s units from %s', v_item.name, v_order.quantity, v_order.supplier_name)
    );
end;
$$;

grant execute on function public.receive_inventory_item_order(uuid) to authenticated;
