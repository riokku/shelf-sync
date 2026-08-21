-- Lets an admin turn off the Inventory page's "Bulk edit" feature entirely
-- for their org, via Customize's "Workflow" tab (alongside
-- require_retirement_approval). Default true preserves today's behavior —
-- the feature as shipped — for every existing org. Purely a client-side UI
-- gate (InventoryComponent hides the toggle/checkboxes/toolbar outright
-- when off, same "hidden, not disabled" treatment BARCODE_FEATURE_ENABLED
-- already established), so no RPC/function changes are needed here, unlike
-- require_retirement_approval's own migration. No RLS/grant changes either:
-- same reasoning as every other site_settings column added this way —
-- its UPDATE policy is already a flat, non-column-scoped "admin of own org"
-- check, so a new plain column rides along under it.
alter table public.site_settings
  add column bulk_edit_enabled boolean not null default true;
