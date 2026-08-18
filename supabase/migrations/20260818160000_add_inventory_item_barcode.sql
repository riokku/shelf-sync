-- Backs the barcode/QR scanning feature: a manufacturer barcode (scanned
-- off a retail product) or a ShelfSync-generated QR label (for an internal
-- asset that never had one) both resolve to this one column. Unique per
-- organization (not globally) — two different orgs' catalogs are allowed
-- to happen to use the same UPC, same reasoning as every other org-scoped
-- uniqueness concern in this schema. Partial (`where barcode is not null`)
-- so any number of items can simply have none.
alter table public.inventory_items add column barcode text;

create unique index inventory_items_org_barcode_idx
  on public.inventory_items (organization_id, barcode)
  where barcode is not null;

-- Covered by inventory_items' existing SELECT/INSERT policies (readable by
-- any authenticated org member; insertable admin/manager-only) with no
-- change needed. UPDATE is different: add_inventory_item_retirement.sql
-- gave inventory_items a column-scoped grant rather than a flat
-- using(true)/with check(true), enumerating exactly the columns
-- ModalTableComponent's edit flow touches — a brand new column isn't part
-- of that list until explicitly added, so without this it would silently
-- fail to save despite passing RLS. Additive grant; no need to repeat the
-- existing column list.
grant update (barcode) on public.inventory_items to authenticated;
