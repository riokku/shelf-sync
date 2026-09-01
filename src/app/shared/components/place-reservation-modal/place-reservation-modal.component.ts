import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { InventoryItemReservationWithItem } from '../../utils/inventory-item-reservations';
import { ReservationKit } from '../../models/reservation-kit.model';
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
  /** A pending-retirement item already sits at quantityRemaining 0 (that's
   *  the precondition for requesting retirement in the first place — see
   *  request_item_retirement()'s own check), so create_reservation()'s
   *  capacity check already refuses it server-side regardless; this is the
   *  same client-side-only, "visible but unselectable" nicety isLocked
   *  already gets, not a second enforcement layer. */
  isPendingRetirement: boolean;
}

export interface PlaceReservationModalData {
  items: ReservableItem[];
  /** Already loaded by ManageReservationsComponent for its own list — reused
   *  here for the live availability hint rather than re-querying. */
  reservations: InventoryItemReservationWithItem[];
  /** Optional so existing callers/specs that predate reservation kits keep
   *  working unchanged — see the `kits` getter below. */
  kits?: ReservationKit[];
}

/** A working extra item+quantity row beyond the primary item field below —
 *  plain class-field array, same shape ModalTableComponent's own
 *  EditableContainer already establishes for a small repeatable-row editor,
 *  rather than an Angular FormArray. Shares this dialog's one date range/
 *  reserved-for/note (a multi-item reservation is one booking with several
 *  item lines, not several independent bookings — see the
 *  add_reservation_group_id migration for how the resulting rows stay
 *  linked afterward). */
interface EditableReservationLine {
  searchTerm: string;
  item: ReservableItem | null;
  quantity: number | null;
}

@Component({
  selector: 'app-place-reservation-modal',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatSelectModule,
    MatButtonToggleModule,
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

  get kits(): ReservationKit[] {
    return this.data.kits ?? [];
  }

  /** Which way the dialog is picking items right now — a plain toggle
   *  rather than the kit picker just sitting above the item lines
   *  unconditionally, so it's an explicit up-front choice rather than an
   *  ambiguous "is this optional or not" prefill. Only ever shown/switchable
   *  when the org actually has kits (see the template's own `kits.length >
   *  0` guard) — with none, this stays 'items' and behaves exactly like the
   *  original single/multi-item-only flow. */
  pickMode: 'items' | 'kit' = 'items';

  /** Which kit is selected in 'kit' mode — drives the kit `mat-select`'s own
   *  value and gates whether the (now-prefilled) item-lines editor renders
   *  below it (see the template: nothing to edit until a kit's been picked). */
  selectedKitId: string | null = null;

  /** How many of a picked kit's own items couldn't be resolved to a real,
   *  currently-reservable item (removed from inventory since the kit was
   *  made) — surfaced as a small notice rather than silently dropped. */
  kitItemsSkipped = 0;

  itemSearchControl = new FormControl('', { nonNullable: true });
  selectedItem: ReservableItem | null = null;

  /** Extra item lines beyond the primary field above — empty for the
   *  original, still-fully-supported single-item flow. */
  additionalLines: EditableReservationLine[] = [];

  private filteredItemsMatching(term: string): ReservableItem[] {
    const t = term.trim().toLowerCase();
    if (!t) {
      return this.data.items;
    }
    return this.data.items.filter(item => item.name.toLowerCase().includes(t) || item.id.toLowerCase().includes(t));
  }

  // Matches by name or id, same dual match PlaceOrderModalComponent's own
  // item autocomplete uses.
  get filteredItems(): ReservableItem[] {
    return this.filteredItemsMatching(this.itemSearchControl.value);
  }

  filteredItemsForLine(index: number): ReservableItem[] {
    return this.filteredItemsMatching(this.additionalLines[index].searchTerm);
  }

  onItemSelected(event: MatAutocompleteSelectedEvent) {
    const itemId = event.option.value as string;
    this.selectedItem = this.data.items.find(item => item.id === itemId) ?? null;
    this.itemSearchControl.setValue(this.selectedItem?.name ?? '', { emitEvent: false });
  }

  onLineItemSelected(event: MatAutocompleteSelectedEvent, index: number) {
    const itemId = event.option.value as string;
    const item = this.data.items.find(candidate => candidate.id === itemId) ?? null;
    this.additionalLines[index].item = item;
    this.additionalLines[index].searchTerm = item?.name ?? '';
  }

  addLine() {
    this.additionalLines.push({ searchTerm: '', item: null, quantity: null });
  }

  removeLine(index: number) {
    this.additionalLines.splice(index, 1);
  }

  /** Switching between hand-picking items and starting from a kit clears
   *  whatever item/kit selection was already made — a clean slate for
   *  whichever way the user just chose to proceed, rather than leftover
   *  lines from the other mode sitting around. The shared date range/
   *  reserved-for/note fields are untouched — those aren't part of *how*
   *  items get picked. */
  setPickMode(mode: 'items' | 'kit') {
    if (mode === this.pickMode) {
      return;
    }
    this.pickMode = mode;
    this.resetLines();
  }

  private resetLines() {
    this.selectedItem = null;
    this.itemSearchControl.setValue('', { emitEvent: false });
    this.reservationForm.controls.quantity.setValue(null);
    this.additionalLines = [];
    this.selectedKitId = null;
    this.kitItemsSkipped = 0;
  }

  /** Loading a kit replaces whatever's currently in the primary field/extra
   *  lines with that kit's own items+quantities — a starting point, not a
   *  locked-in choice; every line stays fully editable (including removable)
   *  afterward, and more can still be added. A kit item that no longer
   *  resolves to a real ReservableItem (removed from inventory since the kit
   *  was made) is silently skipped rather than blocking the load — tracked
   *  in kitItemsSkipped so the template can say so. */
  loadKit(kitId: string) {
    const kit = this.kits.find(candidate => candidate.id === kitId);
    if (!kit) {
      return;
    }

    this.selectedKitId = kitId;

    const resolved = kit.items
      .map(kitItem => ({ item: this.data.items.find(item => item.id === kitItem.itemId) ?? null, quantity: kitItem.quantity }))
      .filter((line): line is { item: ReservableItem; quantity: number } => line.item !== null);

    this.kitItemsSkipped = kit.items.length - resolved.length;

    const [first, ...rest] = resolved;
    this.selectedItem = first?.item ?? null;
    this.itemSearchControl.setValue(first?.item.name ?? '', { emitEvent: false });
    this.reservationForm.controls.quantity.setValue(first?.quantity ?? null);
    this.additionalLines = rest.map(line => ({ searchTerm: line.item.name, item: line.item, quantity: line.quantity }));
  }

  reservationForm = new FormGroup({
    dateRange: new FormGroup({
      start: new FormControl<Date | null>(null, { validators: [Validators.required] }),
      end: new FormControl<Date | null>(null, { validators: [Validators.required] })
    }),
    // Not Validators.required — this is only the *primary* line's quantity
    // now, and a submission can be entirely made of additionalLines (e.g.
    // loaded from a kit whose first item no longer resolves). Completeness
    // of every line (item present <=> quantity present) is enforced by
    // lineIssue below instead, ahead of the reservationForm.invalid check.
    quantity: new FormControl<number | null>(null, { validators: [Validators.min(1)] }),
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
  availableFor(item: ReservableItem | null): number | null {
    if (!item) {
      return null;
    }
    const { start, end } = this.reservationForm.controls.dateRange.value;
    if (!start || !end) {
      return null;
    }
    const startIso = toIsoDateString(start)!;
    const endIso = toIsoDateString(end)!;
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

  get availableForSelectedRange(): number | null {
    return this.availableFor(this.selectedItem);
  }

  /** Every fully-filled line (an item and a positive quantity), primary
   *  field first. A line with only one of the two set is caught separately
   *  by lineIssue below rather than silently dropped here. */
  private get lines(): { item: ReservableItem; quantity: number }[] {
    const lines: { item: ReservableItem; quantity: number }[] = [];
    const primaryQuantity = this.reservationForm.controls.quantity.value;
    if (this.selectedItem && primaryQuantity) {
      lines.push({ item: this.selectedItem, quantity: primaryQuantity });
    }
    for (const line of this.additionalLines) {
      if (line.item && line.quantity) {
        lines.push({ item: line.item, quantity: line.quantity });
      }
    }
    return lines;
  }

  private get lineIssue(): string | null {
    const primaryQuantity = this.reservationForm.controls.quantity.value;
    if (this.selectedItem && !primaryQuantity) {
      return `Enter a quantity for ${this.selectedItem.name}.`;
    }
    if (!this.selectedItem && primaryQuantity) {
      return 'Pick an item to reserve.';
    }
    for (const line of this.additionalLines) {
      if (line.item && !line.quantity) {
        return `Enter a quantity for ${line.item.name}.`;
      }
      if (!line.item && line.quantity) {
        return 'Pick an item for every quantity you\'ve entered.';
      }
    }
    return null;
  }

  private duplicateItemName(lines: { item: ReservableItem; quantity: number }[]): string | null {
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.item.id)) {
        return line.item.name;
      }
      seen.add(line.item.id);
    }
    return null;
  }

  /** Set once this submission turns out to need more than one
   *  create_reservation() call, and reused across a retry after a partial
   *  failure (see save() below) so every row from one multi-item submission
   *  stays linked under the same reservation_group_id even if it takes more
   *  than one attempt to get them all through. */
  private multiLineGroupId: string | null = null;

  async save() {
    if (this.isSaving) {
      return;
    }

    const lines = this.lines;
    if (lines.length === 0) {
      this.error = this.pickMode === 'kit' ? 'Pick a kit to reserve from.' : 'Pick an item to reserve.';
      return;
    }

    const issue = this.lineIssue;
    if (issue) {
      this.error = issue;
      return;
    }

    const duplicateName = this.duplicateItemName(lines);
    if (duplicateName) {
      this.error = `${duplicateName} is picked more than once — combine it into a single line instead.`;
      return;
    }

    if (this.reservationForm.controls.dateRange.invalid || this.reservationForm.controls.reservedFor.invalid) {
      this.reservationForm.markAllAsTouched();
      return;
    }

    // No manual end->=start check needed here — mat-date-range-input's own
    // matStartDate/matEndDate directives already validate that themselves
    // (matStartDateInvalid/matEndDateInvalid) as part of the form's normal
    // validity, so an inverted range is already caught by the dateRange
    // check above, same as any other invalid field.
    const value = this.reservationForm.getRawValue();
    const startDate = toIsoDateString(value.dateRange.start)!;
    const endDate = toIsoDateString(value.dateRange.end)!;
    const reservedFor = value.reservedFor.trim();
    const note = value.note.trim() || undefined;

    this.isSaving = true;
    this.error = null;

    if (lines.length === 1 && !this.multiLineGroupId) {
      // Original single-item path, unchanged — no group id, and the RPC's
      // own error surfaces verbatim rather than the "N of M" wrapping below.
      const { error } = await this.supabase.rpc('create_reservation', {
        item_id: lines[0].item.id,
        start_date: startDate,
        end_date: endDate,
        quantity: lines[0].quantity,
        reserved_for: reservedFor,
        note
      });

      this.isSaving = false;

      if (error) {
        this.error = error.message;
        return;
      }

      this.dialogRef.close(true);
      return;
    }

    // Multiple items — link them with a shared group id (see
    // reservation_group_id's own migration) so they read/act as one booking
    // afterward. No RPC accepts an array of ids, so this loops the existing
    // single-reservation RPC client-side and tallies success/failure — same
    // convention every other bulk action in this app already follows (see
    // e.g. ManageTasksComponent's own bulk status change).
    this.multiLineGroupId ??= crypto.randomUUID();
    const groupId = this.multiLineGroupId;

    const results = await Promise.all(lines.map(line =>
      this.supabase.rpc('create_reservation', {
        item_id: line.item.id,
        start_date: startDate,
        end_date: endDate,
        quantity: line.quantity,
        reserved_for: reservedFor,
        note,
        group_id: groupId
      }).then(({ error }) => ({ line, error }))
    ));

    this.isSaving = false;

    const succeededItemIds = new Set(results.filter(result => !result.error).map(result => result.line.item.id));

    // Drop whatever already succeeded from the pending set, so a retry
    // (after fixing/removing the failed lines) only resubmits what's left —
    // the succeeded rows are already created and can't be un-created here.
    if (this.selectedItem && succeededItemIds.has(this.selectedItem.id)) {
      this.selectedItem = null;
      this.itemSearchControl.setValue('', { emitEvent: false });
      this.reservationForm.controls.quantity.setValue(null);
    }
    this.additionalLines = this.additionalLines.filter(line => !line.item || !succeededItemIds.has(line.item.id));

    const failed = results.filter(result => result.error);
    if (failed.length > 0) {
      const detail = failed.map(result => `${result.line.item.name} (${result.error!.message})`).join('; ');
      this.error = succeededItemIds.size > 0
        ? `${succeededItemIds.size} of ${results.length} reserved. Couldn't reserve: ${detail}`
        : `Couldn't create these reservations: ${detail}`;
      return;
    }

    this.dialogRef.close(true);
  }

  cancel() {
    this.dialogRef.close();
  }
}
