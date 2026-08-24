import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { InventoryFieldOptionsService } from '../core/inventory-field-options.service';
import { NotificationService } from '../core/notification.service';
import { SiteSettingsService } from '../core/site-settings.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { FieldOptionsEditorComponent } from '../shared/components/field-options-editor/field-options-editor.component';
import { THEME_PRESETS } from '../shared/models/theme-preset';
import { INVENTORY_TABLE_COLUMN_GROUPS, InventoryTableColumnKey } from '../shared/models/inventory-table-column';
import { INVENTORY_FORM_FIELD_GROUPS, InventoryFormFieldKey } from '../shared/models/inventory-form-field';

@Component({
  selector: 'app-customize',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatIconModule, MatProgressSpinnerModule, MatSlideToggleModule, BreadcrumbsComponent, FieldOptionsEditorComponent],
  templateUrl: './customize.component.html',
  styleUrl: './customize.component.scss'
})
export class CustomizeComponent implements OnInit, OnDestroy {
  protected siteSettings = inject(SiteSettingsService);
  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);
  private notification = inject(NotificationService);

  async ngOnInit() {
    await this.inventoryFieldOptions.load();
  }

  // Same pill-style toggle as manage/tasks and manage/inventory's own
  // create/all view switches, rather than mat-tab-group — this page only
  // ever had the two tabs, and this matches the rest of the app's "Manage"
  // section instead of being the one place still using Material's own tab
  // strip. "Workflow" is the new home for org-behavior toggles like
  // requireRetirementApproval below — deliberately its own tab rather than
  // folded into Data, since it's about how actions behave, not what data
  // looks like, and more of these are expected to land here later.
  viewMode: 'style' | 'data' | 'workflow' = 'data';

  readonly presets = THEME_PRESETS;
  selectedTheme = this.siteSettings.theme();

  isSavingTheme = false;
  themeError: string | null = null;

  logoPreviewUrl: string | null = null;
  selectedLogoFile: File | null = null;
  isSavingLogo = false;
  logoError: string | null = null;

  readonly tableColumnGroups = INVENTORY_TABLE_COLUMN_GROUPS;
  // Local editable copy, same pattern as selectedTheme — starts from the
  // persisted setting, only pushed back to SiteSettingsService on save.
  selectedTableColumns: InventoryTableColumnKey[] = [...this.siteSettings.inventoryTableColumns()];
  isSavingTableColumns = false;
  tableColumnsError: string | null = null;

  readonly formFieldGroups = INVENTORY_FORM_FIELD_GROUPS;
  selectedFormFields: InventoryFormFieldKey[] = [...this.siteSettings.inventoryFormFields()];
  isSavingFormFields = false;
  formFieldsError: string | null = null;

  selectedRequireRetirementApproval = this.siteSettings.requireRetirementApproval();
  isSavingRequireRetirementApproval = false;
  requireRetirementApprovalError: string | null = null;

  selectedBulkEditFeatureEnabled = this.siteSettings.bulkEditFeatureEnabled();
  isSavingBulkEditFeatureEnabled = false;
  bulkEditFeatureEnabledError: string | null = null;

  // One group, one Save button — same reasoning SiteSettingsService's own
  // updateEmailNotifications() doc comment gives for bundling these four
  // into a single upsert.
  selectedNotifyTaskAssigned = this.siteSettings.notifyTaskAssigned();
  selectedNotifyTaskTransfer = this.siteSettings.notifyTaskTransfer();
  selectedNotifyRetirementRequest = this.siteSettings.notifyRetirementRequest();
  selectedNotifyJoinRequest = this.siteSettings.notifyJoinRequest();
  isSavingEmailNotifications = false;
  emailNotificationsError: string | null = null;

  get currentLogoUrl(): string | null {
    return this.logoPreviewUrl ?? this.siteSettings.logoUrl();
  }

  get themeChanged(): boolean {
    return this.selectedTheme !== this.siteSettings.theme();
  }

  /** Order-independent comparison against the persisted setting — toggling
   *  checkboxes off then back on shouldn't leave Save enabled just because
   *  the array happens to be built back up in a different order. */
  get tableColumnsChanged(): boolean {
    const saved = this.siteSettings.inventoryTableColumns();
    if (saved.length !== this.selectedTableColumns.length) {
      return true;
    }
    const savedSet = new Set(saved);
    return this.selectedTableColumns.some(key => !savedSet.has(key));
  }

  /** Same order-independent comparison as tableColumnsChanged above. */
  get formFieldsChanged(): boolean {
    const saved = this.siteSettings.inventoryFormFields();
    if (saved.length !== this.selectedFormFields.length) {
      return true;
    }
    const savedSet = new Set(saved);
    return this.selectedFormFields.some(key => !savedSet.has(key));
  }

  get requireRetirementApprovalChanged(): boolean {
    return this.selectedRequireRetirementApproval !== this.siteSettings.requireRetirementApproval();
  }

  get bulkEditFeatureEnabledChanged(): boolean {
    return this.selectedBulkEditFeatureEnabled !== this.siteSettings.bulkEditFeatureEnabled();
  }

  get emailNotificationsChanged(): boolean {
    return this.selectedNotifyTaskAssigned !== this.siteSettings.notifyTaskAssigned()
      || this.selectedNotifyTaskTransfer !== this.siteSettings.notifyTaskTransfer()
      || this.selectedNotifyRetirementRequest !== this.siteSettings.notifyRetirementRequest()
      || this.selectedNotifyJoinRequest !== this.siteSettings.notifyJoinRequest();
  }

  ngOnDestroy() {
    // Revert any unsaved live preview back to the persisted theme so it
    // doesn't leak into the rest of the app after navigating away.
    this.siteSettings.applyTheme(this.siteSettings.theme());
    if (this.logoPreviewUrl) {
      URL.revokeObjectURL(this.logoPreviewUrl);
    }
  }

  selectTheme(key: string) {
    this.selectedTheme = key;
    this.siteSettings.applyTheme(key);
  }

  async saveTheme() {
    if (this.isSavingTheme) {
      return;
    }

    this.isSavingTheme = true;
    this.themeError = null;

    const error = await this.siteSettings.updateTheme(this.selectedTheme);
    this.isSavingTheme = false;

    if (error) {
      this.themeError = error;
      return;
    }
    this.notification.success('Theme saved for everyone');
  }

  toggleTableColumn(key: InventoryTableColumnKey, checked: boolean) {
    this.selectedTableColumns = checked
      ? [...this.selectedTableColumns, key]
      : this.selectedTableColumns.filter(column => column !== key);
  }

  async saveTableColumns() {
    if (this.isSavingTableColumns) {
      return;
    }

    this.isSavingTableColumns = true;
    this.tableColumnsError = null;

    const error = await this.siteSettings.updateInventoryTableColumns(this.selectedTableColumns);
    this.isSavingTableColumns = false;

    if (error) {
      this.tableColumnsError = error;
      return;
    }
    this.notification.success('Table columns saved for everyone');
  }

  toggleFormField(key: InventoryFormFieldKey, checked: boolean) {
    this.selectedFormFields = checked
      ? [...this.selectedFormFields, key]
      : this.selectedFormFields.filter(field => field !== key);
  }

  async saveFormFields() {
    if (this.isSavingFormFields) {
      return;
    }

    this.isSavingFormFields = true;
    this.formFieldsError = null;

    const error = await this.siteSettings.updateInventoryFormFields(this.selectedFormFields);
    this.isSavingFormFields = false;

    if (error) {
      this.formFieldsError = error;
      return;
    }
    this.notification.success('Inventory data fields saved for everyone');
  }

  toggleRequireRetirementApproval(required: boolean) {
    this.selectedRequireRetirementApproval = required;
  }

  async saveRequireRetirementApproval() {
    if (this.isSavingRequireRetirementApproval) {
      return;
    }

    this.isSavingRequireRetirementApproval = true;
    this.requireRetirementApprovalError = null;

    const error = await this.siteSettings.updateRequireRetirementApproval(this.selectedRequireRetirementApproval);
    this.isSavingRequireRetirementApproval = false;

    if (error) {
      this.requireRetirementApprovalError = error;
      return;
    }
    this.notification.success('Saved for everyone');
  }

  toggleBulkEditFeatureEnabled(enabled: boolean) {
    this.selectedBulkEditFeatureEnabled = enabled;
  }

  async saveBulkEditFeatureEnabled() {
    if (this.isSavingBulkEditFeatureEnabled) {
      return;
    }

    this.isSavingBulkEditFeatureEnabled = true;
    this.bulkEditFeatureEnabledError = null;

    const error = await this.siteSettings.updateBulkEditFeatureEnabled(this.selectedBulkEditFeatureEnabled);
    this.isSavingBulkEditFeatureEnabled = false;

    if (error) {
      this.bulkEditFeatureEnabledError = error;
      return;
    }
    this.notification.success('Saved for everyone');
  }

  toggleNotifyTaskAssigned(enabled: boolean) {
    this.selectedNotifyTaskAssigned = enabled;
  }

  toggleNotifyTaskTransfer(enabled: boolean) {
    this.selectedNotifyTaskTransfer = enabled;
  }

  toggleNotifyRetirementRequest(enabled: boolean) {
    this.selectedNotifyRetirementRequest = enabled;
  }

  toggleNotifyJoinRequest(enabled: boolean) {
    this.selectedNotifyJoinRequest = enabled;
  }

  async saveEmailNotifications() {
    if (this.isSavingEmailNotifications) {
      return;
    }

    this.isSavingEmailNotifications = true;
    this.emailNotificationsError = null;

    const error = await this.siteSettings.updateEmailNotifications({
      taskAssigned: this.selectedNotifyTaskAssigned,
      taskTransfer: this.selectedNotifyTaskTransfer,
      retirementRequest: this.selectedNotifyRetirementRequest,
      joinRequest: this.selectedNotifyJoinRequest
    });
    this.isSavingEmailNotifications = false;

    if (error) {
      this.emailNotificationsError = error;
      return;
    }
    this.notification.success('Saved for everyone');
  }

  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }

    if (this.logoPreviewUrl) {
      URL.revokeObjectURL(this.logoPreviewUrl);
    }
    this.selectedLogoFile = file;
    this.logoPreviewUrl = URL.createObjectURL(file);
    this.logoError = null;
  }

  async saveLogo() {
    if (!this.selectedLogoFile || this.isSavingLogo) {
      return;
    }

    this.isSavingLogo = true;
    this.logoError = null;

    const error = await this.siteSettings.uploadLogo(this.selectedLogoFile);
    this.isSavingLogo = false;

    if (error) {
      this.logoError = error;
      return;
    }

    if (this.logoPreviewUrl) {
      URL.revokeObjectURL(this.logoPreviewUrl);
    }
    this.logoPreviewUrl = null;
    this.selectedLogoFile = null;
  }

  async removeLogo() {
    if (this.isSavingLogo) {
      return;
    }

    this.isSavingLogo = true;
    this.logoError = null;

    const error = await this.siteSettings.removeLogo();
    this.isSavingLogo = false;

    if (error) {
      this.logoError = error;
    }
  }
}
