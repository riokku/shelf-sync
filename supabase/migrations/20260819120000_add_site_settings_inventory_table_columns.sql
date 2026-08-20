-- Lets an admin choose which optional columns show in the Inventory page's
-- table view (Customize > Data). "name" and "actions" are never part of this
-- set — they're hardcoded always-on in the client (shared/models/inventory-table-column.ts).
--
-- No RLS/grant changes needed: unlike inventory_items/tasks, site_settings'
-- UPDATE policy (from scope_site_settings_by_organization) is already a flat,
-- non-column-scoped "admin of own org" check covering the whole row, and its
-- SELECT policy already lets any org member read it (branding/config affects
-- everyone, same reasoning as theme/logo) — a new plain column just rides
-- along under both existing policies.
alter table public.site_settings
  add column inventory_table_columns text[] not null default array['category', 'physicalLocation', 'quantityRemaining', 'status'];
