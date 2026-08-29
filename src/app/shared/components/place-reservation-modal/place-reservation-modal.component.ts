import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { InventoryItemReservationWithItem } from '../../utils/inventory-item-reservations';
import { toIsoDateString } from '../../utils/date';
import { HelpTooltipComponent } from '../help-tooltip/help-tooltip.component';

/** Every item is reservable (unlike PlaceOrderModalComponent's items, which
 *  need a linked supplier first) — quantityRemaining is carried along so
 *  the live availability hint below doesn't need a second query per pick.
 *  isLocked is surfaced (not filtered out beforehand) so a locked item still
 *  shows up in the picker with a lock icon next to it, same "visible but
 *  unselectable, not hidden" treatment the bulk-edit checkbox gives a locked
 *  item elsewhere in this app — create_reservation() itself is the real
 *  enforcement (see its own migration), this is purely a UX nicety so
 *  picking one doesn't silently fail on submit instead. */
export interface ReservableItem {
  id: string;
  name: string;
  quantityRemaining: number;
  isLocked: boolean;
}

export interface PlaceReservationModalData {
  items: ReservableItem[];
  /** Already loaded by ManageReservationsComponent for its own list — reused
   *  here for the live availability hint rather than re-querying. */
  reservations: InventoryItemReservationWithItem[];
}

@Component({
  selector: 'app-place-reservation-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    HelpTooltipComponent
  ],
  templateUrl: './place-reservation-modal.component.html',
  styleUrl: './place-reservation-modal.component.scss',
})
export class PlaceReservationModalComponent {
  private supabase = inject(SupabaseService).client;
  dialogRef = inject(MatDialogRef<PlaceReservationModalComponent, boolean>);
  data = inject<PlaceReservationModalData>(MAT_DIALOG_DATA);

  itemSearchControl = new FormControl('', { nonNullable: true });
  selectedItem: ReservableItem | null = null;

  // Matches by name or id, same dual match PlaceOrderModalComponent's own
  // item autocomplete uses.
  get filteredItems(): ReservableItem[] {
    const term = this.itemSearchControl.value.trim().toLowerCase();
    if (!term) {
      return this.data.items;
    }
    return this.data.items.filter(item =>
      item.name.toLowerCase().includes(term) || item.id.toLowerCase().includes(term)
    );
  }

  onItemSelected(event: MatAutocompleteSelectedEvent) {
    const itemId = event.option.value as string;
    this.selectedItem = this.data.items.find(item => item.id === itemId) ?? null;
    this.itemSearchControl.setValue(this.selectedItem?.name ?? '', { emitEvent: false });
  }

  reservationForm = new FormGroup({
    dateRange: new FormGroup({
      start: new FormControl<Date | null>(null, { validators: [Validators.required] }),
      end: new FormControl<Date | null>(null, { validators: [Validators.required] })
    }),
    quantity: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1)] }),
    reservedFor: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    note: new FormControl('', { nonNullable: true })
  });

  isSaving = false;
  error: string | null = null;

  /** Live preview only, computed the same way the create_reservation RPC
   *  itself computes availability — that RPC stays the real source of truth
   *  on submit, so a hint that's gone stale by a few seconds (e.g. someone
   *  else just booked the same dates) can't cause a bad write, just a
   *  momentarily-optimistic number here. Null until both an item and a full
   *  date range are picked. */
  get availableForSelectedRange(): number | null {
    if (!this.selectedItem) {
      return null;
    }
    const { start, end } = this.reservationForm.controls.dateRange.value;
    if (!start || !end) {
      return this.selectedItem.quantityRemaining;
    }
    const startIso = toIsoDateString(start)!;
    const endIso = toIsoDateString(end)!;
    const item = this.selectedItem;
    const alreadyReserved = this.data.reservations
      .filter(reservation =>
        reservation.itemId === item.id
        && (reservation.status === 'reserved' || reservation.status === 'picked_up')
        && reservation.startDate <= endIso
        && reservation.endDate >= startIso
      )
      .reduce((sum, reservation) => sum + reservation.quantity, 0);
    return item.quantityRemaining - alreadyReserved;
  }

  async save() {
    if (this.isSaving) {
      return;
    }
    if (!this.selectedItem) {
      this.error = 'Pick an item to reserve.';
      return;
    }
    if (this.reservationForm.invalid) {
      this.reservationForm.markAllAsTouched();
      return;
    }

    // No manual end->=start check needed here — mat-date-range-input's own
    // matStartDate/matEndDate directives already validate that themselves
    // (matStartDateInvalid/matEndDateInvalid) as part of the form's normal
    // validity, so an inverted range is already caught by the
    // reservationForm.invalid branch above, same as any other invalid field.
    const value = this.reservationForm.getRawValue();
    const startDate = toIsoDateString(value.dateRange.start)!;
    const endDate = toIsoDateString(value.dateRange.end)!;

    this.isSaving = true;
    this.error = null;

    const { error } = await this.supabase.rpc('create_reservation', {
      item_id: this.selectedItem.id,
      start_date: startDate,
      end_date: endDate,
      quantity: value.quantity!,
      reserved_for: value.reservedFor.trim(),
      note: value.note.trim() || undefined
    });

    this.isSaving = false;

    if (error) {
      this.error = error.message;
      return;
    }

    this.dialogRef.close(true);
  }

  cancel() {
    this.dialogRef.close();
  }
}
