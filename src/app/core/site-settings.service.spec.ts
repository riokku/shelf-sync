import { TestBed } from '@angular/core/testing';
import { SiteSettingsService } from './site-settings.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { createFakeAuthService, createFakeProfile } from '../testing/fakes';
import { DEFAULT_INVENTORY_TABLE_COLUMNS } from '../shared/models/inventory-table-column';
import { DEFAULT_INVENTORY_FORM_FIELDS } from '../shared/models/inventory-form-field';

const LOGO_BUCKET = 'site-assets';

/** Hand-rolled rather than the shared createFakeSupabaseService() — this is
 *  the first spec that needs .storage (getPublicUrl/upload/remove) on top
 *  of .from(), and every method below needs to return a *different*
 *  configurable result (maybeSingle's row, upsert's error, update's error,
 *  upload's error) rather than the shared fake's one-result-for-everything
 *  shape. Spies are exposed so tests can assert on exactly what was sent. */
function createFakeSupabaseClient(config: {
  siteSettingsRow?: Record<string, unknown> | null;
  upsertError?: { message: string } | null;
  updateError?: { message: string } | null;
  uploadError?: { message: string } | null;
} = {}) {
  const upsertSpy = jasmine.createSpy('upsert').and.returnValue(Promise.resolve({ error: config.upsertError ?? null }));
  const updateEqSpy = jasmine.createSpy('update.eq').and.returnValue(Promise.resolve({ error: config.updateError ?? null }));
  const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: updateEqSpy });
  const uploadSpy = jasmine.createSpy('upload').and.returnValue(Promise.resolve({ error: config.uploadError ?? null }));
  const removeSpy = jasmine.createSpy('remove').and.returnValue(Promise.resolve({ error: null }));

  const tableBuilder = {
    select: () => tableBuilder,
    eq: () => tableBuilder,
    maybeSingle: () => Promise.resolve({ data: config.siteSettingsRow ?? null }),
    upsert: upsertSpy,
    update: updateSpy
  };

  const storageBucket = {
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://fake.storage/${LOGO_BUCKET}/${path}` } }),
    upload: uploadSpy,
    remove: removeSpy
  };

  const client = {
    from: () => tableBuilder,
    storage: { from: () => storageBucket }
  };

  return { client, upsertSpy, updateSpy, updateEqSpy, uploadSpy, removeSpy };
}

describe('SiteSettingsService', () => {
  function setup(
    supabaseConfig: Parameters<typeof createFakeSupabaseClient>[0] = {},
    authOptions: { profile?: ReturnType<typeof createFakeProfile> | null; hasSession?: boolean } = {}
  ) {
    const fakeSupabase = createFakeSupabaseClient(supabaseConfig);
    const fakeAuth = createFakeAuthService(authOptions.profile ?? null, { hasSession: authOptions.hasSession });

    TestBed.configureTestingModule({
      providers: [
        SiteSettingsService,
        { provide: SupabaseService, useValue: { client: fakeSupabase.client } },
        { provide: AuthService, useValue: fakeAuth }
      ]
    });

    const service = TestBed.inject(SiteSettingsService);
    return { service, ...fakeSupabase };
  }

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('should create', () => {
    const { service } = setup();
    expect(service).toBeTruthy();
  });

  describe('load()', () => {
    it('resets to defaults when no profile is available (signed out)', async () => {
      const { service } = setup({}, { profile: null });

      await service.load();

      expect(service.theme()).toBe('default');
      expect(service.logoUrl()).toBeNull();
      expect(service.inventoryTableColumns()).toEqual(DEFAULT_INVENTORY_TABLE_COLUMNS);
      expect(service.inventoryFormFields()).toEqual(DEFAULT_INVENTORY_FORM_FIELDS);
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    });

    it('falls back to defaults when a profile exists but no settings row does yet', async () => {
      const profile = createFakeProfile();
      const { service } = setup({ siteSettingsRow: null }, { profile });

      await service.load();

      expect(service.theme()).toBe('default');
      expect(service.logoUrl()).toBeNull();
      expect(service.inventoryTableColumns()).toEqual(DEFAULT_INVENTORY_TABLE_COLUMNS);
      expect(service.inventoryFormFields()).toEqual(DEFAULT_INVENTORY_FORM_FIELDS);
    });

    it('applies a persisted theme/logo/table-columns/form-fields row and sets the data-theme attribute', async () => {
      const profile = createFakeProfile();
      const { service } = setup({
        siteSettingsRow: {
          theme: 'ocean',
          logo_storage_path: 'org-1/logo.png',
          inventory_table_columns: ['category', 'status'],
          inventory_form_fields: ['category', 'photos']
        }
      }, { profile });

      await service.load();

      expect(service.theme()).toBe('ocean');
      expect(service.logoUrl()).toBe('https://fake.storage/site-assets/org-1/logo.png');
      expect(service.inventoryTableColumns()).toEqual(['category', 'status'] as never);
      expect(service.inventoryFormFields()).toEqual(['category', 'photos'] as never);
      expect(document.documentElement.getAttribute('data-theme')).toBe('ocean');
    });
  });

  describe('applyTheme()', () => {
    it('removes the data-theme attribute for "default"', () => {
      const { service } = setup();
      document.documentElement.setAttribute('data-theme', 'ocean');

      service.applyTheme('default');

      expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    });

    it('sets the data-theme attribute for any other preset', () => {
      const { service } = setup();

      service.applyTheme('forest');

      expect(document.documentElement.getAttribute('data-theme')).toBe('forest');
    });
  });

  describe('updateTheme()', () => {
    it('refuses when signed out', async () => {
      const { service, upsertSpy } = setup({}, { profile: null });

      const error = await service.updateTheme('ocean');

      expect(error).toContain('signed in');
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('upserts the new theme, updates the signal, and applies it', async () => {
      const profile = createFakeProfile({ organization_id: 'org-1' });
      const { service, upsertSpy } = setup({}, { profile });

      const error = await service.updateTheme('ocean');

      expect(error).toBeNull();
      expect(service.theme()).toBe('ocean');
      expect(document.documentElement.getAttribute('data-theme')).toBe('ocean');
      expect(upsertSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ organization_id: 'org-1', theme: 'ocean' }),
        { onConflict: 'organization_id' }
      );
    });

    it('returns the error message and leaves the signal untouched on failure', async () => {
      const profile = createFakeProfile();
      const { service } = setup({ upsertError: { message: 'db is down' } }, { profile });

      const error = await service.updateTheme('ocean');

      expect(error).toBe('db is down');
      expect(service.theme()).toBe('default');
    });
  });

  describe('updateInventoryTableColumns()', () => {
    it('refuses when signed out', async () => {
      const { service, upsertSpy } = setup({}, { profile: null });

      const error = await service.updateInventoryTableColumns(['category']);

      expect(error).toContain('signed in');
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('upserts the new columns and updates the signal', async () => {
      const profile = createFakeProfile({ organization_id: 'org-1' });
      const { service, upsertSpy } = setup({}, { profile });

      const error = await service.updateInventoryTableColumns(['status', 'category']);

      expect(error).toBeNull();
      expect(service.inventoryTableColumns()).toEqual(['status', 'category'] as never);
      expect(upsertSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ organization_id: 'org-1', inventory_table_columns: ['status', 'category'] }),
        { onConflict: 'organization_id' }
      );
    });

    it('returns the error message and leaves the signal untouched on failure', async () => {
      const profile = createFakeProfile();
      const { service } = setup({ upsertError: { message: 'nope' } }, { profile });

      const error = await service.updateInventoryTableColumns(['status']);

      expect(error).toBe('nope');
      expect(service.inventoryTableColumns()).toEqual(DEFAULT_INVENTORY_TABLE_COLUMNS);
    });
  });

  describe('updateInventoryFormFields()', () => {
    it('refuses when signed out', async () => {
      const { service, upsertSpy } = setup({}, { profile: null });

      const error = await service.updateInventoryFormFields(['category']);

      expect(error).toContain('signed in');
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('upserts the new fields and updates the signal', async () => {
      const profile = createFakeProfile({ organization_id: 'org-1' });
      const { service, upsertSpy } = setup({}, { profile });

      const error = await service.updateInventoryFormFields(['barcode', 'photos']);

      expect(error).toBeNull();
      expect(service.inventoryFormFields()).toEqual(['barcode', 'photos'] as never);
      expect(upsertSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ organization_id: 'org-1', inventory_form_fields: ['barcode', 'photos'] }),
        { onConflict: 'organization_id' }
      );
    });

    it('returns the error message and leaves the signal untouched on failure', async () => {
      const profile = createFakeProfile();
      const { service } = setup({ upsertError: { message: 'nope' } }, { profile });

      const error = await service.updateInventoryFormFields(['barcode']);

      expect(error).toBe('nope');
      expect(service.inventoryFormFields()).toEqual(DEFAULT_INVENTORY_FORM_FIELDS);
    });
  });

  describe('uploadLogo()', () => {
    function testFile(): File {
      return new File(['x'], 'logo.png', { type: 'image/png' });
    }

    it('refuses when signed out', async () => {
      const { service, uploadSpy } = setup({}, { profile: null });

      const error = await service.uploadLogo(testFile());

      expect(error).toContain('signed in');
      expect(uploadSpy).not.toHaveBeenCalled();
    });

    it('returns the upload error and never touches site_settings on upload failure', async () => {
      const profile = createFakeProfile();
      const { service, upsertSpy } = setup({ uploadError: { message: 'storage full' } }, { profile });

      const error = await service.uploadLogo(testFile());

      expect(error).toBe('storage full');
      expect(upsertSpy).not.toHaveBeenCalled();
      expect(service.logoUrl()).toBeNull();
    });

    it('uploads, upserts the new path, and does not remove anything when there was no previous logo', async () => {
      const profile = createFakeProfile({ organization_id: 'org-1' });
      const { service, uploadSpy, upsertSpy, removeSpy } = setup({}, { profile });

      const error = await service.uploadLogo(testFile());

      expect(error).toBeNull();
      expect(uploadSpy).toHaveBeenCalled();
      expect(upsertSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ organization_id: 'org-1' }),
        { onConflict: 'organization_id' }
      );
      expect(service.logoUrl()).toContain('org-1/logo-');
      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('removes the previous logo file after a successful replace', async () => {
      const profile = createFakeProfile({ organization_id: 'org-1' });
      const { service, removeSpy } = setup({
        siteSettingsRow: { theme: 'default', logo_storage_path: 'org-1/old-logo.png', inventory_table_columns: null }
      }, { profile });
      await service.load();

      await service.uploadLogo(testFile());

      expect(removeSpy).toHaveBeenCalledWith(['org-1/old-logo.png']);
    });

    it('returns the site_settings error without removing the just-uploaded file if the upsert fails', async () => {
      const profile = createFakeProfile();
      const { service, removeSpy } = setup({ upsertError: { message: 'db is down' } }, { profile });

      const error = await service.uploadLogo(testFile());

      expect(error).toBe('db is down');
      expect(removeSpy).not.toHaveBeenCalled();
      expect(service.logoUrl()).toBeNull();
    });
  });

  describe('removeLogo()', () => {
    it('no-ops when there is no logo set', async () => {
      const { service, updateSpy } = setup();

      const error = await service.removeLogo();

      expect(error).toBeNull();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('refuses when the session has expired, even with a logo already loaded', async () => {
      // hasSession: false alongside a real profile is an artificial
      // combination (see createFakeAuthService's own doc comment on why
      // profile/session can independently lag) — used here purely to prove
      // removeLogo() re-checks getSession() fresh on every call rather than
      // trusting whatever state load() left behind.
      const profile = createFakeProfile();
      const { service } = setup({
        siteSettingsRow: { theme: 'default', logo_storage_path: 'org-1/logo.png', inventory_table_columns: null }
      }, { profile, hasSession: false });
      await service.load();

      const error = await service.removeLogo();

      expect(error).toContain('signed in');
    });

    it('clears the logo and removes the storage file on success', async () => {
      const profile = createFakeProfile({ organization_id: 'org-1' });
      const { service, updateSpy, updateEqSpy, removeSpy } = setup({
        siteSettingsRow: { theme: 'default', logo_storage_path: 'org-1/logo.png', inventory_table_columns: null }
      }, { profile });
      await service.load();
      expect(service.logoUrl()).not.toBeNull();

      const error = await service.removeLogo();

      expect(error).toBeNull();
      expect(service.logoUrl()).toBeNull();
      expect(updateSpy).toHaveBeenCalledWith(jasmine.objectContaining({ logo_storage_path: null }));
      expect(updateEqSpy).toHaveBeenCalledWith('organization_id', 'org-1');
      expect(removeSpy).toHaveBeenCalledWith(['org-1/logo.png']);
    });

    it('returns the error message and keeps the logo set on failure', async () => {
      const profile = createFakeProfile();
      const { service, removeSpy } = setup({
        siteSettingsRow: { theme: 'default', logo_storage_path: 'org-1/logo.png', inventory_table_columns: null },
        updateError: { message: 'db is down' }
      }, { profile });
      await service.load();

      const error = await service.removeLogo();

      expect(error).toBe('db is down');
      expect(service.logoUrl()).not.toBeNull();
      expect(removeSpy).not.toHaveBeenCalled();
    });
  });

  describe('loadLogoUrlForOrganization()', () => {
    it('returns null when the organization has no logo set', async () => {
      const { service } = setup({ siteSettingsRow: { logo_storage_path: null } });

      const url = await service.loadLogoUrlForOrganization('org-2');

      expect(url).toBeNull();
    });

    it('resolves the public URL for another organization\'s logo', async () => {
      const { service } = setup({ siteSettingsRow: { logo_storage_path: 'org-2/logo.png' } });

      const url = await service.loadLogoUrlForOrganization('org-2');

      expect(url).toBe('https://fake.storage/site-assets/org-2/logo.png');
    });
  });
});
