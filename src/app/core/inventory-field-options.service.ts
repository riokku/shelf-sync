import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export type InventoryFieldName = 'category' | 'physical_location';

@Injectable({ providedIn: 'root' })
export class InventoryFieldOptionsService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly authService = inject(AuthService);

  private readonly _options = signal<Record<InventoryFieldName, string[]>>({
    category: [],
    physical_location: []
  });

  optionsFor(field: InventoryFieldName): string[] {
    return this._options()[field];
  }

  /** Loads every approved option for the caller's own organization. Safe to
   *  call from any component that renders one of these dropdowns — cheap,
   *  and each caller can't assume another component already loaded it. */
  async load() {
    const { data } = await this.supabase.from('inventory_field_options').select('*').order('value');

    const grouped: Record<InventoryFieldName, string[]> = {
      category: [],
      physical_location: []
    };
    for (const row of data ?? []) {
      if (row.field_name === 'category' || row.field_name === 'physical_location') {
        grouped[row.field_name].push(row.value);
      }
    }
    this._options.set(grouped);
  }

  async addOption(field: InventoryFieldName, value: string): Promise<string | null> {
    const organizationId = this.authService.organizationId();
    if (!organizationId) {
      return 'You must be signed in to add an option.';
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const { error } = await this.supabase
      .from('inventory_field_options')
      .insert({ organization_id: organizationId, field_name: field, value: trimmed });

    if (error) {
      return error.message;
    }

    await this.load();
    return null;
  }

  /** Distinct, non-null values currently stored on inventory_items for this
   *  column — used to help an admin bootstrap the approved list from
   *  whatever's already been typed in free-text before this feature existed. */
  async loadUsedValues(field: InventoryFieldName): Promise<string[]> {
    const { data } = await this.supabase.from('inventory_items').select(field);

    const values = new Set<string>();
    for (const row of data ?? []) {
      const value = (row as Record<string, string | null>)[field];
      if (value) {
        values.add(value);
      }
    }
    return [...values].sort();
  }

  async removeOption(field: InventoryFieldName, value: string): Promise<string | null> {
    const organizationId = this.authService.organizationId();
    if (!organizationId) {
      return 'You must be signed in to remove an option.';
    }

    const { error } = await this.supabase
      .from('inventory_field_options')
      .delete()
      .eq('organization_id', organizationId)
      .eq('field_name', field)
      .eq('value', value);

    if (error) {
      return error.message;
    }

    await this.load();
    return null;
  }
}
