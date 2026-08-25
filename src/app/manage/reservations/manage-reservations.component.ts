import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { NotificationService } from '../../core/notification.service';
import {
  PlaceReservationModalComponent,
  ReservableItem
} from '../../shared/components/place-reservation-modal/place-reservation-modal.component';
import { InventoryItemReservationWithItem, loadAllInventoryItemReservations } from '../../shared/utils/inventory-item-reservations';

type ReservationStatusFilter = 'all' | 'reserved' | 'picked_up' | 'returned' | 'cancelled';

/** manage/reservations — org-wide view of every date-ranged booking placed
 *  against any item, plus the "New reservation" entry point that picks an
 *  item from across the whole org. Mirrors manage/orders' own shape almost
 *  exactly (see that component's own doc comment) — one central page for
 *  creating/actioning reservations, rather than scattering that workflow
 *  across however many items' own detail popups have one. ModalTableComponent
 *  still shows a small *read-only* "Upcoming reservations" summary for its
 *  own item (see loadUpcomingReservationsForItem()) — unlike Orders, which
 *  dropped per-item visibility entirely once this page existed, knowing an
 *  item is already booked is genuinely useful context while looking at
 *  whether to check it out right now. manageGuard (admin/manager) — same
 *  audience placing/actioning a reservation already needs via
 *  inventory_item_reservations' own RPCs. */
@Component({
  selector: 'app-manage-reservations',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    RouterLink,
    BreadcrumbsComponent,
    EmptyStateComponent
  ],
  templateUrl: './manage-reservations.component.html',
  styleUrl: './manage-reservations.component.scss',
})
export class ManageReservationsComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private dialog = inject(MatDialog);

  isLoading = true;
  isProcessingReservation = false;
  reservationError: string | null = null;

  statusFilter: ReservationStatusFilter = 'all';

  private allItems: { id: string; name: string; quantity_remaining: number }[] = [];
  private profiles: Profile[] = [];
  reservations: InventoryItemReservationWithItem[] = [];

  get filteredReservations(): InventoryItemReservationWithItem[] {
    if (this.statusFilter === 'all') {
      return this.reservations;
    }
    return this.reservations.filter(reservation => reservation.status === this.statusFilter);
  }

  get reservableItems(): ReservableItem[] {
    return this.allItems.map(item => ({
      id: item.id,
      name: item.name,
      quantityRemaining: item.quantity_remaining
    }));
  }

  async ngOnInit() {
    const [{ data: items }, { data: profiles }] = await Promise.all([
      this.supabase.from('inventory_items').select('id, name, quantity_remaining').order('name'),
      this.supabase.from('profiles').select('*').order('full_name')
    ]);

    this.allItems = items ?? [];
    this.profiles = profiles ?? [];
    await this.loadReservations();
    this.isLoading = false;
  }

  private async loadReservations() {
    const itemNamesById = new Map(this.allItems.map(item => [item.id, item.name]));
    this.reservations = await loadAllInventoryItemReservations(this.supabase, this.profiles, itemNamesById);
  }

  openPlaceReservation() {
    const dialogRef = this.dialog.open(PlaceReservationModalComponent, {
      data: { items: this.reservableItems, reservations: this.reservations },
      width: 'clamp(32rem, 55vw, 40rem)',
      maxWidth: '90vw'
    });

    // Split out from the subscribe callback itself (rather than an inline
    // async arrow), same reasoning ManageOrdersComponent's own
    // openPlaceOrder()/handlePlaceOrderResult() split gives — a spec can
    // call/await it directly instead of racing afterClosed()'s synchronous-
    // emission timing against an async callback.
    dialogRef.afterClosed().subscribe(saved => void this.handlePlaceReservationResult(saved));
  }

  private async handlePlaceReservationResult(saved: boolean | undefined) {
    if (!saved) {
      return;
    }
    await this.loadReservations();
    this.notification.success('Reservation created');
  }

  async markPickedUp(reservation: InventoryItemReservationWithItem) {
    await this.runReservationAction(
      this.supabase.rpc('mark_reservation_picked_up', { reservation_id: reservation.id }),
      'Reservation marked picked up'
    );
  }

  async markReturned(reservation: InventoryItemReservationWithItem) {
    await this.runReservationAction(
      this.supabase.rpc('mark_reservation_returned', { reservation_id: reservation.id }),
      'Reservation marked returned'
    );
  }

  async cancelReservation(reservation: InventoryItemReservationWithItem) {
    await this.runReservationAction(
      this.supabase.rpc('cancel_reservation', { reservation_id: reservation.id }),
      'Reservation cancelled'
    );
  }

  private async runReservationAction(call: PromiseLike<{ error: { message: string } | null }>, successMessage: string) {
    if (this.isProcessingReservation) {
      return;
    }
    this.isProcessingReservation = true;
    this.reservationError = null;

    const { error } = await call;

    if (error) {
      this.isProcessingReservation = false;
      this.reservationError = error.message;
      return;
    }

    await this.loadReservations();
    this.isProcessingReservation = false;
    this.notification.success(successMessage);
  }
}
