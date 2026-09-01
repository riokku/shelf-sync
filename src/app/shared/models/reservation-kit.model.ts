/** A pre-made bundle of items + quantities an admin/manager curates ahead of
 *  time (e.g. "Wedding package": 50 chairs, 10 tables, 20 linens) so placing
 *  a common multi-item reservation doesn't mean picking every item and
 *  typing every quantity by hand each time. Selecting one in
 *  PlaceReservationModalComponent just prefills the item/quantity lines —
 *  every line stays fully editable afterward (add, remove, change
 *  quantities) before the reservation is actually placed, and this row
 *  itself is never touched by that; it's a template, not a placed booking.
 *  See ReservationKitService and the add_reservation_kits migration. */
export interface ReservationKitItem {
  itemId: string;
  itemName: string;
  quantity: number;
}

export interface ReservationKit {
  id: string;
  name: string;
  description: string;
  items: ReservationKitItem[];
}
