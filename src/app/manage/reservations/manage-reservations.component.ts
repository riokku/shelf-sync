import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService, Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { NotificationService } from '../../core/notification.service';
import {
  PlaceReservationModalComponent,
  ReservableItem
} from '../../shared/components/place-reservation-modal/place-reservation-modal.component';
import { InventoryItemReservationWithItem, loadAllInventoryItemReservations } from '../../shared/utils/inventory-item-reservations';

type ReservationStatusFilter = 'all' | 'reserved' | 'picked_up' | 'returned' | 'cancelled';

/** manage/reservations — view of every date-ranged booking placed against
 *  any item, plus the "New reservation" entry point that picks an item from
 *  across the whole org. Mirrors manage/orders' own shape almost exactly
 *  (see that component's own doc comment) — one central page for creating/
 *  actioning reservations, rather than scattering that workflow across
 *  however many items' own detail popups have one. ModalTableComponent
 *  still shows a small *read-only* "Upcoming reservations" summary for its
 *  own item (see loadUpcomingReservationsForItem()) — unlike Orders, which
 *  dropped per-item visibility entirely once this page existed, knowing an
 *  item is already booked is genuinely useful context while looking at
 *  whether to check it out right now.
 *
 *  approvedGuard only, not manageGuard — every approved org member can
 *  reach this page (see app-routing.module.ts's own route comment), but
 *  what they actually see/can act on is scoped server-side: admin/manager
 *  get the whole org's reservations via RLS/the RPCs below, everyone else
 *  only their own (see 20260904120000_widen_reservation_access_to_staff.sql).
 *  The "reserved"/"picked_up" action buttons below therefore never need
 *  their own ownership check in this component — RLS already means a
 *  non-manage viewer can't even load someone else's row to act on it. */
@Component({
  selector: 'app-manage-reservations',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
    RouterLink,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent
  ],
  templateUrl: './manage-reservations.component.html',
  styleUrl: './manage-reservations.component.scss',
})
export class ManageReservationsComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  protected authService = inject(AuthService);
  private notification = inject(NotificationService);
  private dialog = inject(MatDialog);

  isLoading = true;
  isProcessingReservation = false;
  reservationError: string | null = null;
  /** Repeat-count for the loading-state skeleton cards — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3];
  /** Set when loadReservations()'s own query fails — see InventoryComponent's
   *  identical loadError field for the full reasoning. Only the reservations
   *  query itself is checked, not the items/profiles lookups ngOnInit also
   *  runs alongside it — those are supporting lookups for labels/the item
   *  picker, not this page's own primary content, same "secondary loads
   *  stay unchecked" line every other loadError rollout in this app already
   *  draws (see TasksComponent's own profiles label lookup). */
  loadError: string | null = null;

  /** Backs app-page-header's own subtitle — the one role-conditional bit of
   *  copy on this page (see this component's own route comment for why:
   *  every actual access check lives in the database, this just explains to
   *  a staff viewer why their list is shorter than an admin/manager's). */
  get pageSubtitle(): string {
    return this.authService.canManage()
      ? "Date-ranged bookings against your inventory's stock."
      : "Your own date-ranged bookings against the org's inventory — admins and managers see everyone's.";
  }

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

  /** Re-runs loadReservations() after a failed load — the Retry button's
   *  handler (see the template's own loadError branch). A failed
   *  *background* refresh (e.g. after an action below) leaves whatever was
   *  already loaded in place rather than clearing it — same
   *  "don't lose what the user was already looking at" reasoning
   *  ManageTeamComponent's own loadError paragraph in CLAUDE.md describes. */
  retryLoad() {
    void this.loadReservations();
  }

  private async loadReservations() {
    const itemNamesById = new Map(this.allItems.map(item => [item.id, item.name]));
    const { reservations, error } = await loadAllInventoryItemReservations(this.supabase, this.profiles, itemNamesById);
    if (error) {
      this.loadError = error;
      return;
    }
    this.loadError = null;
    this.reservations = reservations;
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
