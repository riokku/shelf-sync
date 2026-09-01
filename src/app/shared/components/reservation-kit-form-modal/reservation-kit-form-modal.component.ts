import { Component, inject } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ReservationKitService } from '../../../core/reservation-kit.service';
import { ReservationKit } from '../../models/reservation-kit.model';

interface KitPickableItem {
  id: string;
  name: string;
}

/** A working item+quantity row while the kit is being built/edited — plain
 *  class-field array, same shape ModalTableComponent's own EditableContainer
 *  already establishes for a small repeatable-row editor, rather than an
 *  Angular FormArray. item stays null until something's actually picked from
 *  the autocomplete (searchTerm alone isn't a selection). */
interface EditableKitLine {
  searchTerm: string;
  item: KitPickableItem | null;
  quantity: number | null;
}

/** Undefined kit means "add new" — same optional-data-means-create shape
 *  SupplierFormModalComponent already uses for its own add/edit dialog.
 *  `items` is the org's full reservable-item catalog (id+name only — this
 *  dialog never needs quantityRemaining/isLocked/etc., unlike
 *  PlaceReservationModalComponent's own ReservableItem), passed in by
 *  ManageReservationsComponent from the same allItems it already loads for
 *  its own "New reservation" picker. */
export interface ReservationKitFormModalData {
  kit?: ReservationKit;
  items: KitPickableItem[];
}

@Component({
  selector: 'app-reservation-kit-form-modal',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './reservation-kit-form-modal.component.html',
  styleUrl: './reservation-kit-form-modal.component.scss',
})
export class ReservationKitFormModalComponent {
  private kitService = inject(ReservationKitService);
  dialogRef = inject(MatDialogRef<ReservationKitFormModalComponent, boolean>);
  data = inject<ReservationKitFormModalData>(MAT_DIALOG_DATA);

  get isEditing(): boolean {
    return !!this.data.kit;
  }

  nameControl = new FormControl(this.data.kit?.name ?? '', { nonNullable: true, validators: [Validators.required] });
  descriptionControl = new FormControl(this.data.kit?.description ?? '', { nonNullable: true });

  lines: EditableKitLine[] = this.data.kit
    ? this.data.kit.items.map(item => ({
        searchTerm: item.itemName,
        item: { id: item.itemId, name: item.itemName },
        quantity: item.quantity
      }))
    : [{ searchTerm: '', item: null, quantity: null }];

  isSaving = false;
  error: string | null = null;

  addLine() {
    this.lines.push({ searchTerm: '', item: null, quantity: null });
  }

  removeLine(index: number) {
    this.lines.splice(index, 1);
  }

  // Excludes whatever's already picked on every *other* line — a kit
  // shouldn't list the same item twice (reservation_kit_items' own unique
  // (kit_id, item_id) constraint would reject it server-side anyway; this
  // just keeps the picker from offering it in the first place).
  filteredItemsForLine(index: number): KitPickableItem[] {
    const term = this.lines[index].searchTerm.trim().toLowerCase();
    const pickedElsewhere = new Set(
      this.lines.filter((_, i) => i !== index).map(line => line.item?.id).filter((id): id is string => !!id)
    );
    return this.data.items.filter(item =>
      !pickedElsewhere.has(item.id)
      && (!term || item.name.toLowerCase().includes(term) || item.id.toLowerCase().includes(term))
    );
  }

  onLineItemSelected(event: MatAutocompleteSelectedEvent, index: number) {
    const itemId = event.option.value as string;
    const item = this.data.items.find(candidate => candidate.id === itemId) ?? null;
    this.lines[index].item = item;
    this.lines[index].searchTerm = item?.name ?? '';
  }

  async save() {
    if (this.isSaving) {
      return;
    }
    if (this.nameControl.invalid) {
      this.nameControl.markAsTouched();
      return;
    }

    const incompleteLine = this.lines.some(line => (line.item && !line.quantity) || (!line.item && !!line.quantity));
    if (incompleteLine) {
      this.error = 'Every line needs both an item and a quantity.';
      return;
    }

    const completeLines = this.lines.filter((line): line is EditableKitLine & { item: KitPickableItem; quantity: number } =>
      !!line.item && !!line.quantity && line.quantity > 0
    );
    if (completeLines.length === 0) {
      this.error = 'Add at least one item.';
      return;
    }

    this.isSaving = true;
    this.error = null;

    const input = {
      name: this.nameControl.value,
      description: this.descriptionControl.value,
      items: completeLines.map(line => ({ itemId: line.item.id, quantity: line.quantity }))
    };

    const error = this.isEditing
      ? await this.kitService.update(this.data.kit!.id, input)
      : await this.kitService.create(input);

    this.isSaving = false;

    if (error) {
      this.error = error;
      return;
    }

    this.dialogRef.close(true);
  }

  cancel() {
    this.dialogRef.close();
  }
}
