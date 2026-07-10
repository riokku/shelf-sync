import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { InventoryItem, isLowStock } from '../../models/inventory-item.model';
import { ImageGalleryComponent } from '../image-gallery/image-gallery.component';

@Component({
    selector: 'app-modal-table',
    imports: [
        DatePipe,
        MatDialogModule,
        MatIconModule,
        MatButtonModule,
        MatTooltipModule,
        MatTabsModule,
        ImageGalleryComponent
    ],
    templateUrl: './modal-table.component.html',
    styleUrl: './modal-table.component.scss'
})

export class ModalTableComponent {
  dialogRef = inject(MatDialogRef<ModalTableComponent>);
  data = inject<InventoryItem>(MAT_DIALOG_DATA);

  idCopied = false;
  readonly isLowStock = isLowStock(this.data);

  closeModal(){
    this.dialogRef.close();
  }

  async copyId(){
    await navigator.clipboard.writeText(this.data.id);
    this.idCopied = true;
    setTimeout(() => this.idCopied = false, 1500);
  }

  activityIcon(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('checked out')) {
      return 'logout';
    }
    if (lower.includes('checked in')) {
      return 'login';
    }
    if (lower.includes('created')) {
      return 'add_circle';
    }
    if (lower.includes('allocated')) {
      return 'inventory_2';
    }
    if (lower.includes('updated')) {
      return 'edit';
    }
    return 'history';
  }
}
