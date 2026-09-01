/** A date-ranged booking of some quantity of an item's stock — see
 *  ModalTableComponent's read-only "Upcoming reservations" summary and
 *  manage/reservations, the page that actually creates/actions these.
 *  Fully separate from InventoryItem's own isCheckedOut/checkedOutTo: this
 *  tracks a *planned* booking for a date range, not "who has it right now."
 *  `reservedFor` is free text (who/what the booking is for), not a profiles
 *  FK — this books stock for an external customer/event, not an org member.
 *
 *  Lifecycle is linear with one branch: reserved -> pickedUp -> returned, or
 *  reserved -> cancelled (see the add_inventory_item_reservations migration
 *  for why cancelling only applies before pickup). */
export type InventoryItemReservationStatus = 'reserved' | 'picked_up' | 'returned' | 'cancelled';

export interface InventoryItemReservation {
  id: string;
  startDate: string;
  endDate: string;
  quantity: number;
  reservedFor: string;
  note: string;
  status: InventoryItemReservationStatus;
  reservedByLabel: string;
  reservedAt: string;
  pickedUpByLabel: string;
  pickedUpAt: string;
  returnedByLabel: string;
  returnedAt: string;
  cancelledByLabel: string;
  cancelledAt: string;
  /** Non-null when this reservation was placed alongside one or more other
   *  items in the same submission (a multi-item booking, or one placed from
   *  a reservation kit — see ReservationKit) — every sibling row shares the
   *  same value. Null for an ordinary single-item reservation. Purely a
   *  grouping tag (see the add_reservation_group_id migration); it names no
   *  row of its own. ManageReservationsComponent groups by this to render
   *  one card per booking (with a per-item sub-row each) instead of one card
   *  per reservation row. */
  groupId: string | null;
}
