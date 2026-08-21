import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { DEFAULT_INVENTORY_TABLE_COLUMNS, InventoryTableColumnKey } from '../shared/models/inventory-table-column';
import { DEFAULT_INVENTORY_FORM_FIELDS, InventoryFormFieldKey } from '../shared/models/inventory-form-field';

const LOGO_BUCKET = 'site-assets';

@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly authService = inject(AuthService);

  private readonly _theme = signal('default');
  readonly theme = this._theme.asReadonly();

  private readonly _logoStoragePath = signal<string | null>(null);
  readonly logoUrl = computed(() => {
    const path = this._logoStoragePath();
    if (!path) {
      return null;
    }
    return this.supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  });

  private readonly _inventoryTableColumns = signal<InventoryTableColumnKey[]>(DEFAULT_INVENTORY_TABLE_COLUMNS);
  readonly inventoryTableColumns = this._inventoryTableColumns.asReadonly();

  private readonly _inventoryFormFields = signal<InventoryFormFieldKey[]>(DEFAULT_INVENTORY_FORM_FIELDS);
  readonly inventoryFormFields = this._inventoryFormFields.asReadonly();

  private readonly _requireRetirementApproval = signal(true);
  readonly requireRetirementApproval = this._requireRetirementApproval.asReadonly();

  // Org-wide kill switch for the Inventory page's "Bulk edit" feature (see
  // Customize > Workflow), not to be confused with InventoryComponent's own
  // per-session bulkEditEnabled field (whether *this visit* currently has
  // it turned on) — this is whether the feature exists for the org at all.
  private readonly _bulkEditFeatureEnabled = signal(true);
  readonly bulkEditFeatureEnabled = this._bulkEditFeatureEnabled.asReadonly();

  /** Loads the caller's own organization's settings row and applies the theme
   *  attribute. `site_settings` is per-organization and no longer readable by
   *  anon, so pre-login (and any signed-out state) just falls back to the
   *  built-in default theme/logo instead of querying. Call once a profile is
   *  available (e.g. after AuthService's session/profile resolve). */
  async load() {
    const profile = await this.authService.getProfile();
    if (!profile) {
      this._theme.set('default');
      this._logoStoragePath.set(null);
      this._inventoryTableColumns.set(DEFAULT_INVENTORY_TABLE_COLUMNS);
      this._inventoryFormFields.set(DEFAULT_INVENTORY_FORM_FIELDS);
      this._requireRetirementApproval.set(true);
      this._bulkEditFeatureEnabled.set(true);
      this.applyTheme('default');
      return;
    }

    const { data } = await this.supabase
      .from('site_settings')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .maybeSingle();

    this._theme.set(data?.theme ?? 'default');
    this._logoStoragePath.set(data?.logo_storage_path ?? null);
    this._inventoryTableColumns.set(
      (data?.inventory_table_columns as InventoryTableColumnKey[] | undefined) ?? DEFAULT_INVENTORY_TABLE_COLUMNS
    );
    this._inventoryFormFields.set(
      (data?.inventory_form_fields as InventoryFormFieldKey[] | undefined) ?? DEFAULT_INVENTORY_FORM_FIELDS
    );
    this._requireRetirementApproval.set(data?.require_retirement_approval ?? true);
    this._bulkEditFeatureEnabled.set(data?.bulk_edit_enabled ?? true);
    this.applyTheme(this._theme());
  }

  /** Resolves a specific organization's logo, independent of the caller's own
   *  session — used by the register page to preview an invite link's org
   *  logo before signup, via the anon-readable site_settings policy scoped
   *  to branding only (theme/logo aren't sensitive). */
  async loadLogoUrlForOrganization(organizationId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from('site_settings')
      .select('logo_storage_path')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!data?.logo_storage_path) {
      return null;
    }
    return this.supabase.storage.from(LOGO_BUCKET).getPublicUrl(data.logo_storage_path).data.publicUrl;
  }

  /** Swaps the [data-theme] attribute driving the precompiled theme blocks
   *  in styles.scss, without persisting anything — used for live preview. */
  applyTheme(theme: string) {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  async updateTheme(theme: string): Promise<string | null> {
    const session = await this.authService.getSession();
    const organizationId = this.authService.organizationId();
    if (!session || !organizationId) {
      return 'You must be signed in to update the theme.';
    }

    const { error } = await this.supabase
      .from('site_settings')
      .upsert(
        { organization_id: organizationId, theme, updated_by: session.user.id },
        { onConflict: 'organization_id' }
      );

    if (error) {
      return error.message;
    }

    this._theme.set(theme);
    this.applyTheme(theme);
    return null;
  }

  async updateInventoryTableColumns(columns: InventoryTableColumnKey[]): Promise<string | null> {
    const session = await this.authService.getSession();
    const organizationId = this.authService.organizationId();
    if (!session || !organizationId) {
      return 'You must be signed in to update the inventory table columns.';
    }

    const { error } = await this.supabase
      .from('site_settings')
      .upsert(
        { organization_id: organizationId, inventory_table_columns: columns, updated_by: session.user.id },
        { onConflict: 'organization_id' }
      );

    if (error) {
      return error.message;
    }

    this._inventoryTableColumns.set(columns);
    return null;
  }

  async updateInventoryFormFields(fields: InventoryFormFieldKey[]): Promise<string | null> {
    const session = await this.authService.getSession();
    const organizationId = this.authService.organizationId();
    if (!session || !organizationId) {
      return 'You must be signed in to update the inventory form fields.';
    }

    const { error } = await this.supabase
      .from('site_settings')
      .upsert(
        { organization_id: organizationId, inventory_form_fields: fields, updated_by: session.user.id },
        { onConflict: 'organization_id' }
      );

    if (error) {
      return error.message;
    }

    this._inventoryFormFields.set(fields);
    return null;
  }

  async updateRequireRetirementApproval(required: boolean): Promise<string | null> {
    const session = await this.authService.getSession();
    const organizationId = this.authService.organizationId();
    if (!session || !organizationId) {
      return 'You must be signed in to update this setting.';
    }

    const { error } = await this.supabase
      .from('site_settings')
      .upsert(
        { organization_id: organizationId, require_retirement_approval: required, updated_by: session.user.id },
        { onConflict: 'organization_id' }
      );

    if (error) {
      return error.message;
    }

    this._requireRetirementApproval.set(required);
    return null;
  }

  async updateBulkEditFeatureEnabled(enabled: boolean): Promise<string | null> {
    const session = await this.authService.getSession();
    const organizationId = this.authService.organizationId();
    if (!session || !organizationId) {
      return 'You must be signed in to update this setting.';
    }

    const { error } = await this.supabase
      .from('site_settings')
      .upsert(
        { organization_id: organizationId, bulk_edit_enabled: enabled, updated_by: session.user.id },
        { onConflict: 'organization_id' }
      );

    if (error) {
      return error.message;
    }

    this._bulkEditFeatureEnabled.set(enabled);
    return null;
  }

  async uploadLogo(file: File): Promise<string | null> {
    const session = await this.authService.getSession();
    const organizationId = this.authService.organizationId();
    if (!session || !organizationId) {
      return 'You must be signed in to upload a logo.';
    }

    const path = `${organizationId}/logo-${Date.now()}-${file.name}`;
    const { error: uploadError } = await this.supabase.storage.from(LOGO_BUCKET).upload(path, file);
    if (uploadError) {
      return uploadError.message;
    }

    const previousPath = this._logoStoragePath();
    const { error: updateError } = await this.supabase
      .from('site_settings')
      .upsert(
        { organization_id: organizationId, logo_storage_path: path, updated_by: session.user.id },
        { onConflict: 'organization_id' }
      );

    if (updateError) {
      return updateError.message;
    }

    this._logoStoragePath.set(path);
    if (previousPath) {
      await this.supabase.storage.from(LOGO_BUCKET).remove([previousPath]);
    }
    return null;
  }

  async removeLogo(): Promise<string | null> {
    const previousPath = this._logoStoragePath();
    if (!previousPath) {
      return null;
    }

    const session = await this.authService.getSession();
    const organizationId = this.authService.organizationId();
    if (!session || !organizationId) {
      return 'You must be signed in to remove the logo.';
    }

    const { error } = await this.supabase
      .from('site_settings')
      .update({ logo_storage_path: null, updated_by: session.user.id })
      .eq('organization_id', organizationId);

    if (error) {
      return error.message;
    }

    this._logoStoragePath.set(null);
    await this.supabase.storage.from(LOGO_BUCKET).remove([previousPath]);
    return null;
  }
}
