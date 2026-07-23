-- Local dev seed data, ported from the hardcoded array in
-- src/app/dashboard/dashboard.component.ts. checked_out_to is left null for
-- every row since it's a real FK to profiles(auth users) now, and this seed
-- doesn't create any auth users.
--
-- inventory_items.organization_id defaults to current_user_org_id(), which
-- resolves to null with no authenticated caller (as here) — so every row
-- below stamps a fixed demo org id explicitly instead.
insert into public.organizations (id, name, slug)
values ('11111111-1111-1111-1111-111111111111', 'Demo Organization', 'demo-organization')
on conflict (id) do nothing;

insert into public.inventory_items (
  name, description, image, category, physical_location, digital_location,
  applicable_year, expiration_date, supplier_name, supplier_lead_time, order_link,
  quantity_total, quantity_per_container, quantity_allocated, quantity_remaining,
  low_quantity_threshold, price_per_unit, price_per_container, is_checked_out, activity_log,
  organization_id
) values
  ('Printer Ink Cartridge', 'Black ink cartridge for office printers.',
   'https://images.unsplash.com/photo-1705635847741-d38022d08d93?w=500&auto=format&fit=crop&q=60',
   'Office Supplies', 'Warehouse B - Aisle 3', 'https://inventory.example.com/items/item001',
   '2024', '2025-08-15', 'Print Supplies Inc.', '5 days', 'https://supplier.example.com/order/item001',
   150, 30, 50, 100, 20, 25.99, 779.70, false,
   'Item created on 2024-02-01; Allocated 50 units on 2024-03-12; Updated on 2024-04-05',
   '11111111-1111-1111-1111-111111111111'),

  ('Wireless Mouse', 'Ergonomic wireless mouse with Bluetooth connectivity.',
   'https://images.unsplash.com/photo-1720862166220-7b5b618dc81d?w=500&auto=format&fit=crop&q=60',
   'Electronics', 'Warehouse A - Bin 12', 'https://inventory.example.com/items/item002',
   '2024', '2026-01-10', 'Tech Gear Supplies', '10 days', 'https://supplier.example.com/order/item002',
   300, 50, 120, 180, 50, 18.49, 924.50, true,
   'Item created on 2024-01-15; Checked out 120 units on 2024-04-01',
   '11111111-1111-1111-1111-111111111111'),

  ('Safety Gloves', 'Heavy-duty work gloves for industrial use.',
   'https://images.unsplash.com/photo-1668714341253-81139e265a19?w=500&auto=format&fit=crop&q=60',
   'Safety Equipment', 'Warehouse C - Shelf 5', 'https://inventory.example.com/items/item003',
   '2023', '2027-06-20', 'Industrial Safety Co.', '12 days', 'https://supplier.example.com/order/item003',
   500, 100, 200, 300, 100, 7.99, 799.00, false,
   'Item created on 2023-07-10; Allocated 200 units on 2024-02-25',
   '11111111-1111-1111-1111-111111111111'),

  ('USB Flash Drive', '64GB USB 3.0 flash drive for data storage.',
   'https://images.unsplash.com/photo-1719212752796-5d9767ea0f83?w=500&auto=format&fit=crop&q=60',
   'Electronics', 'Warehouse A - Bin 8', 'https://inventory.example.com/items/item004',
   '2024', '2028-12-31', 'Data Tech Supplies', '7 days', 'https://supplier.example.com/order/item004',
   400, 100, 100, 300, 50, 12.99, 1299.00, true,
   'Item created on 2024-03-05; Checked out 100 units on 2024-06-15',
   '11111111-1111-1111-1111-111111111111'),

  ('Office Chair', 'Ergonomic office chair with lumbar support.',
   'https://plus.unsplash.com/premium_photo-1673036823812-b0d86a2cead1?w=500&auto=format&fit=crop&q=60',
   'Furniture', 'Warehouse D - Section 1', 'https://inventory.example.com/items/item005',
   '2023', '2030-11-10', 'Office Essentials', '14 days', 'https://supplier.example.com/order/item005',
   50, 10, 45, 5, 10, 199.99, 1999.90, false,
   'Item created on 2023-09-01; Allocated 45 units on 2024-01-10 (low stock demo)',
   '11111111-1111-1111-1111-111111111111'),

  ('Laptop Stand', 'Adjustable aluminum laptop stand for ergonomic use.',
   'https://images.unsplash.com/photo-1708898812644-c0bbf3ada776?w=500&auto=format&fit=crop&q=60',
   'Office Equipment', 'Warehouse B - Rack 4', 'https://inventory.example.com/items/item006',
   '2024', '2026-03-15', 'Ergo Solutions', '5 days', 'https://supplier.example.com/order/item006',
   200, 20, 50, 150, 30, 35.99, 719.80, false,
   'Item created on 2024-01-12; Allocated 50 units on 2024-03-22',
   '11111111-1111-1111-1111-111111111111'),

  ('Power Drill', 'Cordless power drill with rechargeable battery.',
   'https://images.unsplash.com/photo-1689308271305-58e75832289b?w=500&auto=format&fit=crop&q=60',
   'Tools', 'Warehouse D - Shelf 9', 'https://inventory.example.com/items/item007',
   '2024', '2028-12-01', 'Tool Masters Inc.', '10 days', 'https://supplier.example.com/order/item007',
   75, 15, 20, 55, 10, 99.99, 1499.85, true,
   'Item created on 2024-02-14; Checked out 20 units on 2024-05-05',
   '11111111-1111-1111-1111-111111111111'),

  ('External Hard Drive', '1TB external hard drive for data storage.',
   'https://plus.unsplash.com/premium_photo-1675603849825-483711b5e3a7?w=500&auto=format&fit=crop&q=60',
   'Electronics', 'Warehouse A - Bin 5', 'https://inventory.example.com/items/item008',
   '2023', '2027-10-15', 'Data Storage Co.', '7 days', 'https://supplier.example.com/order/item008',
   250, 50, 100, 150, 25, 59.99, 2999.50, false,
   'Item created on 2023-11-05; Allocated 100 units on 2024-02-10',
   '11111111-1111-1111-1111-111111111111'),

  ('Air Purifier', 'Portable air purifier with HEPA filter.',
   'https://images.unsplash.com/photo-1703100832089-ae79c6f51f88?w=500&auto=format&fit=crop&q=60',
   'Appliances', 'Warehouse C - Section 2', 'https://inventory.example.com/items/item009',
   '2024', '2029-05-10', 'Clean Air Corp.', '8 days', 'https://supplier.example.com/order/item009',
   60, 10, 30, 30, 15, 129.99, 1299.90, true,
   'Item created on 2024-04-22; Allocated 30 units on 2024-06-01',
   '11111111-1111-1111-1111-111111111111'),

  ('Wireless Keyboard', 'Compact wireless keyboard with Bluetooth connection.',
   'https://media.istockphoto.com/id/1172073205/photo/blurred-abstract-bokeh-background.webp',
   'Electronics', 'Warehouse A - Rack 3', 'https://inventory.example.com/items/item010',
   '2024', '2027-11-20', 'Tech Solutions Ltd.', '6 days', 'https://supplier.example.com/order/item010',
   120, 40, 80, 40, 20, 45.99, 1839.60, false,
   'Item created on 2024-02-05; Allocated 80 units on 2024-03-18',
   '11111111-1111-1111-1111-111111111111'),

  ('Whiteboard Markers', 'Dry-erase marker set, assorted colors, low-odor ink.',
   'https://picsum.photos/seed/whiteboard-markers/500/300',
   'Office Supplies', 'Warehouse B - Aisle 2', 'https://inventory.example.com/items/item011',
   '2024', '2026-09-01', 'Print Supplies Inc.', '4 days', 'https://supplier.example.com/order/item011',
   200, 25, 40, 160, 30, 3.49, 87.25, false,
   'Item created on 2024-03-01; Allocated 40 units on 2024-05-10',
   '11111111-1111-1111-1111-111111111111'),

  ('Bluetooth Speaker', 'Portable Bluetooth speaker with 10-hour battery life.',
   'https://picsum.photos/seed/bluetooth-speaker/500/300',
   'Electronics', 'Warehouse A - Bin 15', 'https://inventory.example.com/items/item012',
   '2024', '2027-02-14', 'Tech Gear Supplies', '9 days', 'https://supplier.example.com/order/item012',
   90, 15, 70, 20, 25, 45.99, 689.85, true,
   'Item created on 2024-01-20; Checked out 70 units on 2024-04-18 (low stock demo)',
   '11111111-1111-1111-1111-111111111111'),

  ('Filing Cabinet', 'Four-drawer steel filing cabinet with lock.',
   'https://picsum.photos/seed/filing-cabinet/500/300',
   'Furniture', 'Warehouse D - Section 3', 'https://inventory.example.com/items/item013',
   '2023', '2031-01-01', 'Office Essentials', '15 days', 'https://supplier.example.com/order/item013',
   40, 4, 40, 0, 5, 149.99, 599.96, false,
   'Item created on 2023-10-05; Allocated 40 units on 2024-02-15 (out of stock demo)',
   '11111111-1111-1111-1111-111111111111'),

  ('Safety Goggles', 'Anti-fog safety goggles with UV protection.',
   'https://picsum.photos/seed/safety-goggles/500/300',
   'Safety Equipment', 'Warehouse C - Shelf 7', 'https://inventory.example.com/items/item014',
   '2024', '2028-04-30', 'Industrial Safety Co.', '11 days', 'https://supplier.example.com/order/item014',
   350, 50, 150, 200, 60, 5.49, 274.50, false,
   'Item created on 2024-01-08; Allocated 150 units on 2024-03-30',
   '11111111-1111-1111-1111-111111111111'),

  ('Extension Cord', '25-foot heavy-duty outdoor extension cord.',
   'https://picsum.photos/seed/extension-cord/500/300',
   'Tools', 'Warehouse D - Shelf 11', 'https://inventory.example.com/items/item015',
   '2024', '2029-07-01', 'Tool Masters Inc.', '9 days', 'https://supplier.example.com/order/item015',
   120, 20, 90, 30, 25, 14.99, 299.80, true,
   'Item created on 2024-02-20; Checked out 90 units on 2024-05-25',
   '11111111-1111-1111-1111-111111111111'),

  ('Desk Lamp', 'LED desk lamp with adjustable brightness and color temperature.',
   'https://picsum.photos/seed/desk-lamp/500/300',
   'Office Equipment', 'Warehouse B - Rack 6', 'https://inventory.example.com/items/item016',
   '2024', '2027-05-15', 'Ergo Solutions', '6 days', 'https://supplier.example.com/order/item016',
   85, 10, 55, 30, 15, 22.99, 229.90, false,
   'Item created on 2024-03-10; Allocated 55 units on 2024-05-01',
   '11111111-1111-1111-1111-111111111111'),

  ('Label Printer', 'Compact thermal label printer for shelf and bin labeling.',
   'https://picsum.photos/seed/label-printer/500/300',
   'Electronics', 'Warehouse A - Bin 20', 'https://inventory.example.com/items/item017',
   '2023', '2026-08-01', 'Data Tech Supplies', '10 days', 'https://supplier.example.com/order/item017',
   25, 5, 23, 2, 5, 79.99, 399.95, false,
   'Item created on 2023-12-01; Allocated 23 units on 2024-04-28 (low stock demo)',
   '11111111-1111-1111-1111-111111111111'),

  ('Step Stool', 'Folding two-step stool with non-slip treads.',
   'https://picsum.photos/seed/step-stool/500/300',
   'Tools', 'Warehouse D - Shelf 2', 'https://inventory.example.com/items/item018',
   '2024', '2030-02-01', 'Tool Masters Inc.', '8 days', 'https://supplier.example.com/order/item018',
   60, 12, 20, 40, 15, 34.99, 419.88, false,
   'Item created on 2024-01-25; Allocated 20 units on 2024-03-08',
   '11111111-1111-1111-1111-111111111111'),

  ('Hand Sanitizer Dispenser', 'Wall-mounted touchless hand sanitizer dispenser.',
   'https://picsum.photos/seed/hand-sanitizer-dispenser/500/300',
   'Safety Equipment', 'Warehouse C - Section 4', 'https://inventory.example.com/items/item019',
   '2024', '2025-12-01', 'Clean Air Corp.', '7 days', 'https://supplier.example.com/order/item019',
   100, 20, 100, 0, 20, 18.99, 379.80, true,
   'Item created on 2024-02-28; Checked out 100 units on 2024-06-10 (out of stock demo)',
   '11111111-1111-1111-1111-111111111111');
