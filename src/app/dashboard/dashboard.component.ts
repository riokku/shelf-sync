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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { InventoryItem, isLowStock } from '../shared/models/inventory-item.model';
import { ModalTableComponent } from '../shared/components/modal-table/modal-table.component';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { SupabaseService } from '../core/supabase.service';
import { toInventoryItem } from '../shared/utils/inventory-item.mapper';
import { resolveProfileName } from '../shared/utils/profile-label';
import { loadInventoryImagesByItemId } from '../shared/utils/inventory-item-images';
import { loadInventoryActivityByItemId } from '../shared/utils/inventory-item-activity';

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
        MatProgressSpinnerModule,
        BreadcrumbsComponent
    ],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit{

  private supabase = inject(SupabaseService).client;
  private dialog = inject(MatDialog);

  selectedOptions: string[] = [];
  inventoryList: InventoryItem[] = [];
  isLoading = true;

  showLowStockOnly = false;
  searchTerm = '';
  readonly isLowStock = isLowStock;

  get filteredInventoryList(): InventoryItem[] {
    let list = this.inventoryList;

    if (this.showLowStockOnly) {
      list = list.filter(isLowStock);
    }

    const search = this.searchTerm.trim().toLowerCase();
    if (search) {
      list = list.filter(item =>
        item.name.toLowerCase().includes(search) || item.id.toLowerCase().includes(search)
      );
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

  async ngOnInit() {
    await this.loadInventory();
  }

  private async loadInventory() {
    this.isLoading = true;

    const [{ data: items }, { data: profiles }] = await Promise.all([
      this.supabase.from('inventory_items').select('*').order('name'),
      this.supabase.from('profiles').select('*').order('full_name')
    ]);

    const profileList = profiles ?? [];
    const rows = items ?? [];
    const itemIds = rows.map(row => row.id);
    const [imagesByItemId, activityByItemId] = await Promise.all([
      loadInventoryImagesByItemId(this.supabase, itemIds),
      loadInventoryActivityByItemId(this.supabase, itemIds, profileList)
    ]);

    this.inventoryList = rows.map(row =>
      toInventoryItem(
        row,
        imagesByItemId.get(row.id) ?? [],
        resolveProfileName(row.checked_out_to, profileList),
        activityByItemId.get(row.id) ?? []
      )
    );
    this.isLoading = false;
  }

  showDetails(item:InventoryItem){
    const dialogRef = this.dialog.open(ModalTableComponent, {
      data: item,
      width: 'clamp(45rem, 78vw, 70rem)',
      maxWidth: '90vw',
      maxHeight: '95vh',
      panelClass: 'item-details-dialog'
    });

    dialogRef.afterClosed().subscribe(() => this.loadInventory());
  }

  toggleOption(value: string, checked: boolean){
    if (checked) {
      this.selectedOptions = [...this.selectedOptions, value];
    } else {
      this.selectedOptions = this.selectedOptions.filter(option => option !== value);
    }
  }

}
