-- Lets an admin choose which optional fields appear on the "Create item"
-- form (Manage > Inventory > Create item), via Customize > Data's new
-- "Inventory data" section (see shared/models/inventory-form-field.ts for
-- the field list/grouping and its own doc comment for what's excluded).
-- "name" and the item's core quantity tracking (quantityTotal / the
-- single-vs-container toggle) are never part of this set — they're
-- hardcoded always-on in the client, same reasoning inventory_table_columns
-- hardcodes "name"/"actions" always-on.
--
-- Defaults to every field enabled (unlike inventory_table_columns' modest
-- four-column default) so this is non-breaking: an org that never visits
-- this new section keeps seeing the exact same create form it always has.
--
-- No RLS/grant changes needed — same reasoning as inventory_table_columns:
-- site_settings' UPDATE/SELECT policies are already flat, non-column-scoped
-- checks covering the whole row, so a new plain column rides along under
-- both existing policies.
alter table public.site_settings
  add column inventory_form_fields text[] not null default array[
    'barcode', 'description', 'category', 'physicalLocation', 'digitalLocation',
    'applicableYear', 'expirationDate', 'photos',
    'supplierName', 'supplierLeadTime', 'orderLink',
    'quantityPerContainer', 'lowQuantityThreshold',
    'pricePerUnit', 'pricePerContainer'
  ];
