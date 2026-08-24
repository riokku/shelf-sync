import { Supplier } from '../models/supplier.model';

/** Mirrors resolveProfileName() (profile-label.ts) — resolves a stored
 *  supplier_id into its current directory name for display, same "the FK is
 *  the source of truth, the label is derived at read time" shape
 *  checked_out_to already has. Returns '' both when there's no id and when
 *  the supplier has since been deleted (on delete set null clears the id in
 *  that case anyway, but a stale id in an unsaved form shouldn't crash). */
export function resolveSupplierName(id: string | null, suppliers: Supplier[]): string {
  if (!id) {
    return '';
  }
  return suppliers.find(s => s.id === id)?.name ?? '';
}
