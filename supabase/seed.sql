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

-- Supplier directory: a handful of fictional per-category suppliers,
-- referenced by inventory_items.supplier_id below rather than typed as
-- free text on every row (see add_supplier_directory migration). Fixed
-- demo ids, same "hardcode it since there's no authenticated caller for
-- current_user_org_id() to default from" reasoning organization_id's own
-- id above already needs. contact_name/email/phone/website/notes are
-- placeholder values (fictional contacts on the same .example.com domain
-- each supplier's own order links already use) rather than left null,
-- same "demo data should look plausibly complete" reasoning every other
-- placeholder field in this file already follows.
insert into public.suppliers (id, organization_id, name, contact_name, email, phone, website, notes) values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Gatherwell Event Furniture Co.',
   'Dana Whitfield', 'orders@gatherwell-events.example.com', '(555) 201-4471', 'https://gatherwell-events.example.com',
   'Primary furniture vendor — chairs, tables, and cocktail rounds. Ask for Dana on rush orders.'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Linen & Lace Event Textiles',
   'Priya Nandakumar', 'sales@linenandlace.example.com', '(555) 322-6690', 'https://linenandlace.example.com',
   'Linens, runners, and sashes. Reliable 3-5 day turnaround on standard colors.'),
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 'Tablescape Decor Supply',
   'Marcus Iglesias', 'accounts@tablescapedecor.example.com', '(555) 447-2810', 'https://tablescapedecor.example.com',
   'Charger plates, vases, and other tabletop decor.'),
  ('22222222-2222-2222-2222-222222222224', '11111111-1111-1111-1111-111111111111', 'BrightStage AV Rentals',
   'Sasha Whitcombe', 'rentals@brightstage-av.example.com', '(555) 588-1934', 'https://brightstage-av.example.com',
   'Lighting, string lights, and PA/speaker equipment. Same-day pickup available for local jobs.'),
  ('22222222-2222-2222-2222-222222222225', '11111111-1111-1111-1111-111111111111', 'Canopy & Deck Structures',
   'Rowan Blackwood', 'bookings@canopyanddeck.example.com', '(555) 673-5502', 'https://canopyanddeck.example.com',
   'Tents, frames, and dance floor panels. Needs 2-3 weeks lead time for custom tent sizes.'),
  ('22222222-2222-2222-2222-222222222226', '11111111-1111-1111-1111-111111111111', 'Summit Power & Bar Rentals',
   'Elena Vasquez', 'orders@summitpowerbar.example.com', '(555) 764-0928', 'https://summitpowerbar.example.com',
   'Portable bars and quiet generators for outdoor/off-grid events.')
on conflict (id) do nothing;

-- All active and fully in-stock except two deliberately varied rows
-- (Wireless Microphone Set: low stock; Portable Bar Unit: out of stock)
-- plus one retirement_pending and one retired row, so every stock-status
-- badge/table state has at least one example out of the box.
--
-- supplier_id/supplier_lead_time/order_link/digital_location/
-- applicable_year are placeholder values (the fictional suppliers above,
-- with .example.com order links — the reserved, non-resolving placeholder
-- domain, same convention the very first dummy-data seed used) rather than
-- left null, matching the hosted org's own data (see git history for the
-- one-off update that filled those in there). expiration_date and barcode
-- are still left null throughout: expiration doesn't meaningfully apply to
-- rental furniture/AV/tents, and a fabricated barcode risks colliding with
-- the real barcode-scanning feature.
insert into public.inventory_items (
  organization_id, name, category, physical_location, digital_location, applicable_year,
  supplier_id, supplier_lead_time, order_link, description,
  quantity_total, quantity_per_container, quantity_allocated, quantity_remaining,
  low_quantity_threshold, price_per_unit, price_per_container, status,
  retirement_request_note
) values
  ('11111111-1111-1111-1111-111111111111', 'Chiavari Chairs (Gold)', 'Furniture', 'Warehouse A - Bay 1',
   'Shared Drive > Inventory > Furniture > Chiavari Chairs (Gold)', '2024',
   '22222222-2222-2222-2222-222222222221', '5-7 business days', 'https://gatherwell-events.example.com/order/chiavari-chairs-gold',
   'Gold Chiavari chairs with ivory cushion, the most-requested chair for formal receptions.',
   600, 50, 0, 600, 100, 3.50, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Chiavari Chairs (White)', 'Furniture', 'Warehouse A - Bay 2',
   'Shared Drive > Inventory > Furniture > Chiavari Chairs (White)', '2024',
   '22222222-2222-2222-2222-222222222221', '5-7 business days', 'https://gatherwell-events.example.com/order/chiavari-chairs-white',
   'White Chiavari chairs with ivory cushion.',
   400, 50, 0, 400, 80, 3.50, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Folding Chairs (White Resin)', 'Furniture', 'Warehouse A - Bay 3',
   'Shared Drive > Inventory > Furniture > Folding Chairs (White Resin)', '2023',
   '22222222-2222-2222-2222-222222222221', '3-5 business days', 'https://gatherwell-events.example.com/order/folding-chairs-white-resin',
   'Standard white resin folding chairs for ceremonies and casual seating.',
   800, 50, 0, 800, 150, 1.25, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Round Tables (60")', 'Furniture', 'Warehouse A - Bay 4',
   'Shared Drive > Inventory > Furniture > Round Tables (60")', '2023',
   '22222222-2222-2222-2222-222222222221', '5-7 business days', 'https://gatherwell-events.example.com/order/round-tables-60in',
   'Seats 8; the standard reception round.',
   120, 10, 0, 120, 20, 12.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Rectangular Banquet Tables (8ft)', 'Furniture', 'Warehouse A - Bay 5',
   'Shared Drive > Inventory > Furniture > Rectangular Banquet Tables (8ft)', '2023',
   '22222222-2222-2222-2222-222222222221', '5-7 business days', 'https://gatherwell-events.example.com/order/rectangular-banquet-tables-8ft',
   'Seats 8-10; also used for buffet and gift tables.',
   100, 10, 0, 100, 20, 12.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Cocktail Tables (30" High-Top)', 'Furniture', 'Warehouse A - Bay 6',
   'Shared Drive > Inventory > Furniture > Cocktail Tables (30" High-Top)', '2025',
   '22222222-2222-2222-2222-222222222221', '3-5 business days', 'https://gatherwell-events.example.com/order/cocktail-tables-hightop',
   'Standing-height cocktail tables for mixers and lounge areas.',
   60, 6, 0, 60, 15, 15.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Farm Tables (Rustic Wood, 8ft)', 'Furniture', 'Warehouse A - Bay 7',
   'Shared Drive > Inventory > Furniture > Farm Tables (Rustic Wood, 8ft)', '2022',
   '22222222-2222-2222-2222-222222222221', '2-3 weeks (custom order)', 'https://gatherwell-events.example.com/order/farm-tables-rustic-wood',
   'Rustic wood farm tables for boho/outdoor weddings. Fleet damaged at a recent outdoor event; pending write-off.',
   20, null, 0, 0, 5, 45.00, null, 'retirement_pending',
   'Water damage and a cracked leg on several units after an outdoor event rained out — flagging the remaining fleet for retirement rather than repair.'),

  ('11111111-1111-1111-1111-111111111111', 'White Tablecloths (120" Round)', 'Linens', 'Warehouse B - Shelf 1',
   'Shared Drive > Inventory > Linens > White Tablecloths (120" Round)', '2024',
   '22222222-2222-2222-2222-222222222222', '3-5 business days', 'https://linenandlace.example.com/order/tablecloths-white-120in-round',
   'Floor-length round tablecloths, fits 60" round tables.',
   250, 25, 0, 250, 50, 8.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Table Runners (Assorted Colors)', 'Linens', 'Warehouse B - Shelf 2',
   'Shared Drive > Inventory > Linens > Table Runners (Assorted Colors)', '2024',
   '22222222-2222-2222-2222-222222222222', '3-5 business days', 'https://linenandlace.example.com/order/table-runners-assorted',
   'Satin table runners in assorted seasonal colors.',
   300, 50, 0, 300, 60, 3.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Chair Sashes (Satin)', 'Linens', 'Warehouse B - Shelf 3',
   'Shared Drive > Inventory > Linens > Chair Sashes (Satin)', '2024',
   '22222222-2222-2222-2222-222222222222', '3-5 business days', 'https://linenandlace.example.com/order/chair-sashes-satin',
   'Satin chair sashes, assorted colors.',
   500, 100, 0, 500, 100, 1.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Charger Plates (Gold Rim)', 'Tableware & Decor', 'Warehouse B - Shelf 4',
   'Shared Drive > Inventory > Tableware & Decor > Charger Plates (Gold Rim)', '2023',
   '22222222-2222-2222-2222-222222222223', '1-2 weeks', 'https://tablescapedecor.example.com/order/charger-plates-gold-rim',
   'Gold-rimmed glass charger plates for place settings.',
   400, 50, 0, 400, 80, 2.50, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Centerpiece Vases (Cylinder Glass)', 'Tableware & Decor', 'Warehouse B - Shelf 5',
   'Shared Drive > Inventory > Tableware & Decor > Centerpiece Vases (Cylinder Glass)', '2023',
   '22222222-2222-2222-2222-222222222223', '1-2 weeks', 'https://tablescapedecor.example.com/order/centerpiece-vases-cylinder-glass',
   'Clear cylinder glass vases for floral centerpieces, various heights.',
   180, 20, 0, 180, 30, 6.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Cafe String Lights (48ft Strand)', 'Lighting & AV', 'Warehouse C - Rack 1',
   'Shared Drive > Inventory > Lighting & AV > Cafe String Lights (48ft Strand)', '2024',
   '22222222-2222-2222-2222-222222222224', '3-5 business days', 'https://brightstage-av.example.com/order/cafe-string-lights-48ft',
   'Warm white bistro/cafe string lights for tent and patio installs.',
   40, null, 0, 40, 8, 35.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'LED Uplighting Fixtures', 'Lighting & AV', 'Warehouse C - Rack 2',
   'Shared Drive > Inventory > Lighting & AV > LED Uplighting Fixtures', '2024',
   '22222222-2222-2222-2222-222222222224', '3-5 business days', 'https://brightstage-av.example.com/order/led-uplighting-fixtures',
   'Wireless RGBW LED uplights, battery powered, app-controlled color.',
   80, 8, 0, 80, 16, 25.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Wireless PA Speaker System', 'Lighting & AV', 'Warehouse C - Rack 3',
   'Shared Drive > Inventory > Lighting & AV > Wireless PA Speaker System', '2023',
   '22222222-2222-2222-2222-222222222224', '1-2 weeks', 'https://brightstage-av.example.com/order/wireless-pa-speaker-system',
   'Battery-powered PA speaker with Bluetooth input, for ceremonies and toasts.',
   12, null, 0, 12, 3, 150.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Wireless Microphone Set', 'Lighting & AV', 'Warehouse C - Rack 4',
   'Shared Drive > Inventory > Lighting & AV > Wireless Microphone Set', '2023',
   '22222222-2222-2222-2222-222222222224', '1-2 weeks', 'https://brightstage-av.example.com/order/wireless-microphone-set',
   'Dual wireless handheld mic set for officiants and MCs.',
   10, 2, 0, 1, 2, 60.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', '20x20 Frame Tent', 'Tents & Flooring', 'Warehouse D - Tent Yard 1',
   'Shared Drive > Inventory > Tents & Flooring > 20x20 Frame Tent', '2022',
   '22222222-2222-2222-2222-222222222225', '2-3 weeks', 'https://canopyanddeck.example.com/order/20x20-frame-tent',
   'White frame tent, seats ~40 with round tables. Sidewalls sold separately.',
   8, null, 0, 8, 2, 350.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Interlocking Dance Floor Panels (1ft sq)', 'Tents & Flooring', 'Warehouse D - Tent Yard 2',
   'Shared Drive > Inventory > Tents & Flooring > Interlocking Dance Floor Panels (1ft sq)', '2022',
   '22222222-2222-2222-2222-222222222225', '1-2 weeks', 'https://canopyanddeck.example.com/order/dance-floor-panels',
   'Black/white reversible interlocking dance floor tiles.',
   400, 20, 0, 400, 80, 4.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Portable Bar Unit', 'Bar & Power Equipment', 'Warehouse E - Bar Storage',
   'Shared Drive > Inventory > Bar & Power Equipment > Portable Bar Unit', '2023',
   '22222222-2222-2222-2222-222222222226', '1-2 weeks', 'https://summitpowerbar.example.com/order/portable-bar-unit',
   'Rolling wood-front portable bar with ice well.',
   6, null, 0, 0, 1, 200.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Quiet Inverter Generator (3500W)', 'Bar & Power Equipment', 'Warehouse E - Power Equipment',
   'Shared Drive > Inventory > Bar & Power Equipment > Quiet Inverter Generator (3500W)', '2023',
   '22222222-2222-2222-2222-222222222226', '1-2 weeks', 'https://summitpowerbar.example.com/order/inverter-generator-3500w',
   'Low-noise inverter generator for powering lighting/AV at outdoor sites without house power.',
   5, null, 0, 5, 1, 400.00, null, 'active', null),

  ('11111111-1111-1111-1111-111111111111', 'Incandescent Patio String Lights (Discontinued)', 'Lighting & AV', null,
   'Shared Drive > Inventory > Lighting & AV > Incandescent Patio String Lights (Discontinued)', '2019',
   '22222222-2222-2222-2222-222222222224', 'Discontinued — no longer orderable', null,
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
