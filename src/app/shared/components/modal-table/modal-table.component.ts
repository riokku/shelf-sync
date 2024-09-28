import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { InventoryItem } from '../../models/inventory-item.model';

@Component({
  selector: 'app-modal-table',
  standalone: true,
  imports: [
    DialogModule,
    TableModule
  ],
  templateUrl: './modal-table.component.html',
  styleUrl: './modal-table.component.scss'
})

export class ModalTableComponent {
  @Input() display: boolean = false;
  @Input() item: InventoryItem | undefined;
  @Output() onClose: EventEmitter<void> = new EventEmitter<void>();

  closeModal(){
    this.display = false;
    this.onClose.emit();
  }
}
