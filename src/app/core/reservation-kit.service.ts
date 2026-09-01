import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ReservationKit } from '../shared/models/reservation-kit.model';

/** Plain-field input shape shared by create()/update() below. */
export interface ReservationKitInput {
  name: string;
  description: string;
  items: { itemId: string; quantity: number }[];
}

/** Org-scoped directory of pre-made reservation kits — same shared-service
 *  shape SupplierService already uses for its own admin-curated directory
 *  (org-scoped signal + loadError, RLS restricts insert/update/delete to
 *  admin/manager and this service doesn't re-check that client-side). Used
 *  by both ManageReservationsComponent (full CRUD, its "Kits" tab) and
 *  PlaceReservationModalComponent (read-only, the "Load from kit" picker —
 *  reads the already-loaded list via MAT_DIALOG_DATA rather than injecting
 *  this service directly, matching how that modal already receives
 *  `items`/`reservations` as plain data rather than services of their own).
 *
 *  Unlike SupplierService, load() takes an itemNamesById map rather than
 *  reading it off another service — a kit's own items are only ever known
 *  by id (reservation_kit_items has no name of its own), and the caller
 *  (ManageReservationsComponent) already has the org's item list loaded for
 *  its own reservable-items picker, so this reuses that instead of a third
 *  query. create()/update()/remove() don't self-refresh the signal the way
 *  SupplierService's own methods do, for the same reason — they'd need that
 *  same map passed in too, so the caller just re-calls load() itself
 *  afterward (see ManageReservationsComponent's own openKitForm()/removeKit()). */
@Injectable({ providedIn: 'root' })
export class ReservationKitService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly authService = inject(AuthService);

  private readonly _kits = signal<ReservationKit[]>([]);
  readonly kits = this._kits.asReadonly();

  /** Set when load()'s own query fails — see InventoryComponent's identical
   *  loadError field for the full reasoning. A failure here leaves whatever
   *  was already loaded in place, same background-refresh-safe behavior
   *  every other loadError field in this app already has. */
  private readonly _loadError = signal<string | null>(null);
  readonly loadError = this._loadError.asReadonly();

  async load(itemNamesById: Map<string, string>) {
    const [{ data: kitRows, error: kitsError }, { data: itemRows, error: itemsError }] = await Promise.all([
      this.supabase.from('reservation_kits').select('*').order('name'),
      this.supabase.from('reservation_kit_items').select('*')
    ]);

    const error = kitsError ?? itemsError;
    if (error) {
      this._loadError.set(error.message);
      return;
    }
    this._loadError.set(null);

    const itemsByKit = new Map<string, { itemId: string; itemName: string; quantity: number }[]>();
    for (const row of itemRows ?? []) {
      const list = itemsByKit.get(row.kit_id) ?? [];
      list.push({ itemId: row.item_id, itemName: itemNamesById.get(row.item_id) ?? 'Unknown item', quantity: row.quantity });
      itemsByKit.set(row.kit_id, list);
    }

    this._kits.set((kitRows ?? []).map(row => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      items: itemsByKit.get(row.id) ?? []
    })));
  }

  async create(input: ReservationKitInput): Promise<string | null> {
    const organizationId = this.authService.organizationId();
    if (!organizationId) {
      return 'You must be signed in to create a kit.';
    }

    const { data, error } = await this.supabase
      .from('reservation_kits')
      .insert({
        organization_id: organizationId,
        name: input.name.trim(),
        description: input.description.trim() || null
      })
      .select('id')
      .single();

    if (error) {
      return error.message;
    }

    return this.replaceKitItems(data.id, input.items);
  }

  async update(id: string, input: ReservationKitInput): Promise<string | null> {
    const { error } = await this.supabase
      .from('reservation_kits')
      .update({
        name: input.name.trim(),
        description: input.description.trim() || null
      })
      .eq('id', id);

    if (error) {
      return error.message;
    }

    return this.replaceKitItems(id, input.items);
  }

  /** Full replace rather than a diff — same "resubmit the whole set" shape
   *  set_audit_team() already established for its own multi-select, a
   *  reasonable simplification for a list that's only ever a handful of
   *  items. */
  private async replaceKitItems(kitId: string, items: { itemId: string; quantity: number }[]): Promise<string | null> {
    const { error: deleteError } = await this.supabase.from('reservation_kit_items').delete().eq('kit_id', kitId);
    if (deleteError) {
      return deleteError.message;
    }

    if (items.length === 0) {
      return null;
    }

    const { error: insertError } = await this.supabase
      .from('reservation_kit_items')
      .insert(items.map(item => ({ kit_id: kitId, item_id: item.itemId, quantity: item.quantity })));

    return insertError?.message ?? null;
  }

  /** reservation_kit_items rows cascade away on delete (on delete cascade —
   *  see the add_reservation_kits migration), so this needs no separate
   *  cleanup step. Reservations already placed from this kit are untouched
   *  either way — they never referenced the kit itself, only the items they
   *  were prefilled from. */
  async remove(id: string): Promise<string | null> {
    const { error } = await this.supabase.from('reservation_kits').delete().eq('id', id);
    return error?.message ?? null;
  }
}
