import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { InventoryFieldName, InventoryFieldOptionsService } from '../../../core/inventory-field-options.service';

@Component({
  selector: 'app-field-options-editor',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule],
  templateUrl: './field-options-editor.component.html',
  styleUrl: './field-options-editor.component.scss'
})
export class FieldOptionsEditorComponent implements OnInit {
  @Input({ required: true }) fieldName!: InventoryFieldName;
  @Input({ required: true }) label!: string;

  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);

  newValue = '';
  isSaving = false;
  error: string | null = null;

  usedValues: string[] = [];
  isLoadingUsedValues = false;
  addingSuggestion: string | null = null;

  get options(): string[] {
    return this.inventoryFieldOptions.optionsFor(this.fieldName);
  }

  /** Values already typed into existing inventory items that aren't on the
   *  approved list yet — lets an admin bootstrap the list from real data
   *  instead of retyping everything by hand. */
  get suggestedValues(): string[] {
    return this.usedValues.filter(value => !this.options.includes(value));
  }

  async ngOnInit() {
    this.isLoadingUsedValues = true;
    this.usedValues = await this.inventoryFieldOptions.loadUsedValues(this.fieldName);
    this.isLoadingUsedValues = false;
  }

  async addOption() {
    const value = this.newValue.trim();
    if (!value || this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.error = null;

    const error = await this.inventoryFieldOptions.addOption(this.fieldName, value);

    this.isSaving = false;

    if (error) {
      this.error = error;
      return;
    }
    this.newValue = '';
  }

  async addSuggestion(value: string) {
    if (this.addingSuggestion) {
      return;
    }

    this.addingSuggestion = value;
    this.error = null;

    const error = await this.inventoryFieldOptions.addOption(this.fieldName, value);

    this.addingSuggestion = null;

    if (error) {
      this.error = error;
    }
  }

  async removeOption(value: string) {
    this.error = null;
    const error = await this.inventoryFieldOptions.removeOption(this.fieldName, value);
    if (error) {
      this.error = error;
    }
  }
}
