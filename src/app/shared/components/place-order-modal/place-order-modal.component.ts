import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { AuthService } from '../../../core/auth.service';
import { logInventoryItemActivity } from '../../utils/inventory-item-activity';
import { logActivity } from '../../utils/activity-log';

/** An item eligible to be ordered — only items with a supplier already
 *  linked show up here at all (an order needs to know who it's from), so
 *  supplierId/supplierName are non-nullable, unlike InventoryItem's own
 *  optional versions of the same fields. */
export interface OrderableItem {
  id: string;
  name: string;
  supplierId: string;
  supplierName: string;
}

export interface PlaceOrderModalData {
  items: OrderableItem[];
}

@Component({
  selector: 'app-place-order-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './place-order-modal.component.html',
  styleUrl: './place-order-modal.component.scss',
})
export class PlaceOrderModalComponent {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  dialogRef = inject(MatDialogRef<PlaceOrderModalComponent, boolean>);
  data = inject<PlaceOrderModalData>(MAT_DIALOG_DATA);

  itemSearchControl = new FormControl('', { nonNullable: true });
  selectedItem: OrderableItem | null = null;

  get filteredItems(): OrderableItem[] {
    const term = this.itemSearchControl.value.trim().toLowerCase();
    if (!term) {
      return this.data.items;
    }
    return this.data.items.filter(item => item.name.toLowerCase().includes(term));
  }

  onItemSelected(event: MatAutocompleteSelectedEvent) {
    const itemId = event.option.value as string;
    this.selectedItem = this.data.items.find(item => item.id === itemId) ?? null;
    this.itemSearchControl.setValue(this.selectedItem?.name ?? '', { emitEvent: false });
  }

  orderForm = new FormGroup({
    quantity: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1)] }),
    note: new FormControl('', { nonNullable: true })
  });

  isSaving = false;
  error: string | null = null;

  async save() {
    if (this.isSaving) {
      return;
    }
    if (!this.selectedItem) {
      this.error = 'Pick an item to order.';
      return;
    }
    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.error = null;

    const session = await this.authService.getSession();
    if (!session) {
      this.isSaving = false;
      this.error = 'You must be signed in to place an order.';
      return;
    }

    const value = this.orderForm.getRawValue();
    const item = this.selectedItem;

    const { error } = await this.supabase.from('inventory_item_orders').insert({
      item_id: item.id,
      supplier_id: item.supplierId,
      supplier_name: item.supplierName,
      quantity: value.quantity!,
      note: value.note.trim() || null,
      ordered_by: session.user.id
    });

    if (error) {
      this.isSaving = false;
      this.error = error.message;
      return;
    }

    // Best-effort, same as every other post-write activity log call in this
    // app — the order itself already committed, so a logging failure here
    // shouldn't be surfaced as the order having failed.
    const message = `Ordered ${value.quantity} units from ${item.supplierName}`;
    await logInventoryItemActivity(this.supabase, item.id, session.user.id, message);
    await logActivity(this.supabase, session.user.id, 'inventory_item', item.id, `${item.name}: ${message}`);

    this.isSaving = false;
    this.dialogRef.close(true);
  }

  cancel() {
    this.dialogRef.close();
  }
}
