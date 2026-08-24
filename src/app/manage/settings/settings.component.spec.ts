import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';

import { SettingsComponent } from './settings.component';
import { SiteSettingsService } from '../../core/site-settings.service';
import { InventoryFieldOptionsService } from '../../core/inventory-field-options.service';
import { NotificationService } from '../../core/notification.service';
import { createFakeActivatedRoute, createFakeInventoryFieldOptionsService, createFakeSiteSettingsService } from '../../testing/fakes';
import { DEFAULT_INVENTORY_TABLE_COLUMNS } from '../../shared/models/inventory-table-column';
import { DEFAULT_INVENTORY_FORM_FIELDS } from '../../shared/models/inventory-form-field';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;
  let siteSettings: SiteSettingsService;
  let fieldOptionsService: InventoryFieldOptionsService;
  let fieldOptionsLoadSpy: jasmine.Spy;
  let notificationSuccessSpy: jasmine.Spy;

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
      imports: [SettingsComponent],
      providers: [
        provideRouter([]),
        { provide: SiteSettingsService, useValue: siteSettings },
        { provide: InventoryFieldOptionsService, useValue: fieldOptionsService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    // NotificationService isn't overridden in providers above (same as every
    // other spec in this app — the real service, backed by MatSnackBar,
    // works fine under TestBed) — spied here so save methods can assert a
    // toast fired instead of the removed inline "saved" text/flags.
    notificationSuccessSpy = spyOn((component as unknown as { notification: NotificationService }).notification, 'success');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('defaults to the Data tab', () => {
    expect(component.viewMode).toBe('data');
  });

  it('setViewMode() updates viewMode and reflects it in the URL as ?tab=, without adding a history entry', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate');

    component.setViewMode('workflow');

    expect(component.viewMode).toBe('workflow');
    expect(navigateSpy).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { tab: 'workflow' },
      queryParamsHandling: 'merge',
      replaceUrl: true
    }));
  });

  describe('reading the initial tab from ?tab=', () => {
    async function createWithTabParam(tab: string | undefined): Promise<SettingsComponent> {
      await TestBed.resetTestingModule().configureTestingModule({
        imports: [SettingsComponent],
        providers: [
          provideRouter([]),
          { provide: SiteSettingsService, useValue: siteSettings },
          { provide: InventoryFieldOptionsService, useValue: fieldOptionsService },
          { provide: ActivatedRoute, useValue: createFakeActivatedRoute(tab ? { tab } : {}) }
        ]
      }).compileComponents();

      const tabFixture = TestBed.createComponent(SettingsComponent);
      tabFixture.detectChanges();
      await tabFixture.whenStable();
      return tabFixture.componentInstance;
    }

    it('opens directly to the tab named in ?tab= when it names a real tab', async () => {
      const tabComponent = await createWithTabParam('workflow');
      expect(tabComponent.viewMode).toBe('workflow');
    });

    it('falls back to the default tab when ?tab= is missing or not a real tab', async () => {
      expect((await createWithTabParam(undefined)).viewMode).toBe('data');
      expect((await createWithTabParam('bogus')).viewMode).toBe('data');
    });
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
    describe('themeChanged', () => {
      it('is false when the selection matches the persisted setting', () => {
        expect(component.themeChanged).toBe(false);
      });

      it('is true once a different theme is selected', () => {
        component.selectTheme('ocean');
        expect(component.themeChanged).toBe(true);
      });
    });

    // Regression coverage for a real UX change: the Save button used to
    // always render, just disabled — now it's hidden outright when there's
    // nothing to save, rather than shown-but-inert.
    it('hides the Save button until the theme actually changes', () => {
      component.viewMode = 'style';
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Save theme');

      component.selectTheme('ocean');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Save theme');
    });

    it('selectTheme() previews the theme immediately', () => {
      const applyThemeSpy = spyOn(siteSettings, 'applyTheme');

      component.selectTheme('ocean');

      expect(component.selectedTheme).toBe('ocean');
      expect(applyThemeSpy).toHaveBeenCalledWith('ocean');
    });

    it('saveTheme() persists the selection and shows a success toast', async () => {
      const updateSpy = spyOn(siteSettings, 'updateTheme').and.returnValue(Promise.resolve(null));
      component.selectedTheme = 'ocean';

      await component.saveTheme();

      expect(updateSpy).toHaveBeenCalledWith('ocean');
      expect(notificationSuccessSpy).toHaveBeenCalledWith('Theme saved for everyone');
      expect(component.themeError).toBeNull();
      expect(component.isSavingTheme).toBe(false);
    });

    it('saveTheme() surfaces the error and shows no toast on failure', async () => {
      spyOn(siteSettings, 'updateTheme').and.returnValue(Promise.resolve('db is down'));

      await component.saveTheme();

      expect(component.themeError).toBe('db is down');
      expect(notificationSuccessSpy).not.toHaveBeenCalled();
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

    it('saveTableColumns() persists the selection and shows a success toast', async () => {
      const updateSpy = spyOn(siteSettings, 'updateInventoryTableColumns').and.returnValue(Promise.resolve(null));
      component.selectedTableColumns = ['barcode', 'status'];

      await component.saveTableColumns();

      expect(updateSpy).toHaveBeenCalledWith(['barcode', 'status']);
      expect(notificationSuccessSpy).toHaveBeenCalledWith('Table columns saved for everyone');
      expect(component.tableColumnsError).toBeNull();
    });

    it('saveTableColumns() surfaces the error and shows no toast on failure', async () => {
      spyOn(siteSettings, 'updateInventoryTableColumns').and.returnValue(Promise.resolve('nope'));

      await component.saveTableColumns();

      expect(component.tableColumnsError).toBe('nope');
      expect(notificationSuccessSpy).not.toHaveBeenCalled();
    });
  });

  describe('inventory data (form fields)', () => {
    it('toggleFormField() adds a field when checked and removes it when unchecked', () => {
      component.toggleFormField('barcode', false);
      expect(component.selectedFormFields).not.toContain('barcode');

      component.toggleFormField('barcode', true);
      expect(component.selectedFormFields).toContain('barcode');
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

    it('saveFormFields() persists the selection and shows a success toast', async () => {
      const updateSpy = spyOn(siteSettings, 'updateInventoryFormFields').and.returnValue(Promise.resolve(null));
      component.selectedFormFields = ['barcode', 'photos'];

      await component.saveFormFields();

      expect(updateSpy).toHaveBeenCalledWith(['barcode', 'photos']);
      expect(notificationSuccessSpy).toHaveBeenCalledWith('Inventory data fields saved for everyone');
      expect(component.formFieldsError).toBeNull();
    });

    it('saveFormFields() surfaces the error and shows no toast on failure', async () => {
      spyOn(siteSettings, 'updateInventoryFormFields').and.returnValue(Promise.resolve('nope'));

      await component.saveFormFields();

      expect(component.formFieldsError).toBe('nope');
      expect(notificationSuccessSpy).not.toHaveBeenCalled();
    });
  });

  describe('workflow (retirement approval)', () => {
    it('initializes selectedRequireRetirementApproval from the persisted setting', () => {
      expect(component.selectedRequireRetirementApproval).toBe(true);
    });

    it('toggleRequireRetirementApproval() updates the local selection', () => {
      component.toggleRequireRetirementApproval(false);

      expect(component.selectedRequireRetirementApproval).toBe(false);
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

    it('saveRequireRetirementApproval() persists the selection and shows a success toast', async () => {
      const updateSpy = spyOn(siteSettings, 'updateRequireRetirementApproval').and.returnValue(Promise.resolve(null));
      component.selectedRequireRetirementApproval = false;

      await component.saveRequireRetirementApproval();

      expect(updateSpy).toHaveBeenCalledWith(false);
      expect(notificationSuccessSpy).toHaveBeenCalledWith('Saved for everyone');
      expect(component.requireRetirementApprovalError).toBeNull();
    });

    it('saveRequireRetirementApproval() surfaces the error and shows no toast on failure', async () => {
      spyOn(siteSettings, 'updateRequireRetirementApproval').and.returnValue(Promise.resolve('nope'));

      await component.saveRequireRetirementApproval();

      expect(component.requireRetirementApprovalError).toBe('nope');
      expect(notificationSuccessSpy).not.toHaveBeenCalled();
    });

    it('saveRequireRetirementApproval() is a no-op while already saving', async () => {
      const updateSpy = spyOn(siteSettings, 'updateRequireRetirementApproval').and.returnValue(Promise.resolve(null));
      component.isSavingRequireRetirementApproval = true;

      await component.saveRequireRetirementApproval();

      expect(updateSpy).not.toHaveBeenCalled();
    });

    // Regression coverage for a real UX change: the Save button used to
    // always render, just disabled — now it's hidden outright when there's
    // nothing to save, rather than shown-but-inert. Checked here (rather
    // than duplicated for every section) since every section's button
    // follows the exact same @if (xChanged) pattern.
    it('hides the Save button until the toggle actually changes', () => {
      component.viewMode = 'workflow';
      fixture.detectChanges();
      // .includes(), not an exact match — mat-icon's "check" ligature text
      // is part of the same button's textContent alongside the "Save" label.
      const saveButtons = () => Array.from(fixture.nativeElement.querySelectorAll('button'))
        .filter((button): button is HTMLButtonElement => !!(button as HTMLButtonElement).textContent?.includes('Save'));
      expect(saveButtons().length).toBe(0);

      component.toggleRequireRetirementApproval(false);
      fixture.detectChanges();
      expect(saveButtons().length).toBe(1);
    });
  });

  describe('workflow (bulk edit feature)', () => {
    it('initializes selectedBulkEditFeatureEnabled from the persisted setting', () => {
      expect(component.selectedBulkEditFeatureEnabled).toBe(true);
    });

    it('toggleBulkEditFeatureEnabled() updates the local selection', () => {
      component.toggleBulkEditFeatureEnabled(false);

      expect(component.selectedBulkEditFeatureEnabled).toBe(false);
    });

    describe('bulkEditFeatureEnabledChanged', () => {
      it('is false when the selection matches the persisted setting', () => {
        expect(component.bulkEditFeatureEnabledChanged).toBe(false);
      });

      it('is true once toggled', () => {
        component.toggleBulkEditFeatureEnabled(false);
        expect(component.bulkEditFeatureEnabledChanged).toBe(true);
      });
    });

    it('saveBulkEditFeatureEnabled() persists the selection and shows a success toast', async () => {
      const updateSpy = spyOn(siteSettings, 'updateBulkEditFeatureEnabled').and.returnValue(Promise.resolve(null));
      component.selectedBulkEditFeatureEnabled = false;

      await component.saveBulkEditFeatureEnabled();

      expect(updateSpy).toHaveBeenCalledWith(false);
      expect(notificationSuccessSpy).toHaveBeenCalledWith('Saved for everyone');
      expect(component.bulkEditFeatureEnabledError).toBeNull();
    });

    it('saveBulkEditFeatureEnabled() surfaces the error and shows no toast on failure', async () => {
      spyOn(siteSettings, 'updateBulkEditFeatureEnabled').and.returnValue(Promise.resolve('nope'));

      await component.saveBulkEditFeatureEnabled();

      expect(component.bulkEditFeatureEnabledError).toBe('nope');
      expect(notificationSuccessSpy).not.toHaveBeenCalled();
    });

    it('saveBulkEditFeatureEnabled() is a no-op while already saving', async () => {
      const updateSpy = spyOn(siteSettings, 'updateBulkEditFeatureEnabled').and.returnValue(Promise.resolve(null));
      component.isSavingBulkEditFeatureEnabled = true;

      await component.saveBulkEditFeatureEnabled();

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('workflow (email notifications)', () => {
    it('initializes all four selections from the persisted settings', () => {
      expect(component.selectedNotifyTaskAssigned).toBe(true);
      expect(component.selectedNotifyTaskTransfer).toBe(true);
      expect(component.selectedNotifyRetirementRequest).toBe(true);
      expect(component.selectedNotifyJoinRequest).toBe(true);
    });

    it('each toggleNotifyX() updates just its own local selection', () => {
      component.toggleNotifyTaskAssigned(false);
      component.toggleNotifyJoinRequest(false);

      expect(component.selectedNotifyTaskAssigned).toBe(false);
      expect(component.selectedNotifyTaskTransfer).toBe(true);
      expect(component.selectedNotifyRetirementRequest).toBe(true);
      expect(component.selectedNotifyJoinRequest).toBe(false);
    });

    describe('enableAllEmailNotifications() / disableAllEmailNotifications()', () => {
      it('enableAllEmailNotifications() sets all four selections to true', () => {
        component.toggleNotifyTaskAssigned(false);
        component.toggleNotifyJoinRequest(false);

        component.enableAllEmailNotifications();

        expect(component.selectedNotifyTaskAssigned).toBe(true);
        expect(component.selectedNotifyTaskTransfer).toBe(true);
        expect(component.selectedNotifyRetirementRequest).toBe(true);
        expect(component.selectedNotifyJoinRequest).toBe(true);
      });

      it('disableAllEmailNotifications() sets all four selections to false', () => {
        component.disableAllEmailNotifications();

        expect(component.selectedNotifyTaskAssigned).toBe(false);
        expect(component.selectedNotifyTaskTransfer).toBe(false);
        expect(component.selectedNotifyRetirementRequest).toBe(false);
        expect(component.selectedNotifyJoinRequest).toBe(false);
      });

      it('allEmailNotificationsEnabled/allEmailNotificationsDisabled reflect a uniform selection', () => {
        component.enableAllEmailNotifications();
        expect(component.allEmailNotificationsEnabled).toBe(true);
        expect(component.allEmailNotificationsDisabled).toBe(false);

        component.disableAllEmailNotifications();
        expect(component.allEmailNotificationsEnabled).toBe(false);
        expect(component.allEmailNotificationsDisabled).toBe(true);
      });

      it('allEmailNotificationsEnabled/allEmailNotificationsDisabled are both false for a mixed selection', () => {
        component.toggleNotifyTaskAssigned(false);

        expect(component.allEmailNotificationsEnabled).toBe(false);
        expect(component.allEmailNotificationsDisabled).toBe(false);
      });
    });

    describe('emailNotificationsChanged', () => {
      it('is false when every selection matches the persisted settings', () => {
        expect(component.emailNotificationsChanged).toBe(false);
      });

      it('is true once any one of the four is toggled', () => {
        component.toggleNotifyRetirementRequest(false);
        expect(component.emailNotificationsChanged).toBe(true);
      });
    });

    it('saveEmailNotifications() persists all four selections together and shows a success toast', async () => {
      const updateSpy = spyOn(siteSettings, 'updateEmailNotifications').and.returnValue(Promise.resolve(null));
      component.selectedNotifyTaskAssigned = false;
      component.selectedNotifyRetirementRequest = false;

      await component.saveEmailNotifications();

      expect(updateSpy).toHaveBeenCalledWith({
        taskAssigned: false,
        taskTransfer: true,
        retirementRequest: false,
        joinRequest: true
      });
      expect(notificationSuccessSpy).toHaveBeenCalledWith('Saved for everyone');
      expect(component.emailNotificationsError).toBeNull();
    });

    it('saveEmailNotifications() surfaces the error and shows no toast on failure', async () => {
      spyOn(siteSettings, 'updateEmailNotifications').and.returnValue(Promise.resolve('nope'));

      await component.saveEmailNotifications();

      expect(component.emailNotificationsError).toBe('nope');
      expect(notificationSuccessSpy).not.toHaveBeenCalled();
    });

    it('saveEmailNotifications() is a no-op while already saving', async () => {
      const updateSpy = spyOn(siteSettings, 'updateEmailNotifications').and.returnValue(Promise.resolve(null));
      component.isSavingEmailNotifications = true;

      await component.saveEmailNotifications();

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
