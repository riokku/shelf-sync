-- Local dev seed data, ported from the hardcoded array in
-- src/app/dashboard/dashboard.component.ts. checked_out_to is left null for
-- every row since it's a real FK to profiles(auth users) now, and this seed
-- doesn't create any auth users.
insert into public.inventory_items (
  name, description, image, category, physical_location, digital_location,
  applicable_year, expiration_date, supplier_name, supplier_lead_time, order_link,
  quantity_total, quantity_per_container, quantity_allocated, quantity_remaining,
  low_quantity_threshold, price_per_unit, price_per_container, is_checked_out, activity_log
) values
  ('Printer Ink Cartridge', 'Black ink cartridge for office printers.',
   'https://images.unsplash.com/photo-1705635847741-d38022d08d93?w=500&auto=format&fit=crop&q=60',
   'Office Supplies', 'Warehouse B - Aisle 3', 'https://inventory.example.com/items/item001',
   '2024', '2025-08-15', 'Print Supplies Inc.', '5 days', 'https://supplier.example.com/order/item001',
   150, 30, 50, 100, 20, 25.99, 779.70, false,
   'Item created on 2024-02-01; Allocated 50 units on 2024-03-12; Updated on 2024-04-05'),

  ('Wireless Mouse', 'Ergonomic wireless mouse with Bluetooth connectivity.',
   'https://images.unsplash.com/photo-1720862166220-7b5b618dc81d?w=500&auto=format&fit=crop&q=60',
   'Electronics', 'Warehouse A - Bin 12', 'https://inventory.example.com/items/item002',
   '2024', '2026-01-10', 'Tech Gear Supplies', '10 days', 'https://supplier.example.com/order/item002',
   300, 50, 120, 180, 50, 18.49, 924.50, true,
   'Item created on 2024-01-15; Checked out 120 units on 2024-04-01'),

  ('Safety Gloves', 'Heavy-duty work gloves for industrial use.',
   'https://images.unsplash.com/photo-1668714341253-81139e265a19?w=500&auto=format&fit=crop&q=60',
   'Safety Equipment', 'Warehouse C - Shelf 5', 'https://inventory.example.com/items/item003',
   '2023', '2027-06-20', 'Industrial Safety Co.', '12 days', 'https://supplier.example.com/order/item003',
   500, 100, 200, 300, 100, 7.99, 799.00, false,
   'Item created on 2023-07-10; Allocated 200 units on 2024-02-25'),

  ('USB Flash Drive', '64GB USB 3.0 flash drive for data storage.',
   'https://images.unsplash.com/photo-1719212752796-5d9767ea0f83?w=500&auto=format&fit=crop&q=60',
   'Electronics', 'Warehouse A - Bin 8', 'https://inventory.example.com/items/item004',
   '2024', '2028-12-31', 'Data Tech Supplies', '7 days', 'https://supplier.example.com/order/item004',
   400, 100, 100, 300, 50, 12.99, 1299.00, true,
   'Item created on 2024-03-05; Checked out 100 units on 2024-06-15'),

  ('Office Chair', 'Ergonomic office chair with lumbar support.',
   'https://plus.unsplash.com/premium_photo-1673036823812-b0d86a2cead1?w=500&auto=format&fit=crop&q=60',
   'Furniture', 'Warehouse D - Section 1', 'https://inventory.example.com/items/item005',
   '2023', '2030-11-10', 'Office Essentials', '14 days', 'https://supplier.example.com/order/item005',
   50, 10, 45, 5, 10, 199.99, 1999.90, false,
   'Item created on 2023-09-01; Allocated 45 units on 2024-01-10 (low stock demo)'),

  ('Laptop Stand', 'Adjustable aluminum laptop stand for ergonomic use.',
   'https://images.unsplash.com/photo-1708898812644-c0bbf3ada776?w=500&auto=format&fit=crop&q=60',
   'Office Equipment', 'Warehouse B - Rack 4', 'https://inventory.example.com/items/item006',
   '2024', '2026-03-15', 'Ergo Solutions', '5 days', 'https://supplier.example.com/order/item006',
   200, 20, 50, 150, 30, 35.99, 719.80, false,
   'Item created on 2024-01-12; Allocated 50 units on 2024-03-22'),

  ('Power Drill', 'Cordless power drill with rechargeable battery.',
   'https://images.unsplash.com/photo-1689308271305-58e75832289b?w=500&auto=format&fit=crop&q=60',
   'Tools', 'Warehouse D - Shelf 9', 'https://inventory.example.com/items/item007',
   '2024', '2028-12-01', 'Tool Masters Inc.', '10 days', 'https://supplier.example.com/order/item007',
   75, 15, 20, 55, 10, 99.99, 1499.85, true,
   'Item created on 2024-02-14; Checked out 20 units on 2024-05-05'),

  ('External Hard Drive', '1TB external hard drive for data storage.',
   'https://plus.unsplash.com/premium_photo-1675603849825-483711b5e3a7?w=500&auto=format&fit=crop&q=60',
   'Electronics', 'Warehouse A - Bin 5', 'https://inventory.example.com/items/item008',
   '2023', '2027-10-15', 'Data Storage Co.', '7 days', 'https://supplier.example.com/order/item008',
   250, 50, 100, 150, 25, 59.99, 2999.50, false,
   'Item created on 2023-11-05; Allocated 100 units on 2024-02-10'),

  ('Air Purifier', 'Portable air purifier with HEPA filter.',
   'https://images.unsplash.com/photo-1703100832089-ae79c6f51f88?w=500&auto=format&fit=crop&q=60',
   'Appliances', 'Warehouse C - Section 2', 'https://inventory.example.com/items/item009',
   '2024', '2029-05-10', 'Clean Air Corp.', '8 days', 'https://supplier.example.com/order/item009',
   60, 10, 30, 30, 15, 129.99, 1299.90, true,
   'Item created on 2024-04-22; Allocated 30 units on 2024-06-01'),

  ('Wireless Keyboard', 'Compact wireless keyboard with Bluetooth connection.',
   'https://media.istockphoto.com/id/1172073205/photo/blurred-abstract-bokeh-background.webp',
   'Electronics', 'Warehouse A - Rack 3', 'https://inventory.example.com/items/item010',
   '2024', '2027-11-20', 'Tech Solutions Ltd.', '6 days', 'https://supplier.example.com/order/item010',
   120, 40, 80, 40, 20, 45.99, 1839.60, false,
   'Item created on 2024-02-05; Allocated 80 units on 2024-03-18');
