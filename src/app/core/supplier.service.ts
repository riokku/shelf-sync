import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Supplier } from '../shared/models/supplier.model';
import { Database } from '../shared/models/database.types';

type SupplierRow = Database['public']['Tables']['suppliers']['Row'];

/** Plain-field input shape shared by create()/update() below — every field
 *  but name is optional, submitted as empty string from a form control
 *  either way, trimmed to null here rather than pushing that onto callers. */
export interface SupplierInput {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  notes: string;
}

function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    website: row.website ?? '',
    notes: row.notes ?? ''
  };
}

/** Org-scoped supplier directory — backs both manage/suppliers (full CRUD)
 *  and the supplier picker on the item create/edit forms, same shared-
 *  service shape InventoryFieldOptionsService already uses for its own
 *  admin-curated dropdown lists. RLS restricts insert/update/delete to
 *  admin/manager; this service doesn't re-check that client-side (same as
 *  every other admin/manager-gated write path in this app — the UI that
 *  calls it is already gated, and the DB is the real enforcement). */
@Injectable({ providedIn: 'root' })
export class SupplierService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly authService = inject(AuthService);

  private readonly _suppliers = signal<Supplier[]>([]);
  readonly suppliers = this._suppliers.asReadonly();

  /** Set when load()'s own query fails — see InventoryComponent's identical
   *  loadError field for the full reasoning. Lives here rather than on
   *  ManageSuppliersComponent since this service (not the component) owns
   *  the actual query; the page reads it straight off the service the same
   *  way it already reads `suppliers` itself. A failure here leaves
   *  whatever was already loaded in place, same background-refresh-safe
   *  behavior every other loadError field in this app already has — this
   *  service is also read by the item create/edit forms' supplier picker,
   *  which shouldn't lose its options out from under an in-progress edit
   *  just because a later reload failed. */
  private readonly _loadError = signal<string | null>(null);
  readonly loadError = this._loadError.asReadonly();

  /** Safe to call from any component that renders the directory or the
   *  picker — cheap, and each caller can't assume another component already
   *  loaded it (same reasoning InventoryFieldOptionsService.load() gives). */
  async load() {
    const { data, error } = await this.supabase.from('suppliers').select('*').order('name');
    if (error) {
      this._loadError.set(error.message);
      return;
    }
    this._loadError.set(null);
    this._suppliers.set((data ?? []).map(toSupplier));
  }

  async create(input: SupplierInput): Promise<string | null> {
    const organizationId = this.authService.organizationId();
    if (!organizationId) {
      return 'You must be signed in to add a supplier.';
    }

    const { error } = await this.supabase.from('suppliers').insert({
      organization_id: organizationId,
      name: input.name.trim(),
      contact_name: input.contactName.trim() || null,
      email: input.email.trim() || null,
      phone: input.phone.trim() || null,
      website: input.website.trim() || null,
      notes: input.notes.trim() || null
    });

    if (error) {
      return error.message;
    }
    await this.load();
    return null;
  }

  async update(id: string, input: SupplierInput): Promise<string | null> {
    const { error } = await this.supabase.from('suppliers').update({
      name: input.name.trim(),
      contact_name: input.contactName.trim() || null,
      email: input.email.trim() || null,
      phone: input.phone.trim() || null,
      website: input.website.trim() || null,
      notes: input.notes.trim() || null
    }).eq('id', id);

    if (error) {
      return error.message;
    }
    await this.load();
    return null;
  }

  /** Items pointing at this supplier fall back to no supplier (on delete set
   *  null) rather than being blocked — see the migration's own doc comment. */
  async remove(id: string): Promise<string | null> {
    const { error } = await this.supabase.from('suppliers').delete().eq('id', id);
    if (error) {
      return error.message;
    }
    await this.load();
    return null;
  }
}
