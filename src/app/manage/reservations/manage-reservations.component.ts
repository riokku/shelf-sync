import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService, Profile } from '../../core/auth.service';
import { ReservationKitService } from '../../core/reservation-kit.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ReservationCalendarComponent } from '../../shared/components/reservation-calendar/reservation-calendar.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { NotificationService } from '../../core/notification.service';
import {
  PlaceReservationModalComponent,
  ReservableItem
} from '../../shared/components/place-reservation-modal/place-reservation-modal.component';
import {
  ReservationKitFormModalComponent,
  ReservationKitFormModalData
} from '../../shared/components/reservation-kit-form-modal/reservation-kit-form-modal.component';
import { ReservationKit } from '../../shared/models/reservation-kit.model';
import { InventoryItemReservationWithItem, loadAllInventoryItemReservations } from '../../shared/utils/inventory-item-reservations';
import { subscribeToTableChanges } from '../../shared/utils/realtime';
import { FlashTracker } from '../../shared/utils/flash-tracker';
import { flashAndScrollToHighlighted } from '../../shared/utils/highlight-row';
import { debounce } from '../../shared/utils/debounce';
import { getTodayIsoDate } from '../../shared/utils/date';

type ReservationStatusFilter = 'all' | 'reserved' | 'picked_up' | 'returned' | 'cancelled';
type ReservationViewMode = 'list' | 'calendar';
type ReservationPageTab = 'reservations' | 'kits';

/** One card's worth of reservation rows in the list/calendar-agenda view —
 *  every row sharing a non-null groupId (a multi-item booking placed by hand
 *  or from a kit — see the add_reservation_group_id migration) collapses
 *  into one group; an ordinary single-item reservation is still its own
 *  singleton "group" of one, so both shapes render through the same
 *  iteration rather than a separate branch in the template. */
interface ReservationGroupView {
  key: string;
  groupId: string | null;
  items: InventoryItemReservationWithItem[];
}

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
 *  non-manage viewer can't even load someone else's row to act on it.
 *
 *  The "Kits" tab (curating reservation kits — see ReservationKitService)
 *  is admin/manager only, same trust level the supplier directory already
 *  has: any approved member can *use* a kit via PlaceReservationModalComponent's
 *  own picker, but only admin/manager can author the list it draws from. */
@Component({
  selector: 'app-manage-reservations',
  imports: [
    DatePipe,
    NgTemplateOutlet,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
    MatTooltipModule,
    RouterLink,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent,
    ReservationCalendarComponent
  ],
  templateUrl: './manage-reservations.component.html',
  styleUrl: './manage-reservations.component.scss',
})
export class ManageReservationsComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  protected authService = inject(AuthService);
  protected kitService = inject(ReservationKitService);
  private notification = inject(NotificationService);
  private dialog = inject(MatDialog);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isLoading = true;
  isProcessingReservation = false;
  reservationError: string | null = null;
  kitRemoveError: string | null = null;
  /** Repeat-count for the loading-state skeleton cards — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3];
  /** Set when loadReservations()'s own query fails — see InventoryComponent's
   *  identical loadError field for the full reasoning. Only the reservations
   *  query itself is checked, not the items/profiles/kits lookups ngOnInit also
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
  /** List vs. calendar — how the same filtered data renders, not which page
   *  section is showing, so this stays local/session state rather than a
   *  URL query param (same reasoning InventoryComponent's own card/table
   *  toggle already documents). */
  viewMode: ReservationViewMode = 'list';
  /** Which day the calendar's own agenda panel below it is showing — starts
   *  on today, then follows whatever day ReservationCalendarComponent's
   *  (daySelected) output last emitted. */
  selectedCalendarDate = getTodayIsoDate();

  /** Reservations vs. Kits — a genuine top-level page section (unlike
   *  viewMode above), so this does get reflected in the URL — same
   *  ?tab=/setViewMode() shape ManageInventoryComponent's own create/
   *  retirements tabs already establish (see that component's own doc
   *  comment). A stray ?tab=kits for a non-manager viewer is defensively
   *  ignored by the template (see kits-tab's own @if below) rather than
   *  guarded here, since kit *reading* is still fine for any approved
   *  member — it's only authoring that's admin/manager-only. */
  pageTab: ReservationPageTab = 'reservations';

  private isPageTab(value: string | null): value is ReservationPageTab {
    return value === 'reservations' || value === 'kits';
  }

  setPageTab(tab: ReservationPageTab) {
    if (tab === this.pageTab) {
      return;
    }
    this.pageTab = tab;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private allItems: { id: string; name: string; quantity_remaining: number; is_locked: boolean; status: string }[] = [];
  private profiles: Profile[] = [];
  reservations: InventoryItemReservationWithItem[] = [];

  // Which rows should currently show the brief "someone else just changed
  // this" pulse — see ManageOrdersComponent's own identical
  // flashTracker/pendingFlashIds/debouncedReload trio for the full
  // reasoning; this page mirrors it exactly.
  private flashTracker = new FlashTracker();
  private pendingFlashIds = new Set<string>();
  private readonly debouncedReloadReservations = debounce(() => void this.reloadAndFlashChangedReservations(), 300);

  get filteredReservations(): InventoryItemReservationWithItem[] {
    if (this.statusFilter === 'all') {
      return this.reservations;
    }
    return this.reservations.filter(reservation => reservation.status === this.statusFilter);
  }

  private groupReservations(list: InventoryItemReservationWithItem[]): ReservationGroupView[] {
    const groupsByKey = new Map<string, ReservationGroupView>();
    const order: string[] = [];
    for (const reservation of list) {
      const key = reservation.groupId ?? `single-${reservation.id}`;
      let group = groupsByKey.get(key);
      if (!group) {
        group = { key, groupId: reservation.groupId, items: [] };
        groupsByKey.set(key, group);
        order.push(key);
      }
      group.items.push(reservation);
    }
    return order.map(key => groupsByKey.get(key)!);
  }

  get groupedFilteredReservations(): ReservationGroupView[] {
    return this.groupReservations(this.filteredReservations);
  }

  /** The calendar view's own agenda panel — every filtered reservation whose
   *  date range includes selectedCalendarDate, same lexicographic ISO-string
   *  comparison ReservationCalendarComponent's own grid-building uses. */
  get selectedDateReservations(): InventoryItemReservationWithItem[] {
    return this.filteredReservations.filter(
      reservation => this.selectedCalendarDate >= reservation.startDate && this.selectedCalendarDate <= reservation.endDate
    );
  }

  get groupedSelectedDateReservations(): ReservationGroupView[] {
    return this.groupReservations(this.selectedDateReservations);
  }

  groupHasReserved(group: ReservationGroupView): boolean {
    return group.items.some(reservation => reservation.status === 'reserved');
  }

  groupHasPickedUp(group: ReservationGroupView): boolean {
    return group.items.some(reservation => reservation.status === 'picked_up');
  }

  get reservableItems(): ReservableItem[] {
    return this.allItems.map(item => ({
      id: item.id,
      name: item.name,
      quantityRemaining: item.quantity_remaining,
      isLocked: item.is_locked,
      isPendingRetirement: item.status === 'retirement_pending'
    }));
  }

  private get itemNamesById(): Map<string, string> {
    return new Map(this.allItems.map(item => [item.id, item.name]));
  }

  async ngOnInit() {
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (this.isPageTab(tabParam)) {
      this.pageTab = tabParam;
    }

    const [{ data: items }, { data: profiles }] = await Promise.all([
      this.supabase.from('inventory_items').select('id, name, quantity_remaining, is_locked, status').order('name'),
      this.supabase.from('profiles').select('*').eq('organization_id', this.authService.organizationId()!).order('full_name')
    ]);

    this.allItems = items ?? [];
    this.profiles = profiles ?? [];
    await Promise.all([this.loadReservations(), this.kitService.load(this.itemNamesById)]);
    this.isLoading = false;

    // Landed here from the command palette's own "Reservations" result (see
    // CommandPaletteService) — same ?highlight= + flashTracker/
    // .realtime-flash stand-in ManageOrdersComponent's own identical call
    // already uses, since this page has no per-reservation deep link either.
    flashAndScrollToHighlighted(
      this.route.snapshot.queryParamMap.get('highlight'),
      this.reservations.map(reservation => reservation.id),
      id => `reservation-${id}`,
      this.flashTracker
    );

    // Live updates from other users/tabs — someone else placing, cancelling,
    // or actioning a reservation shows up here without a manual reload. RLS
    // scopes exactly what a staff subscriber even receives here the same way
    // it already scopes loadReservations()'s own query (see this
    // component's own route comment) — no client-side filtering needed on
    // top of it. Reuses loadReservations() itself (debounced), same "full
    // reload rather than a single-row patch" reasoning ManageOrdersComponent's
    // own identical subscription already uses.
    const channel = subscribeToTableChanges(this.supabase, 'inventory_item_reservations', payload => {
      // DELETE isn't tracked — this table has no delete path in this app,
      // and there'd be no row left to flash once the reload below completes.
      if (payload.eventType !== 'DELETE' && payload.new.id) {
        this.pendingFlashIds.add(payload.new.id);
      }
      this.debouncedReloadReservations();
    });
    this.destroyRef.onDestroy(() => {
      this.debouncedReloadReservations.cancel();
      this.flashTracker.clear();
      void this.supabase.removeChannel(channel);
    });
  }

  isFlashing(reservationId: string): boolean {
    return this.flashTracker.isFlashing(reservationId);
  }

  private async reloadAndFlashChangedReservations() {
    await this.loadReservations();
    for (const id of this.pendingFlashIds) {
      this.flashTracker.flash(id);
    }
    this.pendingFlashIds.clear();
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

  retryLoadKits() {
    void this.kitService.load(this.itemNamesById);
  }

  private async loadReservations() {
    const itemNamesById = this.itemNamesById;
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
      data: { items: this.reservableItems, reservations: this.reservations, kits: this.kitService.kits() },
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

  async markGroupPickedUp(group: ReservationGroupView) {
    await this.runGroupAction(
      group.items.filter(reservation => reservation.status === 'reserved'),
      reservation => this.supabase.rpc('mark_reservation_picked_up', { reservation_id: reservation.id }),
      'Reservation group marked picked up'
    );
  }

  async markGroupReturned(group: ReservationGroupView) {
    await this.runGroupAction(
      group.items.filter(reservation => reservation.status === 'picked_up'),
      reservation => this.supabase.rpc('mark_reservation_returned', { reservation_id: reservation.id }),
      'Reservation group marked returned'
    );
  }

  async cancelGroup(group: ReservationGroupView) {
    await this.runGroupAction(
      group.items.filter(reservation => reservation.status === 'reserved'),
      reservation => this.supabase.rpc('cancel_reservation', { reservation_id: reservation.id }),
      'Reservation group cancelled'
    );
  }

  /** No RPC accepts an array of ids, so a group action loops the existing
   *  single-reservation RPC client-side and tallies success/failure — same
   *  convention every other bulk action in this app already follows (see
   *  e.g. ManageTasksComponent's own bulk status change). Only ever runs
   *  against the subset of a group's rows that are actually still in the
   *  relevant status (e.g. only the still-"reserved" ones for a group pick-
   *  up) — a row that already moved on stays untouched rather than erroring. */
  private async runGroupAction(
    items: InventoryItemReservationWithItem[],
    call: (reservation: InventoryItemReservationWithItem) => PromiseLike<{ error: { message: string } | null }>,
    successMessage: string
  ) {
    if (this.isProcessingReservation || items.length === 0) {
      return;
    }
    this.isProcessingReservation = true;
    this.reservationError = null;

    const results = await Promise.all(items.map(item => call(item).then(({ error }) => ({ item, error }))));
    const failed = results.filter(result => result.error);

    await this.loadReservations();
    this.isProcessingReservation = false;

    if (failed.length > 0) {
      this.reservationError = `${failed.length} of ${results.length} items couldn't be updated: `
        + failed.map(result => `${result.item.itemName} (${result.error!.message})`).join('; ');
      return;
    }

    this.notification.success(successMessage);
  }

  private openKitForm(data: ReservationKitFormModalData) {
    const dialogRef = this.dialog.open(ReservationKitFormModalComponent, {
      data,
      width: 'clamp(32rem, 55vw, 40rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe(async (saved: boolean | undefined) => {
      if (!saved) {
        return;
      }
      await this.kitService.load(this.itemNamesById);
      this.notification.success(data.kit ? 'Kit updated' : 'Kit created');
    });
  }

  addKit() {
    this.openKitForm({ items: this.allItems.map(item => ({ id: item.id, name: item.name })) });
  }

  editKit(kit: ReservationKit) {
    this.openKitForm({ kit, items: this.allItems.map(item => ({ id: item.id, name: item.name })) });
  }

  // Split into this public gate (opens the confirm dialog) + performRemoveKit()
  // below (does the actual work), same "public method opens a confirm
  // dialog and subscribes, private method does the work" split
  // ManageTasksComponent's own applyBulkDelete()/performBulkDelete() pair
  // already establishes — so the real delete-and-reload logic stays
  // directly unit-testable without faking MatDialog.open() and its
  // observable-subscribe timing.
  removeKit(kit: ReservationKit) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete kit?',
        message: `Delete "${kit.name}"? This can't be undone — any reservations already placed from it are unaffected.`,
        confirmLabel: 'Delete',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean | undefined) => {
      if (confirmed) {
        void this.performRemoveKit(kit);
      }
    });
  }

  private async performRemoveKit(kit: ReservationKit) {
    this.kitRemoveError = null;
    const error = await this.kitService.remove(kit.id);
    if (error) {
      this.kitRemoveError = error;
      return;
    }
    await this.kitService.load(this.itemNamesById);
    this.notification.success('Kit deleted');
  }
}
