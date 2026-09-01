import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';
import { InventoryItemReservation, InventoryItemReservationStatus } from '../models/inventory-item-reservation.model';
import { Profile } from '../../core/auth.service';
import { resolveProfileName } from './profile-label';

type InventoryItemReservationRow = Database['public']['Tables']['inventory_item_reservations']['Row'];

/** A reservation plus the name of the item it was placed against —
 *  manage/reservations is org-wide (not scoped to one item's popup), so
 *  every row needs to say which item it's about. itemNamesById is a plain
 *  client-side join, matching every other multi-entity list in this app
 *  (e.g. InventoryItemOrderWithItem in inventory-item-orders.ts) rather
 *  than a PostgREST embedded-resource select. */
export interface InventoryItemReservationWithItem extends InventoryItemReservation {
  itemId: string;
  itemName: string;
}

function toInventoryItemReservation(row: InventoryItemReservationRow, profiles: Profile[]): InventoryItemReservation {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    quantity: row.quantity,
    reservedFor: row.reserved_for,
    note: row.note ?? '',
    status: row.status as InventoryItemReservationStatus,
    reservedByLabel: resolveProfileName(row.reserved_by, profiles) || 'Unknown user',
    reservedAt: row.reserved_at,
    pickedUpByLabel: resolveProfileName(row.picked_up_by, profiles),
    pickedUpAt: row.picked_up_at ?? '',
    returnedByLabel: resolveProfileName(row.returned_by, profiles),
    returnedAt: row.returned_at ?? '',
    cancelledByLabel: resolveProfileName(row.cancelled_by, profiles),
    cancelledAt: row.cancelled_at ?? '',
    groupId: row.reservation_group_id
  };
}

/** Every reservation across the org, most recently reserved first — backs
 *  manage/reservations. RLS (inventory_item_reservations' own SELECT
 *  policy, joined through item_id to inventory_items.organization_id) is
 *  what actually scopes this to the caller's org, same "no explicit
 *  organization_id filter, RLS alone does the scoping" convention every
 *  other unfiltered .from(...) query in this app already follows.
 *
 *  Returns `{ reservations, error }` rather than a bare array — this is the
 *  page's own primary content load, so its caller needs to distinguish a
 *  genuine fetch failure from "no reservations yet" the same way
 *  InventoryComponent/TasksComponent's own direct queries already do (see
 *  their loadError field); a bare array can't carry that distinction. */
export async function loadAllInventoryItemReservations(
  supabase: SupabaseClient<Database>,
  profiles: Profile[],
  itemNamesById: Map<string, string>
): Promise<{ reservations: InventoryItemReservationWithItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from('inventory_item_reservations')
    .select('*')
    .order('reserved_at', { ascending: false });

  if (error) {
    return { reservations: [], error: error.message };
  }

  return {
    reservations: (data ?? []).map(row => ({
      ...toInventoryItemReservation(row, profiles),
      itemId: row.item_id,
      itemName: itemNamesById.get(row.item_id) ?? 'Unknown item'
    })),
    error: null
  };
}

/** Lighter-weight than loadAllInventoryItemReservations() above — just this
 *  one item's still-relevant bookings (not yet returned/cancelled, and not
 *  already in the past), oldest start date first. Backs
 *  ModalTableComponent's read-only "Upcoming reservations" summary. Takes a
 *  pre-loaded `profiles` the same way loadAllInventoryItemReservations()
 *  above does, to resolve reservedByLabel — the caller fetches it alongside
 *  this rather than this function loading its own copy, same "this popup
 *  fetches its own supplementary data" precedent its other queries already
 *  follow.
 *
 *  Goes through get_item_upcoming_reservations() rather than a direct
 *  .from(...) select — inventory_item_reservations' own SELECT policy
 *  scopes a non-admin/manager caller to just their own rows (see
 *  20260904120000_widen_reservation_access_to_staff.sql), which is right
 *  for manage/reservations' own org-wide list but would also silently
 *  narrow this summary to only bookings the *viewer* made. This summary is
 *  meant to answer "is this item already spoken for by anyone," so it
 *  reads through a SECURITY DEFINER RPC scoped by item_id instead,
 *  deliberately bypassing that per-user restriction the same way every
 *  other RPC in this schema already bypasses RLS for its own controlled
 *  purpose (see that RPC's own migration for the full reasoning). */
export async function loadUpcomingReservationsForItem(
  supabase: SupabaseClient<Database>,
  itemId: string,
  profiles: Profile[]
): Promise<InventoryItemReservation[]> {
  const { data } = await supabase.rpc('get_item_upcoming_reservations', { p_item_id: itemId });

  return (data ?? []).map(row => toInventoryItemReservation(row, profiles));
}
