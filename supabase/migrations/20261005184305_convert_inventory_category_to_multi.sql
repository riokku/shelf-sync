-- Category moves from a single admin-curated value per item to several —
-- an item can now be tagged with more than one category at once (e.g. an
-- item that's both "Furniture" and "Outdoor"). Same text[]-drawn-from-
-- inventory_field_options shape add_inventory_item_discard_reasons already
-- established for discard reasons, minus that column's cardinality check:
-- category stays optional, same as it always was — an item with zero
-- categories still reads as "Uncategorized" everywhere category is
-- grouped/displayed, the same way a null single value already did.
alter table public.inventory_items
  alter column category type text[]
  using case when category is null then null else array[category] end;
