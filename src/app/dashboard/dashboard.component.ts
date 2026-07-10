import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { InventoryItem, isLowStock } from '../shared/models/inventory-item.model';
import { ModalTableComponent } from '../shared/components/modal-table/modal-table.component';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';

@Component({
    selector: 'app-dashboard',
    imports: [
        CommonModule,
        FormsModule,
        MatIconModule,
        MatFormFieldModule,
        MatInputModule,
        MatExpansionModule,
        MatCheckboxModule,
        MatCardModule,
        MatButtonModule,
        BreadcrumbsComponent
    ],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit{

  private dialog = inject(MatDialog);

  selectedOptions: string[] = [];
  inventoryList: InventoryItem[] | undefined;

  showLowStockOnly = false;
  searchTerm = '';
  readonly isLowStock = isLowStock;

  get filteredInventoryList(): InventoryItem[] {
    let list = this.inventoryList ?? [];

    if (this.showLowStockOnly) {
      list = list.filter(isLowStock);
    }

    const search = this.searchTerm.trim().toLowerCase();
    if (search) {
      list = list.filter(item => item.name.toLowerCase().includes(search));
    }

    return list;
  }

  filterOptions = [
    { label: 'Electronics', value: 'electronics' },
    { label: 'Books', value: 'books' },
    { label: 'Clothing', value: 'clothing' },
    { label: 'Toys', value: 'toys' },
    { label: 'Home Appliances', value: 'home-appliances' }
  ];

  items = [
    { name: 'Smartphone', category: 'electronics' },
    { name: 'Novel', category: 'books' },
    { name: 'Shirt', category: 'clothing' },
    { name: 'Laptop', category: 'electronics' },
    { name: 'Blender', category: 'home-appliances' }
  ];

  ngOnInit() {
    this.inventoryList = [
      {
        "id": "a1e4c9b2-6f3d-4a8e-9c1a-2d7f5e8b3c6a",
        "name": "Printer Ink Cartridge",
        "description": "Black ink cartridge for office printers.",
        "image": "https://images.unsplash.com/photo-1705635847741-d38022d08d93?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGFic3RyYWN0JTIwZGFya3xlbnwwfHwwfHx8MA%3D%3D",
        "images": [
          "https://picsum.photos/seed/printer-ink-1/800/600",
          "https://picsum.photos/seed/printer-ink-2/800/600",
          "https://picsum.photos/seed/printer-ink-3/800/600",
          "https://picsum.photos/seed/printer-ink-4/800/600"
        ],
        "category": "Office Supplies",
        "physicalLocation": "Warehouse B - Aisle 3",
        "digitalLocation": "https://inventory.example.com/items/item001",
        "applicableYear": "2024",
        "expirationDate": "2025-08-15",
        "supplierName": "Print Supplies Inc.",
        "supplierLeadTime": "5 days",
        "orderLink": "https://supplier.example.com/order/item001",
        "quantityTotal": 150,
        "quantityPerContainer": 30,
        "quantityAllocated": 50,
        "quantityRemaining": 100,
        "lowQuantityThreshold": 20,
        "pricePerUnit": 25.99,
        "pricePerContainer": 779.70,
        "isCheckedOut": false,
        "checkedOutTo": "",
        "activityLog": [
          { "timestamp": "2024-02-01T09:15:00", "user": "System", "message": "Item created" },
          { "timestamp": "2024-03-12T14:30:00", "user": "Alice Chen", "message": "Allocated 50 units" },
          { "timestamp": "2024-04-05T11:00:00", "user": "Alice Chen", "message": "Updated" }
        ]
      },
      {
        "id": "b2f5d0c3-7a4e-4b9f-8d2b-3e8a6f9c4d7b",
        "name": "Wireless Mouse",
        "description": "Ergonomic wireless mouse with Bluetooth connectivity.",
        "image": "https://images.unsplash.com/photo-1720862166220-7b5b618dc81d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8YWJzdHJhY3QlMjBkYXJrfGVufDB8fDB8fHww",
        "images": [
          "https://picsum.photos/seed/wireless-mouse-1/800/600",
          "https://picsum.photos/seed/wireless-mouse-2/800/600",
          "https://picsum.photos/seed/wireless-mouse-3/800/600",
          "https://picsum.photos/seed/wireless-mouse-4/800/600"
        ],
        "category": "Electronics",
        "physicalLocation": "Warehouse A - Bin 12",
        "digitalLocation": "https://inventory.example.com/items/item002",
        "applicableYear": "2024",
        "expirationDate": "2026-01-10",
        "supplierName": "Tech Gear Supplies",
        "supplierLeadTime": "10 days",
        "orderLink": "https://supplier.example.com/order/item002",
        "quantityTotal": 300,
        "quantityPerContainer": 50,
        "quantityAllocated": 120,
        "quantityRemaining": 180,
        "lowQuantityThreshold": 50,
        "pricePerUnit": 18.49,
        "pricePerContainer": 924.50,
        "isCheckedOut": true,
        "checkedOutTo": "John Doe",
        "activityLog": [
          { "timestamp": "2024-01-15T08:00:00", "user": "System", "message": "Item created" },
          { "timestamp": "2024-04-01T10:45:00", "user": "John Doe", "message": "Checked out 120 units" }
        ]
      },
      {
        "id": "c3a6e1d4-8b5f-4c0a-9e3c-4f9b7a0d5e8c",
        "name": "Safety Gloves",
        "description": "Heavy-duty work gloves for industrial use. Heavy-duty work gloves for industrial use. Heavy-duty work gloves for industrial use.Heavy-duty work gloves for industrial use. Heavy-duty work gloves for industrial use.Heavy-duty work gloves for industrial use.",
        "image": "https://images.unsplash.com/photo-1668714341253-81139e265a19?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8YWJzdHJhY3QlMjBkYXJrfGVufDB8fDB8fHww",
        "images": [
          "https://picsum.photos/seed/safety-gloves-1/800/600",
          "https://picsum.photos/seed/safety-gloves-2/800/600",
          "https://picsum.photos/seed/safety-gloves-3/800/600",
          "https://picsum.photos/seed/safety-gloves-4/800/600"
        ],
        "category": "Safety Equipment",
        "physicalLocation": "Warehouse C - Shelf 5",
        "digitalLocation": "https://inventory.example.com/items/item003",
        "applicableYear": "2023",
        "expirationDate": "2027-06-20",
        "supplierName": "Industrial Safety Co.",
        "supplierLeadTime": "12 days",
        "orderLink": "https://supplier.example.com/order/item003",
        "quantityTotal": 500,
        "quantityPerContainer": 100,
        "quantityAllocated": 200,
        "quantityRemaining": 300,
        "lowQuantityThreshold": 100,
        "pricePerUnit": 7.99,
        "pricePerContainer": 799.00,
        "isCheckedOut": false,
        "checkedOutTo": "",
        "activityLog": [
          { "timestamp": "2023-07-10T09:00:00", "user": "System", "message": "Item created" },
          { "timestamp": "2024-02-25T13:20:00", "user": "Marcus Lee", "message": "Allocated 200 units" }
        ]
      },
      {
        "id": "d4b7f2e5-9c6a-4d1b-8f4d-5a0c8b1e6f9d",
        "name": "USB Flash Drive",
        "description": "64GB USB 3.0 flash drive for data storage.",
        "image": "https://images.unsplash.com/photo-1719212752796-5d9767ea0f83?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8YWJzdHJhY3QlMjBkYXJrfGVufDB8fDB8fHww",
        "images": [
          "https://picsum.photos/seed/usb-drive-1/800/600",
          "https://picsum.photos/seed/usb-drive-2/800/600",
          "https://picsum.photos/seed/usb-drive-3/800/600",
          "https://picsum.photos/seed/usb-drive-4/800/600"
        ],
        "category": "Electronics",
        "physicalLocation": "Warehouse A - Bin 8",
        "digitalLocation": "https://inventory.example.com/items/item004",
        "applicableYear": "2024",
        "expirationDate": "2028-12-31",
        "supplierName": "Data Tech Supplies",
        "supplierLeadTime": "7 days",
        "orderLink": "https://supplier.example.com/order/item004",
        "quantityTotal": 400,
        "quantityPerContainer": 100,
        "quantityAllocated": 100,
        "quantityRemaining": 300,
        "lowQuantityThreshold": 50,
        "pricePerUnit": 12.99,
        "pricePerContainer": 1299.00,
        "isCheckedOut": true,
        "checkedOutTo": "Jane Smith",
        "activityLog": [
          { "timestamp": "2024-03-05T10:00:00", "user": "System", "message": "Item created" },
          { "timestamp": "2024-06-15T15:10:00", "user": "Jane Smith", "message": "Checked out 100 units" }
        ]
      },
      {
        "id": "e5c8a3f6-0d7b-4e2c-9a5e-6b1d9c2f7a0e",
        "name": "Office Chair",
        "description": "Ergonomic office chair with lumbar support.",
        "image": "https://plus.unsplash.com/premium_photo-1673036823812-b0d86a2cead1?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8YWJzdHJhY3QlMjBkYXJrfGVufDB8fDB8fHww",
        "images": [
          "https://picsum.photos/seed/office-chair-1/800/600",
          "https://picsum.photos/seed/office-chair-2/800/600",
          "https://picsum.photos/seed/office-chair-3/800/600",
          "https://picsum.photos/seed/office-chair-4/800/600"
        ],
        "category": "Furniture",
        "physicalLocation": "Warehouse D - Section 1",
        "digitalLocation": "https://inventory.example.com/items/item005",
        "applicableYear": "2023",
        "expirationDate": "2030-11-10",
        "supplierName": "Office Essentials",
        "supplierLeadTime": "14 days",
        "orderLink": "https://supplier.example.com/order/item005",
        "quantityTotal": 50,
        "quantityPerContainer": 10,
        "quantityAllocated": 45,
        "quantityRemaining": 5,
        "lowQuantityThreshold": 10,
        "pricePerUnit": 199.99,
        "pricePerContainer": 1999.90,
        "isCheckedOut": false,
        "checkedOutTo": "",
        "activityLog": [
          { "timestamp": "2023-09-01T09:30:00", "user": "System", "message": "Item created" },
          { "timestamp": "2024-01-10T12:00:00", "user": "Priya Patel", "message": "Allocated 20 units" }
        ]
      },
      {
        "id": "f6d9b4a7-1e8c-4f3d-8b6f-7c2e0d3a8b1f",
        "name": "Laptop Stand",
        "description": "Adjustable aluminum laptop stand for ergonomic use.",
        "image": "https://images.unsplash.com/photo-1708898812644-c0bbf3ada776?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTl8fGFic3RyYWN0JTIwZGFya3xlbnwwfHwwfHx8MA%3D%3D",
        "images": [
          "https://picsum.photos/seed/laptop-stand-1/800/600",
          "https://picsum.photos/seed/laptop-stand-2/800/600",
          "https://picsum.photos/seed/laptop-stand-3/800/600",
          "https://picsum.photos/seed/laptop-stand-4/800/600"
        ],
        "category": "Office Equipment",
        "physicalLocation": "Warehouse B - Rack 4",
        "digitalLocation": "https://inventory.example.com/items/item006",
        "applicableYear": "2024",
        "expirationDate": "2026-03-15",
        "supplierName": "Ergo Solutions",
        "supplierLeadTime": "5 days",
        "orderLink": "https://supplier.example.com/order/item006",
        "quantityTotal": 200,
        "quantityPerContainer": 20,
        "quantityAllocated": 50,
        "quantityRemaining": 150,
        "lowQuantityThreshold": 30,
        "pricePerUnit": 35.99,
        "pricePerContainer": 719.80,
        "isCheckedOut": false,
        "checkedOutTo": "",
        "activityLog": [
          { "timestamp": "2024-01-12T09:00:00", "user": "System", "message": "Item created" },
          { "timestamp": "2024-03-22T14:00:00", "user": "Priya Patel", "message": "Allocated 50 units" }
        ]
      },
      {
        "id": "a7e0c5b8-2f9d-4a4e-9c7a-8d3f1e4b9c2a",
        "name": "Power Drill",
        "description": "Cordless power drill with rechargeable battery.",
        "image": "https://images.unsplash.com/photo-1689308271305-58e75832289b?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTh8fGFic3RyYWN0JTIwZGFya3xlbnwwfHwwfHx8MA%3D%3D",
        "images": [
          "https://picsum.photos/seed/power-drill-1/800/600",
          "https://picsum.photos/seed/power-drill-2/800/600",
          "https://picsum.photos/seed/power-drill-3/800/600",
          "https://picsum.photos/seed/power-drill-4/800/600"
        ],
        "category": "Tools",
        "physicalLocation": "Warehouse D - Shelf 9",
        "digitalLocation": "https://inventory.example.com/items/item007",
        "applicableYear": "2024",
        "expirationDate": "2028-12-01",
        "supplierName": "Tool Masters Inc.",
        "supplierLeadTime": "10 days",
        "orderLink": "https://supplier.example.com/order/item007",
        "quantityTotal": 75,
        "quantityPerContainer": 15,
        "quantityAllocated": 20,
        "quantityRemaining": 55,
        "lowQuantityThreshold": 10,
        "pricePerUnit": 99.99,
        "pricePerContainer": 1499.85,
        "isCheckedOut": true,
        "checkedOutTo": "Jake Thompson",
        "activityLog": [
          { "timestamp": "2024-02-14T08:45:00", "user": "System", "message": "Item created" },
          { "timestamp": "2024-05-05T16:30:00", "user": "Jake Thompson", "message": "Checked out 20 units" }
        ]
      },
      {
        "id": "b8f1d6c9-3a0e-4b5f-8d8b-9e4a2f5c0d3b",
        "name": "External Hard Drive",
        "description": "1TB external hard drive for data storage.",
        "image": "https://plus.unsplash.com/premium_photo-1675603849825-483711b5e3a7?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTd8fGFic3RyYWN0JTIwZGFya3xlbnwwfHwwfHx8MA%3D%3D",
        "images": [
          "https://picsum.photos/seed/external-drive-1/800/600",
          "https://picsum.photos/seed/external-drive-2/800/600",
          "https://picsum.photos/seed/external-drive-3/800/600",
          "https://picsum.photos/seed/external-drive-4/800/600"
        ],
        "category": "Electronics",
        "physicalLocation": "Warehouse A - Bin 5",
        "digitalLocation": "https://inventory.example.com/items/item008",
        "applicableYear": "2023",
        "expirationDate": "2027-10-15",
        "supplierName": "Data Storage Co.",
        "supplierLeadTime": "7 days",
        "orderLink": "https://supplier.example.com/order/item008",
        "quantityTotal": 250,
        "quantityPerContainer": 50,
        "quantityAllocated": 100,
        "quantityRemaining": 150,
        "lowQuantityThreshold": 25,
        "pricePerUnit": 59.99,
        "pricePerContainer": 2999.50,
        "isCheckedOut": false,
        "checkedOutTo": "",
        "activityLog": [
          { "timestamp": "2023-11-05T09:00:00", "user": "System", "message": "Item created" },
          { "timestamp": "2024-02-10T11:15:00", "user": "Marcus Lee", "message": "Allocated 100 units" }
        ]
      },
      {
        "id": "c9a2e7d0-4b1f-4c6a-9e9c-0f5b3a6d1e4c",
        "name": "Air Purifier",
        "description": "Portable air purifier with HEPA filter.",
        "image": "https://images.unsplash.com/photo-1703100832089-ae79c6f51f88?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjB8fGFic3RyYWN0JTIwZGFya3xlbnwwfHwwfHx8MA%3D%3D",
        "images": [
          "https://picsum.photos/seed/air-purifier-1/800/600",
          "https://picsum.photos/seed/air-purifier-2/800/600",
          "https://picsum.photos/seed/air-purifier-3/800/600",
          "https://picsum.photos/seed/air-purifier-4/800/600"
        ],
        "category": "Appliances",
        "physicalLocation": "Warehouse C - Section 2",
        "digitalLocation": "https://inventory.example.com/items/item009",
        "applicableYear": "2024",
        "expirationDate": "2029-05-10",
        "supplierName": "Clean Air Corp.",
        "supplierLeadTime": "8 days",
        "orderLink": "https://supplier.example.com/order/item009",
        "quantityTotal": 60,
        "quantityPerContainer": 10,
        "quantityAllocated": 30,
        "quantityRemaining": 30,
        "lowQuantityThreshold": 15,
        "pricePerUnit": 129.99,
        "pricePerContainer": 1299.90,
        "isCheckedOut": true,
        "checkedOutTo": "Emily Carter",
        "activityLog": [
          { "timestamp": "2024-04-22T10:00:00", "user": "System", "message": "Item created" },
          { "timestamp": "2024-06-01T09:40:00", "user": "Emily Carter", "message": "Allocated 30 units" }
        ]
      },
      {
        "id": "d0b3f8e1-5c2a-4d7b-8f0d-1a6c4b7e2f5d",
        "name": "Wireless Keyboard",
        "description": "Compact wireless keyboard with Bluetooth connection.",
        "image": "https://media.istockphoto.com/id/1172073205/photo/blurred-abstract-bokeh-background.webp?a=1&b=1&s=612x612&w=0&k=20&c=-9tpJdwHPHgo1zHRbLJYB_sr7pOBZjG6M-JCfFfiwNo=",
        "images": [
          "https://picsum.photos/seed/wireless-keyboard-1/800/600",
          "https://picsum.photos/seed/wireless-keyboard-2/800/600",
          "https://picsum.photos/seed/wireless-keyboard-3/800/600",
          "https://picsum.photos/seed/wireless-keyboard-4/800/600"
        ],
        "category": "Electronics",
        "physicalLocation": "Warehouse A - Rack 3",
        "digitalLocation": "https://inventory.example.com/items/item010",
        "applicableYear": "2024",
        "expirationDate": "2027-11-20",
        "supplierName": "Tech Solutions Ltd.",
        "supplierLeadTime": "6 days",
        "orderLink": "https://supplier.example.com/order/item010",
        "quantityTotal": 120,
        "quantityPerContainer": 40,
        "quantityAllocated": 80,
        "quantityRemaining": 40,
        "lowQuantityThreshold": 20,
        "pricePerUnit": 45.99,
        "pricePerContainer": 1839.60,
        "isCheckedOut": false,
        "checkedOutTo": "",
        "activityLog": [
          { "timestamp": "2024-02-05T09:00:00", "user": "System", "message": "Item created" },
          { "timestamp": "2024-03-18T13:00:00", "user": "Alice Chen", "message": "Allocated 80 units" }
        ]
      }
    ]
  }

  showDetails(item:InventoryItem){
    this.dialog.open(ModalTableComponent, {
      data: item,
      width: 'clamp(45rem, 78vw, 70rem)',
      maxWidth: '90vw',
      maxHeight: '95vh',
      panelClass: 'item-details-dialog'
    });
  }

  toggleOption(value: string, checked: boolean){
    if (checked) {
      this.selectedOptions = [...this.selectedOptions, value];
    } else {
      this.selectedOptions = this.selectedOptions.filter(option => option !== value);
    }
  }

}
