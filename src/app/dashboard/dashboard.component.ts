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
    FormsModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit{
  breadcrumbItems: MenuItem[] | undefined;
  home: MenuItem | undefined;
  files: TreeNode[] | undefined;

  selectedOptions: string[] = [];


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

  }
}
