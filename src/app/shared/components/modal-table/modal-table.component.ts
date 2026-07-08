import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { InventoryItem } from '../../models/inventory-item.model';

@Component({
    selector: 'app-modal-table',
    imports: [
        MatDialogModule,
        MatIconModule
    ],
    templateUrl: './modal-table.component.html',
    styleUrl: './modal-table.component.scss'
})

export class ModalTableComponent {
  dialogRef = inject(MatDialogRef<ModalTableComponent>);
  data = inject<InventoryItem>(MAT_DIALOG_DATA);

  closeModal(){
    this.dialogRef.close();
  }
}
