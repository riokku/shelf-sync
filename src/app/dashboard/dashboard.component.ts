import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { MenuItem } from 'primeng/api';
import { RouterModule } from '@angular/router';
import { ToolbarModule } from 'primeng/toolbar';
import { ButtonModule } from 'primeng/button';
import { SplitButtonModule } from 'primeng/splitbutton';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { AccordionModule } from 'primeng/accordion';
import { TreeNode } from 'primeng/api';
import { CheckboxModule } from 'primeng/checkbox';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { InventoryItem } from '../shared/models/inventory-item.model';


@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    BreadcrumbModule,
    RouterModule,
    CommonModule,
    ToolbarModule,
    ButtonModule,
    SplitButtonModule,
    IconFieldModule,
    InputIconModule,
    AccordionModule,
    CheckboxModule,
    FormsModule,
    CardModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit{
  breadcrumbItems: MenuItem[] | undefined;
  home: MenuItem | undefined;
  files: TreeNode[] | undefined;

  selectedOptions: string[] = [];

  inventoryList: InventoryItem[] | undefined;

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
    this.breadcrumbItems = [
      {
        icon: 'pi pi-home',
        route: '/'
      },
      {
        label: 'Components'
      },
      {
        label: 'Form'
      },
      {
        label: 'InputText',
        route: '/inputtext'
      }
    ];

    this.inventoryList = [
      {
        "id": "item001",
        "name": "Printer Ink Cartridge",
        "description": "Black ink cartridge for office printers.",
        "image": "https://images.unsplash.com/photo-1705635847741-d38022d08d93?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGFic3RyYWN0JTIwZGFya3xlbnwwfHwwfHx8MA%3D%3D",
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
        "activityLog": "Item created on 2024-02-01; Allocated 50 units on 2024-03-12; Updated on 2024-04-05"
      },
      {
        "id": "item002",
        "name": "Wireless Mouse",
        "description": "Ergonomic wireless mouse with Bluetooth connectivity.",
        "image": "https://images.unsplash.com/photo-1720862166220-7b5b618dc81d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8YWJzdHJhY3QlMjBkYXJrfGVufDB8fDB8fHww",
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
        "activityLog": "Item created on 2024-01-15; Checked out 120 units on 2024-04-01"
      },
      {
        "id": "item003",
        "name": "Safety Gloves",
        "description": "Heavy-duty work gloves for industrial use. Heavy-duty work gloves for industrial use. Heavy-duty work gloves for industrial use.Heavy-duty work gloves for industrial use. Heavy-duty work gloves for industrial use.Heavy-duty work gloves for industrial use.",
        "image": "https://images.unsplash.com/photo-1668714341253-81139e265a19?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8YWJzdHJhY3QlMjBkYXJrfGVufDB8fDB8fHww",
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
        "activityLog": "Item created on 2023-07-10; Allocated 200 units on 2024-02-25"
      },
      {
        "id": "item004",
        "name": "USB Flash Drive",
        "description": "64GB USB 3.0 flash drive for data storage.",
        "image": "https://images.unsplash.com/photo-1719212752796-5d9767ea0f83?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8YWJzdHJhY3QlMjBkYXJrfGVufDB8fDB8fHww",
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
        "activityLog": "Item created on 2024-03-05; Checked out 100 units on 2024-06-15"
      },
      {
        "id": "item005",
        "name": "Office Chair",
        "description": "Ergonomic office chair with lumbar support.",
        "image": "https://plus.unsplash.com/premium_photo-1673036823812-b0d86a2cead1?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8YWJzdHJhY3QlMjBkYXJrfGVufDB8fDB8fHww",
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
        "quantityAllocated": 20,
        "quantityRemaining": 30,
        "lowQuantityThreshold": 10,
        "pricePerUnit": 199.99,
        "pricePerContainer": 1999.90,
        "isCheckedOut": false,
        "checkedOutTo": "",
        "activityLog": "Item created on 2023-09-01; Allocated 20 units on 2024-01-10"
      },
      {
        "id": "item006",
        "name": "Laptop Stand",
        "description": "Adjustable aluminum laptop stand for ergonomic use.",
        "image": "https://images.unsplash.com/photo-1708898812644-c0bbf3ada776?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTl8fGFic3RyYWN0JTIwZGFya3xlbnwwfHwwfHx8MA%3D%3D",
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
        "activityLog": "Item created on 2024-01-12; Allocated 50 units on 2024-03-22"
      },
      {
        "id": "item007",
        "name": "Power Drill",
        "description": "Cordless power drill with rechargeable battery.",
        "image": "https://images.unsplash.com/photo-1689308271305-58e75832289b?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTh8fGFic3RyYWN0JTIwZGFya3xlbnwwfHwwfHx8MA%3D%3D",
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
        "activityLog": "Item created on 2024-02-14; Checked out 20 units on 2024-05-05"
      },
      {
        "id": "item008",
        "name": "External Hard Drive",
        "description": "1TB external hard drive for data storage.",
        "image": "https://plus.unsplash.com/premium_photo-1675603849825-483711b5e3a7?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTd8fGFic3RyYWN0JTIwZGFya3xlbnwwfHwwfHx8MA%3D%3D",
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
        "activityLog": "Item created on 2023-11-05; Allocated 100 units on 2024-02-10"
      },
      {
        "id": "item009",
        "name": "Air Purifier",
        "description": "Portable air purifier with HEPA filter.",
        "image": "https://images.unsplash.com/photo-1703100832089-ae79c6f51f88?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjB8fGFic3RyYWN0JTIwZGFya3xlbnwwfHwwfHx8MA%3D%3D",
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
        "activityLog": "Item created on 2024-04-22; Allocated 30 units on 2024-06-01"
      },
      {
        "id": "item010",
        "name": "Wireless Keyboard",
        "description": "Compact wireless keyboard with Bluetooth connection.",
        "image": "https://media.istockphoto.com/id/1172073205/photo/blurred-abstract-bokeh-background.webp?a=1&b=1&s=612x612&w=0&k=20&c=-9tpJdwHPHgo1zHRbLJYB_sr7pOBZjG6M-JCfFfiwNo=",
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
        "activityLog": "Item created on 2024-02-05; Allocated 80 units on 2024-03-18"
      }
    ]
  }
}
