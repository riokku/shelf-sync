-- Multi-photo gallery for inventory items. inventory_items.image stays as the
-- legacy single-URL column for pre-existing rows; new items store their
-- photos here instead and the app derives the card/cover image from the
-- first row (position 0) once any exist.
create table public.inventory_item_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  storage_path text not null,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index inventory_item_images_item_id_idx on public.inventory_item_images (item_id);

alter table public.inventory_item_images enable row level security;

create policy "Authenticated users can view inventory item images"
  on public.inventory_item_images for select
  to authenticated
  using (true);

create policy "Admins and managers can insert inventory item images"
  on public.inventory_item_images for insert
  to authenticated
  with check (public.current_user_role() in ('admin', 'manager'));

create policy "Admins and managers can delete inventory item images"
  on public.inventory_item_images for delete
  to authenticated
  using (public.current_user_role() in ('admin', 'manager'));

-- Defense in depth: the app caps uploads at 10 client-side, but enforce it
-- server-side too since RLS alone can't limit row counts per item.
create or replace function public.enforce_inventory_item_image_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.inventory_item_images where item_id = new.item_id) >= 10 then
    raise exception 'An inventory item cannot have more than 10 images';
  end if;
  return new;
end;
$$;

create trigger inventory_item_images_limit
  before insert on public.inventory_item_images
  for each row
  execute function public.enforce_inventory_item_image_limit();

-- Storage bucket the app uploads photos into. Public so item photos can be
-- rendered via plain public URLs without signing; write access is still
-- gated by the policies below.
insert into storage.buckets (id, name, public)
values ('inventory-images', 'inventory-images', true)
on conflict (id) do nothing;

create policy "Public can view inventory images"
  on storage.objects for select
  using (bucket_id = 'inventory-images');

create policy "Admins and managers can upload inventory images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'inventory-images'
    and public.current_user_role() in ('admin', 'manager')
  );

create policy "Admins and managers can delete inventory images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'inventory-images'
    and public.current_user_role() in ('admin', 'manager')
  );
