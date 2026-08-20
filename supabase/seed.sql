-- Local dev seed data for an event planning/rental company (ShelfSync's
-- first real use case) — mirrors the same catalog seeded onto the hosted
-- project's own org (see git history for the one-off reseed script that
-- replaced the original generic-warehouse dummy data there). No `image`
-- column values here (nothing to link to that's guaranteed both real and
-- actually relevant — see that reseed's own reasoning) and no legacy
-- `activity_log` text (unused by the app; see CLAUDE.md). `checked_out_to`,
-- `retirement_requested_by`, and `retired_by` are all left null for every
-- row since they're real FKs to profiles(auth users) now, and this seed
-- doesn't create any auth users.
--
-- inventory_items.organization_id defaults to current_user_org_id(), which
-- resolves to null with no authenticated caller (as here) — so every row
-- below stamps a fixed demo org id explicitly instead.
insert into public.organizations (id, name, slug)
values ('11111111-1111-1111-1111-111111111111', 'Demo Organization', 'demo-organization')
on conflict (id) do nothing;

insert into public.inventory_field_options (organization_id, field_name, value) values
  ('11111111-1111-1111-1111-111111111111', 'category', 'Furniture'),
  ('11111111-1111-1111-1111-111111111111', 'category', 'Linens'),
  ('11111111-1111-1111-1111-111111111111', 'category', 'Tableware & Decor'),
  ('11111111-1111-1111-1111-111111111111', 'category', 'Lighting & AV'),
  ('11111111-1111-1111-1111-111111111111', 'category', 'Tents & Flooring'),
  ('11111111-1111-1111-1111-111111111111', 'category', 'Bar & Power Equipment'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse A - Bay 1'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse A - Bay 2'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse A - Bay 3'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse A - Bay 4'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse A - Bay 5'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse A - Bay 6'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse A - Bay 7'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse B - Shelf 1'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse B - Shelf 2'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse B - Shelf 3'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse B - Shelf 4'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse B - Shelf 5'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse C - Rack 1'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse C - Rack 2'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse C - Rack 3'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse C - Rack 4'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse D - Tent Yard 1'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse D - Tent Yard 2'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse E - Bar Storage'),
  ('11111111-1111-1111-1111-111111111111', 'physical_location', 'Warehouse E - Power Equipment');

-- All active and fully in-stock except two deliberately varied rows
-- (Wireless Microphone Set: low stock; Portable Bar Unit: out of stock)
-- plus one retirement_pending and one retired row, so every stock-status
-- badge/table state has at least one example out of the box.
insert into public.inventory_items (
  organization_id, name, category, physical_location, description,
  quantity_total, quantity_per_container, quantity_allocated, quantity_remaining,
  low_quantity_threshold, price_per_unit, price_per_container, status,
  retirement_request_note
) values
  ('11111111-1111-1111-1111-111111111111', 'Chiavari Chairs (Gold)', 'Furniture', 'Warehouse A - Bay 1',
   'Gold Chiavari chairs with ivory cushion, the most-requested chair for formal receptions.',
   600, 50, 0, 600, 100, 3.50, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Chiavari Chairs (White)', 'Furniture', 'Warehouse A - Bay 2',
   'White Chiavari chairs with ivory cushion.',
   400, 50, 0, 400, 80, 3.50, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Folding Chairs (White Resin)', 'Furniture', 'Warehouse A - Bay 3',
   'Standard white resin folding chairs for ceremonies and casual seating.',
   800, 50, 0, 800, 150, 1.25, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Round Tables (60")', 'Furniture', 'Warehouse A - Bay 4',
   'Seats 8; the standard reception round.',
   120, 10, 0, 120, 20, 12.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Rectangular Banquet Tables (8ft)', 'Furniture', 'Warehouse A - Bay 5',
   'Seats 8-10; also used for buffet and gift tables.',
   100, 10, 0, 100, 20, 12.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Cocktail Tables (30" High-Top)', 'Furniture', 'Warehouse A - Bay 6',
   'Standing-height cocktail tables for mixers and lounge areas.',
   60, 6, 0, 60, 15, 15.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Farm Tables (Rustic Wood, 8ft)', 'Furniture', 'Warehouse A - Bay 7',
   'Rustic wood farm tables for boho/outdoor weddings. Fleet damaged at a recent outdoor event; pending write-off.',
   20, null, 0, 0, 5, 45.00, null, 'retirement_pending',
   'Water damage and a cracked leg on several units after an outdoor event rained out — flagging the remaining fleet for retirement rather than repair.'),

  ('11111111-1111-1111-1111-111111111111', 'White Tablecloths (120" Round)', 'Linens', 'Warehouse B - Shelf 1',
   'Floor-length round tablecloths, fits 60" round tables.',
   250, 25, 0, 250, 50, 8.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Table Runners (Assorted Colors)', 'Linens', 'Warehouse B - Shelf 2',
   'Satin table runners in assorted seasonal colors.',
   300, 50, 0, 300, 60, 3.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Chair Sashes (Satin)', 'Linens', 'Warehouse B - Shelf 3',
   'Satin chair sashes, assorted colors.',
   500, 100, 0, 500, 100, 1.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Charger Plates (Gold Rim)', 'Tableware & Decor', 'Warehouse B - Shelf 4',
   'Gold-rimmed glass charger plates for place settings.',
   400, 50, 0, 400, 80, 2.50, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Centerpiece Vases (Cylinder Glass)', 'Tableware & Decor', 'Warehouse B - Shelf 5',
   'Clear cylinder glass vases for floral centerpieces, various heights.',
   180, 20, 0, 180, 30, 6.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Cafe String Lights (48ft Strand)', 'Lighting & AV', 'Warehouse C - Rack 1',
   'Warm white bistro/cafe string lights for tent and patio installs.',
   40, null, 0, 40, 8, 35.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'LED Uplighting Fixtures', 'Lighting & AV', 'Warehouse C - Rack 2',
   'Wireless RGBW LED uplights, battery powered, app-controlled color.',
   80, 8, 0, 80, 16, 25.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Wireless PA Speaker System', 'Lighting & AV', 'Warehouse C - Rack 3',
   'Battery-powered PA speaker with Bluetooth input, for ceremonies and toasts.',
   12, null, 0, 12, 3, 150.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Wireless Microphone Set', 'Lighting & AV', 'Warehouse C - Rack 4',
   'Dual wireless handheld mic set for officiants and MCs.',
   10, 2, 0, 1, 2, 60.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', '20x20 Frame Tent', 'Tents & Flooring', 'Warehouse D - Tent Yard 1',
   'White frame tent, seats ~40 with round tables. Sidewalls sold separately.',
   8, null, 0, 8, 2, 350.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Interlocking Dance Floor Panels (1ft sq)', 'Tents & Flooring', 'Warehouse D - Tent Yard 2',
   'Black/white reversible interlocking dance floor tiles.',
   400, 20, 0, 400, 80, 4.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Portable Bar Unit', 'Bar & Power Equipment', 'Warehouse E - Bar Storage',
   'Rolling wood-front portable bar with ice well.',
   6, null, 0, 0, 1, 200.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Quiet Inverter Generator (3500W)', 'Bar & Power Equipment', 'Warehouse E - Power Equipment',
   'Low-noise inverter generator for powering lighting/AV at outdoor sites without house power.',
   5, null, 0, 5, 1, 400.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Incandescent Patio String Lights (Discontinued)', 'Lighting & AV', null,
   'Older incandescent string light sets, replaced by the LED cafe string lights above.',
   0, null, 0, 0, null, null, null, 'retired', null);

-- Container breakdown demo: Chiavari Chairs (Gold) arrives on 4 pallets.
-- Sum of these must equal that item's quantity_remaining (600) above.
insert into public.inventory_item_containers (item_id, quantity, location)
select id, q, loc
from public.inventory_items, (values
    (150, 'Warehouse A - Bay 1'),
    (150, 'Warehouse A - Bay 1'),
    (150, 'Warehouse A - Bay 2'),
    (150, 'Warehouse A - Bay 2')
  ) as pallets(q, loc)
where organization_id = '11111111-1111-1111-1111-111111111111' and name = 'Chiavari Chairs (Gold)';
