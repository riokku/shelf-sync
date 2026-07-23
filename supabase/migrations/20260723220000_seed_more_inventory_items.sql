-- Ad-hoc data seed (not schema) — adds 9 more placeholder inventory items to
-- the real Legacy Organization (the only organization on this hosted
-- project), matching the 9 rows added to supabase/seed.sql for local dev, so
-- there's enough data (19 items total) to exercise the dashboard's 12-per-page
-- pagination. organization_id is stamped explicitly since this runs with no
-- authenticated caller, so current_user_org_id() would otherwise resolve to
-- null (see supabase/seed.sql's own note on the same issue).
insert into public.inventory_items (
  name, description, image, category, physical_location, digital_location,
  applicable_year, expiration_date, supplier_name, supplier_lead_time, order_link,
  quantity_total, quantity_per_container, quantity_allocated, quantity_remaining,
  low_quantity_threshold, price_per_unit, price_per_container, is_checked_out, activity_log,
  organization_id
) values
  ('Whiteboard Markers', 'Dry-erase marker set, assorted colors, low-odor ink.',
   'https://picsum.photos/seed/whiteboard-markers/500/300',
   'Office Supplies', 'Warehouse B - Aisle 2', 'https://inventory.example.com/items/item011',
   '2024', '2026-09-01', 'Print Supplies Inc.', '4 days', 'https://supplier.example.com/order/item011',
   200, 25, 40, 160, 30, 3.49, 87.25, false,
   'Item created on 2024-03-01; Allocated 40 units on 2024-05-10',
   (select id from public.organizations where slug = 'legacy-organization')),

  ('Bluetooth Speaker', 'Portable Bluetooth speaker with 10-hour battery life.',
   'https://picsum.photos/seed/bluetooth-speaker/500/300',
   'Electronics', 'Warehouse A - Bin 15', 'https://inventory.example.com/items/item012',
   '2024', '2027-02-14', 'Tech Gear Supplies', '9 days', 'https://supplier.example.com/order/item012',
   90, 15, 70, 20, 25, 45.99, 689.85, true,
   'Item created on 2024-01-20; Checked out 70 units on 2024-04-18 (low stock demo)',
   (select id from public.organizations where slug = 'legacy-organization')),

  ('Filing Cabinet', 'Four-drawer steel filing cabinet with lock.',
   'https://picsum.photos/seed/filing-cabinet/500/300',
   'Furniture', 'Warehouse D - Section 3', 'https://inventory.example.com/items/item013',
   '2023', '2031-01-01', 'Office Essentials', '15 days', 'https://supplier.example.com/order/item013',
   40, 4, 40, 0, 5, 149.99, 599.96, false,
   'Item created on 2023-10-05; Allocated 40 units on 2024-02-15 (out of stock demo)',
   (select id from public.organizations where slug = 'legacy-organization')),

  ('Safety Goggles', 'Anti-fog safety goggles with UV protection.',
   'https://picsum.photos/seed/safety-goggles/500/300',
   'Safety Equipment', 'Warehouse C - Shelf 7', 'https://inventory.example.com/items/item014',
   '2024', '2028-04-30', 'Industrial Safety Co.', '11 days', 'https://supplier.example.com/order/item014',
   350, 50, 150, 200, 60, 5.49, 274.50, false,
   'Item created on 2024-01-08; Allocated 150 units on 2024-03-30',
   (select id from public.organizations where slug = 'legacy-organization')),

  ('Extension Cord', '25-foot heavy-duty outdoor extension cord.',
   'https://picsum.photos/seed/extension-cord/500/300',
   'Tools', 'Warehouse D - Shelf 11', 'https://inventory.example.com/items/item015',
   '2024', '2029-07-01', 'Tool Masters Inc.', '9 days', 'https://supplier.example.com/order/item015',
   120, 20, 90, 30, 25, 14.99, 299.80, true,
   'Item created on 2024-02-20; Checked out 90 units on 2024-05-25',
   (select id from public.organizations where slug = 'legacy-organization')),

  ('Desk Lamp', 'LED desk lamp with adjustable brightness and color temperature.',
   'https://picsum.photos/seed/desk-lamp/500/300',
   'Office Equipment', 'Warehouse B - Rack 6', 'https://inventory.example.com/items/item016',
   '2024', '2027-05-15', 'Ergo Solutions', '6 days', 'https://supplier.example.com/order/item016',
   85, 10, 55, 30, 15, 22.99, 229.90, false,
   'Item created on 2024-03-10; Allocated 55 units on 2024-05-01',
   (select id from public.organizations where slug = 'legacy-organization')),

  ('Label Printer', 'Compact thermal label printer for shelf and bin labeling.',
   'https://picsum.photos/seed/label-printer/500/300',
   'Electronics', 'Warehouse A - Bin 20', 'https://inventory.example.com/items/item017',
   '2023', '2026-08-01', 'Data Tech Supplies', '10 days', 'https://supplier.example.com/order/item017',
   25, 5, 23, 2, 5, 79.99, 399.95, false,
   'Item created on 2023-12-01; Allocated 23 units on 2024-04-28 (low stock demo)',
   (select id from public.organizations where slug = 'legacy-organization')),

  ('Step Stool', 'Folding two-step stool with non-slip treads.',
   'https://picsum.photos/seed/step-stool/500/300',
   'Tools', 'Warehouse D - Shelf 2', 'https://inventory.example.com/items/item018',
   '2024', '2030-02-01', 'Tool Masters Inc.', '8 days', 'https://supplier.example.com/order/item018',
   60, 12, 20, 40, 15, 34.99, 419.88, false,
   'Item created on 2024-01-25; Allocated 20 units on 2024-03-08',
   (select id from public.organizations where slug = 'legacy-organization')),

  ('Hand Sanitizer Dispenser', 'Wall-mounted touchless hand sanitizer dispenser.',
   'https://picsum.photos/seed/hand-sanitizer-dispenser/500/300',
   'Safety Equipment', 'Warehouse C - Section 4', 'https://inventory.example.com/items/item019',
   '2024', '2025-12-01', 'Clean Air Corp.', '7 days', 'https://supplier.example.com/order/item019',
   100, 20, 100, 0, 20, 18.99, 379.80, true,
   'Item created on 2024-02-28; Checked out 100 units on 2024-06-10 (out of stock demo)',
   (select id from public.organizations where slug = 'legacy-organization'));
