-- Lets a task note which inventory item it's about (e.g. "restock this").
-- Plain text, not a FK to inventory_items: the dashboard's inventory list is
-- still hardcoded demo data (see CLAUDE.md), not backed by real rows in
-- that table yet, so a foreign key would reject every insert. Revisit once
-- the dashboard is wired up to real inventory_items.
alter table public.tasks add column related_item_name text;
