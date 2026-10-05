-- Removes the "Price & supplier edits" restriction entirely (Settings >
-- Workflow) — any signed-in user can edit an inventory item's price/supplier
-- fields again regardless of role, same trust level every other field on
-- the item already has (and already had by default, since this toggle was
-- off by default for every existing org — see its own add_restrict_price_
-- supplier_edits migration). Dropping the trigger first, then the function
-- it depended on, then the now-dead settings column.
drop trigger if exists enforce_price_supplier_edit_restriction on public.inventory_items;
drop function if exists public.enforce_price_supplier_edit_restriction();

alter table public.site_settings
  drop column if exists restrict_price_supplier_edits;
