import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CustomizeComponent } from './customize.component';
import { SiteSettingsService } from '../core/site-settings.service';
import { InventoryFieldOptionsService } from '../core/inventory-field-options.service';
import { createFakeInventoryFieldOptionsService, createFakeSiteSettingsService } from '../testing/fakes';
import { DEFAULT_INVENTORY_TABLE_COLUMNS } from '../shared/models/inventory-table-column';
import { DEFAULT_INVENTORY_FORM_FIELDS } from '../shared/models/inventory-form-field';

describe('CustomizeComponent', () => {
  let component: CustomizeComponent;
  let fixture: ComponentFixture<CustomizeComponent>;
  let siteSettings: SiteSettingsService;
  let fieldOptionsService: InventoryFieldOptionsService;
  let fieldOptionsLoadSpy: jasmine.Spy;

  beforeEach(async () => {
    siteSettings = createFakeSiteSettingsService({
      theme: 'default',
      inventoryTableColumns: [...DEFAULT_INVENTORY_TABLE_COLUMNS],
      inventoryFormFields: [...DEFAULT_INVENTORY_FORM_FIELDS]
    });
    fieldOptionsService = createFakeInventoryFieldOptionsService();
    // Spied before the component is constructed (below, via detectChanges)
    // so this catches ngOnInit's own call to it.
    fieldOptionsLoadSpy = spyOn(fieldOptionsService, 'load').and.callThrough();

    await TestBed.configureTestingModule({
      imports: [CustomizeComponent],
      providers: [
        provideRouter([]),
        { provide: SiteSettingsService, useValue: siteSettings },
        { provide: InventoryFieldOptionsService, useValue: fieldOptionsService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomizeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('defaults to the Data tab', () => {
    expect(component.viewMode).toBe('data');
  });

  it('initializes selectedTheme, selectedTableColumns, and selectedFormFields from the persisted settings', () => {
    expect(component.selectedTheme).toBe('default');
    expect(component.selectedTableColumns).toEqual(DEFAULT_INVENTORY_TABLE_COLUMNS);
    expect(component.selectedFormFields).toEqual(DEFAULT_INVENTORY_FORM_FIELDS);
  });

  it('ngOnInit loads inventory field options', () => {
    expect(fieldOptionsLoadSpy).toHaveBeenCalled();
  });

  describe('theme', () => {
    it('selectTheme() previews the theme immediately and clears any prior saved flag', () => {
      const applyThemeSpy = spyOn(siteSettings, 'applyTheme');
      component.themeSaved = true;

      component.selectTheme('ocean');

      expect(component.selectedTheme).toBe('ocean');
      expect(component.themeSaved).toBe(false);
      expect(applyThemeSpy).toHaveBeenCalledWith('ocean');
    });

    it('saveTheme() persists the selection and flags it saved on success', async () => {
      const updateSpy = spyOn(siteSettings, 'updateTheme').and.returnValue(Promise.resolve(null));
      component.selectedTheme = 'ocean';

      await component.saveTheme();

      expect(updateSpy).toHaveBeenCalledWith('ocean');
      expect(component.themeSaved).toBe(true);
      expect(component.themeError).toBeNull();
      expect(component.isSavingTheme).toBe(false);
    });

    it('saveTheme() surfaces the error and leaves themeSaved false on failure', async () => {
      spyOn(siteSettings, 'updateTheme').and.returnValue(Promise.resolve('db is down'));

      await component.saveTheme();

      expect(component.themeError).toBe('db is down');
      expect(component.themeSaved).toBe(false);
    });

    it('saveTheme() is a no-op while already saving', async () => {
      const updateSpy = spyOn(siteSettings, 'updateTheme').and.returnValue(Promise.resolve(null));
      component.isSavingTheme = true;

      await component.saveTheme();

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('table columns', () => {
    it('toggleTableColumn() adds a column when checked and removes it when unchecked', () => {
      component.toggleTableColumn('barcode', true);
      expect(component.selectedTableColumns).toContain('barcode');

      component.toggleTableColumn('barcode', false);
      expect(component.selectedTableColumns).not.toContain('barcode');
    });

    it('toggleTableColumn() clears any prior saved flag', () => {
      component.tableColumnsSaved = true;
      component.toggleTableColumn('barcode', true);
      expect(component.tableColumnsSaved).toBe(false);
    });

    describe('tableColumnsChanged', () => {
      it('is false when the selection exactly matches the persisted setting', () => {
        expect(component.tableColumnsChanged).toBe(false);
      });

      it('is true when the selection is a different length', () => {
        component.selectedTableColumns = ['category'];
        expect(component.tableColumnsChanged).toBe(true);
      });

      it('is true when the selection has different content at the same length', () => {
        component.selectedTableColumns = ['barcode', 'physicalLocation', 'quantityRemaining', 'status'];
        expect(component.tableColumnsChanged).toBe(true);
      });

      it('is false regardless of order — toggling a column off then back on should not falsely enable Save', () => {
        component.selectedTableColumns = [...DEFAULT_INVENTORY_TABLE_COLUMNS].reverse();
        expect(component.tableColumnsChanged).toBe(false);
      });
    });

    it('saveTableColumns() persists the selection and flags it saved on success', async () => {
      const updateSpy = spyOn(siteSettings, 'updateInventoryTableColumns').and.returnValue(Promise.resolve(null));
      component.selectedTableColumns = ['barcode', 'status'];

      await component.saveTableColumns();

      expect(updateSpy).toHaveBeenCalledWith(['barcode', 'status']);
      expect(component.tableColumnsSaved).toBe(true);
      expect(component.tableColumnsError).toBeNull();
    });

    it('saveTableColumns() surfaces the error on failure', async () => {
      spyOn(siteSettings, 'updateInventoryTableColumns').and.returnValue(Promise.resolve('nope'));

      await component.saveTableColumns();

      expect(component.tableColumnsError).toBe('nope');
      expect(component.tableColumnsSaved).toBe(false);
    });
  });

  describe('inventory data (form fields)', () => {
    it('toggleFormField() adds a field when checked and removes it when unchecked', () => {
      component.toggleFormField('barcode', false);
      expect(component.selectedFormFields).not.toContain('barcode');

      component.toggleFormField('barcode', true);
      expect(component.selectedFormFields).toContain('barcode');
    });

    it('toggleFormField() clears any prior saved flag', () => {
      component.formFieldsSaved = true;
      component.toggleFormField('barcode', false);
      expect(component.formFieldsSaved).toBe(false);
    });

    describe('formFieldsChanged', () => {
      it('is false when the selection exactly matches the persisted setting', () => {
        expect(component.formFieldsChanged).toBe(false);
      });

      it('is true when the selection is a different length', () => {
        component.selectedFormFields = ['barcode'];
        expect(component.formFieldsChanged).toBe(true);
      });

      it('is false regardless of order', () => {
        component.selectedFormFields = [...DEFAULT_INVENTORY_FORM_FIELDS].reverse();
        expect(component.formFieldsChanged).toBe(false);
      });
    });

    it('saveFormFields() persists the selection and flags it saved on success', async () => {
      const updateSpy = spyOn(siteSettings, 'updateInventoryFormFields').and.returnValue(Promise.resolve(null));
      component.selectedFormFields = ['barcode', 'photos'];

      await component.saveFormFields();

      expect(updateSpy).toHaveBeenCalledWith(['barcode', 'photos']);
      expect(component.formFieldsSaved).toBe(true);
      expect(component.formFieldsError).toBeNull();
    });

    it('saveFormFields() surfaces the error on failure', async () => {
      spyOn(siteSettings, 'updateInventoryFormFields').and.returnValue(Promise.resolve('nope'));

      await component.saveFormFields();

      expect(component.formFieldsError).toBe('nope');
      expect(component.formFieldsSaved).toBe(false);
    });
  });

  describe('workflow (retirement approval)', () => {
    it('initializes selectedRequireRetirementApproval from the persisted setting', () => {
      expect(component.selectedRequireRetirementApproval).toBe(true);
    });

    it('toggleRequireRetirementApproval() updates the local selection and clears any prior saved flag', () => {
      component.requireRetirementApprovalSaved = true;

      component.toggleRequireRetirementApproval(false);

      expect(component.selectedRequireRetirementApproval).toBe(false);
      expect(component.requireRetirementApprovalSaved).toBe(false);
    });

    describe('requireRetirementApprovalChanged', () => {
      it('is false when the selection matches the persisted setting', () => {
        expect(component.requireRetirementApprovalChanged).toBe(false);
      });

      it('is true once toggled', () => {
        component.toggleRequireRetirementApproval(false);
        expect(component.requireRetirementApprovalChanged).toBe(true);
      });
    });

    it('saveRequireRetirementApproval() persists the selection and flags it saved on success', async () => {
      const updateSpy = spyOn(siteSettings, 'updateRequireRetirementApproval').and.returnValue(Promise.resolve(null));
      component.selectedRequireRetirementApproval = false;

      await component.saveRequireRetirementApproval();

      expect(updateSpy).toHaveBeenCalledWith(false);
      expect(component.requireRetirementApprovalSaved).toBe(true);
      expect(component.requireRetirementApprovalError).toBeNull();
    });

    it('saveRequireRetirementApproval() surfaces the error on failure', async () => {
      spyOn(siteSettings, 'updateRequireRetirementApproval').and.returnValue(Promise.resolve('nope'));

      await component.saveRequireRetirementApproval();

      expect(component.requireRetirementApprovalError).toBe('nope');
      expect(component.requireRetirementApprovalSaved).toBe(false);
    });

    it('saveRequireRetirementApproval() is a no-op while already saving', async () => {
      const updateSpy = spyOn(siteSettings, 'updateRequireRetirementApproval').and.returnValue(Promise.resolve(null));
      component.isSavingRequireRetirementApproval = true;

      await component.saveRequireRetirementApproval();

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('logo', () => {
    function fakeFileInputEvent(file: File | null): Event {
      return { target: { files: file ? [file] : [], value: '' } } as unknown as Event;
    }

    it('currentLogoUrl prefers the unsaved local preview over the persisted logo', () => {
      expect(component.currentLogoUrl).toBe(siteSettings.logoUrl());

      component.logoPreviewUrl = 'blob:preview';
      expect(component.currentLogoUrl).toBe('blob:preview');
    });

    it('onLogoSelected() does nothing when the picker is dismissed without choosing a file', () => {
      component.onLogoSelected(fakeFileInputEvent(null));

      expect(component.selectedLogoFile).toBeNull();
      expect(component.logoPreviewUrl).toBeNull();
    });

    it('onLogoSelected() previews the chosen file and clears any prior error', () => {
      spyOn(URL, 'createObjectURL').and.returnValue('blob:new-preview');
      component.logoError = 'stale error';
      const file = new File(['x'], 'logo.png', { type: 'image/png' });

      component.onLogoSelected(fakeFileInputEvent(file));

      expect(component.selectedLogoFile).toBe(file);
      expect(component.logoPreviewUrl).toBe('blob:new-preview');
      expect(component.logoError).toBeNull();
    });

    it('onLogoSelected() revokes the previous preview URL before creating a new one', () => {
      const revokeSpy = spyOn(URL, 'revokeObjectURL');
      spyOn(URL, 'createObjectURL').and.returnValue('blob:second-preview');
      component.logoPreviewUrl = 'blob:first-preview';

      component.onLogoSelected(fakeFileInputEvent(new File(['x'], 'logo.png')));

      expect(revokeSpy).toHaveBeenCalledWith('blob:first-preview');
    });

    it('saveLogo() is a no-op with no file selected', async () => {
      const uploadSpy = spyOn(siteSettings, 'uploadLogo');

      await component.saveLogo();

      expect(uploadSpy).not.toHaveBeenCalled();
    });

    it('saveLogo() uploads and clears the local preview/selection on success', async () => {
      const revokeSpy = spyOn(URL, 'revokeObjectURL');
      const uploadSpy = spyOn(siteSettings, 'uploadLogo').and.returnValue(Promise.resolve(null));
      const file = new File(['x'], 'logo.png');
      component.selectedLogoFile = file;
      component.logoPreviewUrl = 'blob:preview';

      await component.saveLogo();

      expect(uploadSpy).toHaveBeenCalledWith(file);
      expect(component.selectedLogoFile).toBeNull();
      expect(component.logoPreviewUrl).toBeNull();
      expect(revokeSpy).toHaveBeenCalledWith('blob:preview');
    });

    it('saveLogo() surfaces the error and keeps the preview/selection for retry on failure', async () => {
      spyOn(siteSettings, 'uploadLogo').and.returnValue(Promise.resolve('storage full'));
      const file = new File(['x'], 'logo.png');
      component.selectedLogoFile = file;
      component.logoPreviewUrl = 'blob:preview';

      await component.saveLogo();

      expect(component.logoError).toBe('storage full');
      expect(component.selectedLogoFile).toBe(file);
      expect(component.logoPreviewUrl).toBe('blob:preview');
    });

    it('removeLogo() clears any error on success', async () => {
      spyOn(siteSettings, 'removeLogo').and.returnValue(Promise.resolve(null));
      component.logoError = 'stale error';

      await component.removeLogo();

      expect(component.logoError).toBeNull();
    });

    it('removeLogo() surfaces the error on failure', async () => {
      spyOn(siteSettings, 'removeLogo').and.returnValue(Promise.resolve('nope'));

      await component.removeLogo();

      expect(component.logoError).toBe('nope');
    });
  });

  describe('ngOnDestroy', () => {
    it('reverts any unsaved theme preview back to the persisted theme', () => {
      const applyThemeSpy = spyOn(siteSettings, 'applyTheme');
      component.selectedTheme = 'ocean';

      fixture.destroy();

      expect(applyThemeSpy).toHaveBeenCalledWith(siteSettings.theme());
    });

    it('revokes a pending logo preview URL, if any', () => {
      const revokeSpy = spyOn(URL, 'revokeObjectURL');
      component.logoPreviewUrl = 'blob:preview';

      fixture.destroy();

      expect(revokeSpy).toHaveBeenCalledWith('blob:preview');
    });

    it('does not attempt to revoke anything when there is no pending preview', () => {
      const revokeSpy = spyOn(URL, 'revokeObjectURL');

      fixture.destroy();

      expect(revokeSpy).not.toHaveBeenCalled();
    });
  });
});
