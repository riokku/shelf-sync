import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SupabaseService } from '../../../core/supabase.service';
import { AuthService } from '../../../core/auth.service';
import { NotificationService } from '../../../core/notification.service';
import { SupplierService } from '../../../core/supplier.service';
import { logActivity } from '../../utils/activity-log';
import { downloadCsv } from '../../utils/inventory-export';
import {
  ParsedImportRow,
  buildImportInsertPayload,
  buildInventoryImportTemplateCsv,
  parseAndValidateImportRows
} from '../../utils/inventory-import';

/** How many rows to insert concurrently per batch — no RPC accepts an array
 *  here (same constraint as every other bulk action in this app), so valid
 *  rows go in one insert per row, but bounded in small concurrent chunks
 *  rather than one giant Promise.all across the whole file, so a large
 *  spreadsheet doesn't fire hundreds of simultaneous requests at once. */
const IMPORT_BATCH_SIZE = 15;

interface FailedImportRow {
  rowNumber: number;
  name: string;
  reason: string;
}

export interface ImportInventoryModalData {
  /** Every name already in the org's inventory (active/pending/retired
   *  alike — a retired item's name is still a real, already-used name),
   *  so a row can be rejected as a likely duplicate before it ever reaches
   *  the DB. Same "whole list, not just the currently-relevant subset"
   *  reasoning ManageInventoryComponent.allInventoryItems' own doc comment
   *  already gives for the barcode-scan duplicate check. */
  existingItemNames: string[];
}

/** Self-contained "does its own Supabase writes" modal, same shape as
 *  PlaceOrderModalComponent — downloads a CSV template, parses + validates
 *  a re-uploaded file client-side (shows a preview naming which rows have
 *  blocking errors and will be skipped, vs. non-blocking warnings), then
 *  bulk-creates the valid rows. A row whose Name exactly matches (case-
 *  insensitively) an existing item, or another row in the same file, is
 *  rejected as a likely duplicate rather than silently creating a second
 *  entry — see parseAndValidateImportRows()'s own doc comment. No photos
 *  and no container/box breakdown —
 *  every imported item is flat-quantity, same as the create form's default;
 *  both can be added to an item afterward. No barcode column either — this
 *  feature skips barcode entirely, not just while BARCODE_FEATURE_ENABLED is
 *  off, since nothing else in the UI currently surfaces it for import to
 *  carry along.
 *
 *  Unlike PlaceOrderModalComponent, this stays open on a "done" step after
 *  the write instead of immediately closing — a bulk import can have real
 *  partial-outcome detail (skipped/failed rows) worth letting someone
 *  actually review before the dialog disappears, which a single order never
 *  has. */
@Component({
  selector: 'app-import-inventory-modal',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  templateUrl: './import-inventory-modal.component.html',
  styleUrl: './import-inventory-modal.component.scss',
})
export class ImportInventoryModalComponent {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private router = inject(Router);
  // Already loaded page-wide by ManageInventoryComponent.ngOnInit() (same
  // supplierService.load() call the create form's own supplier dropdown
  // relies on) — read directly rather than via MAT_DIALOG_DATA, since this
  // is a root-provided signal-backed service, not a page-specific value.
  protected supplierService = inject(SupplierService);
  // Page-specific, unlike suppliers above — ManageInventoryComponent's own
  // allInventoryItems is plain component state, not a shared service, so
  // this one does need to come through MAT_DIALOG_DATA.
  private data = inject<ImportInventoryModalData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<ImportInventoryModalComponent, boolean>);

  step: 'upload' | 'preview' | 'done' = 'upload';
  fileError: string | null = null;
  rows: ParsedImportRow[] = [];

  isImporting = false;
  succeededCount = 0;
  failedRows: FailedImportRow[] = [];

  get validRows(): ParsedImportRow[] {
    return this.rows.filter(row => row.errors.length === 0);
  }

  get invalidRowCount(): number {
    return this.rows.length - this.validRows.length;
  }

  downloadTemplate() {
    downloadCsv('shelfsync-inventory-import-template.csv', buildInventoryImportTemplateCsv());
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    this.fileError = null;

    let text: string;
    try {
      text = await file.text();
    } catch {
      this.fileError = 'Could not read that file.';
      return;
    }

    const { rows, headerError } = parseAndValidateImportRows(text, this.supplierService.suppliers(), this.data.existingItemNames);
    if (headerError) {
      this.fileError = headerError;
      return;
    }
    if (rows.length === 0) {
      this.fileError = 'That file has no rows to import.';
      return;
    }

    this.rows = rows;
    this.step = 'preview';
  }

  backToUpload() {
    this.rows = [];
    this.fileError = null;
    this.step = 'upload';
  }

  async startImport() {
    if (this.isImporting) {
      return;
    }
    const valid = this.validRows;
    if (valid.length === 0) {
      return;
    }

    this.isImporting = true;
    this.succeededCount = 0;
    this.failedRows = [];

    for (let i = 0; i < valid.length; i += IMPORT_BATCH_SIZE) {
      const batch = valid.slice(i, i + IMPORT_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(row => this.supabase.from('inventory_items').insert(buildImportInsertPayload(row)))
      );
      results.forEach((result, index) => {
        const row = batch[index];
        if (result.error) {
          this.failedRows.push({ rowNumber: row.rowNumber, name: row.name, reason: result.error.message });
        } else {
          this.succeededCount++;
        }
      });
    }

    if (this.succeededCount > 0) {
      const summary = `Imported ${this.succeededCount} item${this.succeededCount === 1 ? '' : 's'}`;
      // Best-effort, same as every other post-write activity log call in
      // this app — the items themselves already committed, so a logging
      // failure here shouldn't be surfaced as the import having failed. One
      // summary entry rather than one per item (entity_id: null — the
      // column has no FK, see activity_log's own migration comment).
      const session = await this.authService.getSession();
      if (session) {
        await logActivity(this.supabase, session.user.id, 'inventory_item', null, `${summary} via CSV`);
      }
      this.notification.success(summary);
    }

    this.isImporting = false;
    this.step = 'done';
  }

  cancel() {
    this.dialogRef.close();
  }

  close() {
    this.dialogRef.close(this.succeededCount > 0);
  }

  /** The "done" step's CTA — closes with the same result close() would,
   *  then navigates to the full Inventory page so whoever just imported can
   *  actually see the new items land (rather than just trusting the "N
   *  imported" text). Explicit close() + navigate() rather than a plain
   *  [routerLink] relying on MatDialogConfig's default closeOnNavigation —
   *  keeps this directly unit-testable and doesn't leave the parent page's
   *  afterClosed() reload depending on an inferred library default. */
  viewInventory() {
    this.dialogRef.close(this.succeededCount > 0);
    void this.router.navigate(['/inventory']);
  }
}
