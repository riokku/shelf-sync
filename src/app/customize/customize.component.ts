import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { InventoryFieldOptionsService } from '../core/inventory-field-options.service';
import { SiteSettingsService } from '../core/site-settings.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { FieldOptionsEditorComponent } from '../shared/components/field-options-editor/field-options-editor.component';
import { THEME_PRESETS } from '../shared/models/theme-preset';
import { INVENTORY_TABLE_COLUMN_OPTIONS, InventoryTableColumnKey } from '../shared/models/inventory-table-column';

@Component({
  selector: 'app-customize',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatIconModule, MatProgressSpinnerModule, BreadcrumbsComponent, FieldOptionsEditorComponent],
  templateUrl: './customize.component.html',
  styleUrl: './customize.component.scss'
})
export class CustomizeComponent implements OnInit, OnDestroy {
  protected siteSettings = inject(SiteSettingsService);
  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);

  async ngOnInit() {
    await this.inventoryFieldOptions.load();
  }

  // Same pill-style toggle as manage/tasks and manage/inventory's own
  // create/all view switches, rather than mat-tab-group — this page only
  // ever had the two tabs, and this matches the rest of the app's "Manage"
  // section instead of being the one place still using Material's own tab
  // strip.
  viewMode: 'style' | 'data' = 'style';

  readonly presets = THEME_PRESETS;
  selectedTheme = this.siteSettings.theme();

  isSavingTheme = false;
  themeError: string | null = null;
  themeSaved = false;

  logoPreviewUrl: string | null = null;
  selectedLogoFile: File | null = null;
  isSavingLogo = false;
  logoError: string | null = null;

  readonly tableColumnOptions = INVENTORY_TABLE_COLUMN_OPTIONS;
  // Local editable copy, same pattern as selectedTheme — starts from the
  // persisted setting, only pushed back to SiteSettingsService on save.
  selectedTableColumns: InventoryTableColumnKey[] = [...this.siteSettings.inventoryTableColumns()];
  isSavingTableColumns = false;
  tableColumnsError: string | null = null;
  tableColumnsSaved = false;

  get currentLogoUrl(): string | null {
    return this.logoPreviewUrl ?? this.siteSettings.logoUrl();
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
    this.themeSaved = false;
    this.siteSettings.applyTheme(key);
  }

  async saveTheme() {
    if (this.isSavingTheme) {
      return;
    }

    this.isSavingTheme = true;
    this.themeError = null;
    this.themeSaved = false;

    const error = await this.siteSettings.updateTheme(this.selectedTheme);
    this.isSavingTheme = false;

    if (error) {
      this.themeError = error;
      return;
    }
    this.themeSaved = true;
  }

  toggleTableColumn(key: InventoryTableColumnKey, checked: boolean) {
    this.selectedTableColumns = checked
      ? [...this.selectedTableColumns, key]
      : this.selectedTableColumns.filter(column => column !== key);
    this.tableColumnsSaved = false;
  }

  async saveTableColumns() {
    if (this.isSavingTableColumns) {
      return;
    }

    this.isSavingTableColumns = true;
    this.tableColumnsError = null;
    this.tableColumnsSaved = false;

    const error = await this.siteSettings.updateInventoryTableColumns(this.selectedTableColumns);
    this.isSavingTableColumns = false;

    if (error) {
      this.tableColumnsError = error;
      return;
    }
    this.tableColumnsSaved = true;
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
