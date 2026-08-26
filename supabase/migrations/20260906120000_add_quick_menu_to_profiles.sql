-- Backs the Account page's "Quick menu" section: a per-user, opt-in
-- shortcut menu (a handful of chosen destinations, e.g. Inventory/Tasks/
-- Manage) surfaced from a button in the center of HeaderComponent's own
-- top bar. quick_menu_items stores QuickMenuOption keys from
-- shared/models/quick-menu.ts, not routerLinks/labels directly, so a later
-- rename/reorder of that option list doesn't require a data migration —
-- same "store the stable key, resolve the display bits client-side" shape
-- inventory_table_columns/inventory_form_fields already use for their own
-- string-array preferences.
--
-- Purely cosmetic and self-service, same reasoning full_name/nickname/
-- avatar_key/last_active_at already have (see add_last_active_at_to_profiles.sql's
-- own note): "Users can update their own profile" (create_profiles.sql)
-- already scopes UPDATE to auth.uid() = id at the row level, so extending
-- the column-level grant below is enough — no SECURITY DEFINER RPC needed,
-- since (unlike profiles.role/membership_status) there's no privilege
-- distinction to protect here. A user picking their own quick-menu
-- shortcuts has no bearing on anyone else's access.
alter table public.profiles add column quick_menu_enabled boolean not null default false;
alter table public.profiles add column quick_menu_items text[] not null default '{}';

grant update (email, full_name, nickname, avatar_key, last_active_at, quick_menu_enabled, quick_menu_items) on public.profiles to authenticated;
