-- Pre-made "kits" of specific items+quantities that speed up placing a
-- multi-item reservation (e.g. a "Wedding package" kit of 50 chairs + 10
-- tables + 20 linens) — selecting one in PlaceReservationModalComponent just
-- prefills the item/quantity lines, which stay fully editable afterward (add,
-- remove, change quantities) before the reservation is actually placed; this
-- table only ever holds the *template*, never a placed reservation itself
-- (see 20260927120100_add_reservation_group_id.sql for how several items
-- placed together, from a kit or picked by hand, get linked afterward).
--
-- Same "org-scoped directory, admin/manager curate it, any approved member
-- reads/picks from it" shape the supplier directory already established
-- (20260827120000_add_supplier_directory.sql) — mirrored almost verbatim,
-- including no created_by column (suppliers has none either; release_notes'
-- own reasoning for omitting it — a single-platform-admin audience — doesn't
-- apply here, this just stays consistent with the directory it most
-- resembles).
create table public.reservation_kits (
  id uuid primary key default gen_random_uuid(),
  -- Same default-to-caller's-org technique suppliers/inventory_items/tasks
  -- already use, so a plain client insert never needs to pass this.
  organization_id uuid not null references public.organizations (id) on delete cascade
    default public.current_user_org_id(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create trigger set_reservation_kits_updated_at
  before update on public.reservation_kits
  for each row
  execute function public.set_updated_at();

alter table public.reservation_kits enable row level security;

-- Any org member can read the directory (needed for the "Load from kit"
-- picker in PlaceReservationModalComponent), but only admin/manager can
-- curate it — same "any authenticated user picks from an admin/manager-
-- curated list" shape suppliers' own policies already establish.
create policy "Users can view their organization's reservation kits"
  on public.reservation_kits for select
  to authenticated
  using (organization_id = public.current_user_org_id());

create policy "Admins and managers can insert reservation kits for their organization"
  on public.reservation_kits for insert
  to authenticated
  with check (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

create policy "Admins and managers can update reservation kits for their organization"
  on public.reservation_kits for update
  to authenticated
  using (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  )
  with check (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

create policy "Admins and managers can delete reservation kits for their organization"
  on public.reservation_kits for delete
  to authenticated
  using (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

-- Child table — one row per item in a kit. No organization_id of its own,
-- same shape inventory_item_containers/inventory_item_orders/
-- inventory_item_discards/broadcast_references already use: org isolation
-- comes from the kit_id join, not a flat column of its own. Reservation kits
-- are meant as small, hand-curated lists (a handful of items), so an edit
-- replaces the whole set in one go rather than diffing — see
-- ReservationKitService.update()'s own doc comment, the same "resubmit the
-- whole set" simplicity set_audit_team() already established for its own
-- multi-select.
create table public.reservation_kit_items (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.reservation_kits (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  unique (kit_id, item_id)
);

create index reservation_kit_items_kit_id_idx on public.reservation_kit_items (kit_id);

alter table public.reservation_kit_items enable row level security;

create policy "Users can view their organization's reservation kit items"
  on public.reservation_kit_items for select
  to authenticated
  using (
    exists (
      select 1 from public.reservation_kits k
      where k.id = reservation_kit_items.kit_id
        and k.organization_id = public.current_user_org_id()
    )
  );

create policy "Admins and managers can insert reservation kit items"
  on public.reservation_kit_items for insert
  to authenticated
  with check (
    public.current_user_role() in ('admin', 'manager')
    and exists (
      select 1 from public.reservation_kits k
      where k.id = reservation_kit_items.kit_id
        and k.organization_id = public.current_user_org_id()
    )
  );

create policy "Admins and managers can update reservation kit items"
  on public.reservation_kit_items for update
  to authenticated
  using (
    public.current_user_role() in ('admin', 'manager')
    and exists (
      select 1 from public.reservation_kits k
      where k.id = reservation_kit_items.kit_id
        and k.organization_id = public.current_user_org_id()
    )
  )
  with check (
    public.current_user_role() in ('admin', 'manager')
    and exists (
      select 1 from public.reservation_kits k
      where k.id = reservation_kit_items.kit_id
        and k.organization_id = public.current_user_org_id()
    )
  );

create policy "Admins and managers can delete reservation kit items"
  on public.reservation_kit_items for delete
  to authenticated
  using (
    public.current_user_role() in ('admin', 'manager')
    and exists (
      select 1 from public.reservation_kits k
      where k.id = reservation_kit_items.kit_id
        and k.organization_id = public.current_user_org_id()
    )
  );
