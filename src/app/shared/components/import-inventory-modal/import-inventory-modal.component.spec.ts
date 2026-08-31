import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { ImportInventoryModalComponent } from './import-inventory-modal.component';
import { SupabaseService } from '../../../core/supabase.service';
import { AuthService } from '../../../core/auth.service';
import { NotificationService } from '../../../core/notification.service';
import { SupplierService } from '../../../core/supplier.service';
import {
  createFakeAuthService,
  createFakeMatDialogRef,
  createFakeProfile,
  createFakeSupabaseService,
  createFakeSupplierService
} from '../../../testing/fakes';

/** input.files is read-only in a real browser, so this is the standard
 *  trick to fake a file picker's change event — same shape a real
 *  <input type="file"> change event carries. */
function fakeFileSelectEvent(content: string, filename = 'import.csv'): Event {
  const file = new File([content], filename, { type: 'text/csv' });
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: [file] });
  return { target: input } as unknown as Event;
}

const VALID_CSV = 'Name,Quantity total\nFolding Chair,50\nRound Table,10';

describe('ImportInventoryModalComponent', () => {
  let component: ImportInventoryModalComponent;
  let fixture: ComponentFixture<ImportInventoryModalComponent>;
  let dialogRef: MatDialogRef<ImportInventoryModalComponent>;

  async function setup(options: { error?: { message: string } | null; existingItemNames?: string[] } = {}) {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<ImportInventoryModalComponent>;

    await TestBed.configureTestingModule({
      imports: [ImportInventoryModalComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile()) },
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], error: options.error ?? null }) },
        { provide: SupplierService, useValue: createFakeSupplierService() },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { existingItemNames: options.existingItemNames ?? [] } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ImportInventoryModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create, starting on the upload step', async () => {
    await setup();
    expect(component).toBeTruthy();
    expect(component.step).toBe('upload');
  });

  describe('onFileSelected()', () => {
    it('parses a valid file and advances to the preview step', async () => {
      await setup();

      await component.onFileSelected(fakeFileSelectEvent(VALID_CSV));

      expect(component.step).toBe('preview');
      expect(component.rows.length).toBe(2);
      expect(component.fileError).toBeNull();
    });

    it('rejects a file with no Name column and stays on the upload step', async () => {
      await setup();

      await component.onFileSelected(fakeFileSelectEvent('Quantity total\n10'));

      expect(component.step).toBe('upload');
      expect(component.fileError).toContain('doesn\'t look like the import template');
    });

    it('rejects a file with a header row but no data rows', async () => {
      await setup();

      await component.onFileSelected(fakeFileSelectEvent('Name,Quantity total\n'));

      expect(component.step).toBe('upload');
      expect(component.fileError).toBe('That file has no rows to import.');
    });

    it('does nothing when no file was actually picked', async () => {
      await setup();
      const event = { target: { files: [] } } as unknown as Event;

      await component.onFileSelected(event);

      expect(component.step).toBe('upload');
    });

    it('rejects a row whose name matches an item already in the org (passed in via dialog data)', async () => {
      await setup({ existingItemNames: ['Folding Chair'] });

      await component.onFileSelected(fakeFileSelectEvent(VALID_CSV));

      const foldingChairRow = component.rows.find(row => row.name === 'Folding Chair');
      expect(foldingChairRow?.errors).toContain('An item with this name already exists');
      expect(component.validRows.length).toBe(1);
    });
  });

  describe('validRows / invalidRowCount', () => {
    it('separates rows with blocking errors from rows ready to import', async () => {
      await setup();
      const csv = 'Name,Quantity total\nFolding Chair,50\n,10';

      await component.onFileSelected(fakeFileSelectEvent(csv));

      expect(component.validRows.length).toBe(1);
      expect(component.invalidRowCount).toBe(1);
    });
  });

  describe('startImport()', () => {
    it('inserts every valid row, toasts, logs activity, and moves to the done step', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');
      await component.onFileSelected(fakeFileSelectEvent(VALID_CSV));

      await component.startImport();

      expect(component.step).toBe('done');
      expect(component.succeededCount).toBe(2);
      expect(component.failedRows).toEqual([]);
      expect(successSpy).toHaveBeenCalledWith('Imported 2 items');
    });

    it('does nothing when there are no valid rows to import', async () => {
      await setup();
      await component.onFileSelected(fakeFileSelectEvent('Name,Quantity total\n,10'));
      expect(component.validRows.length).toBe(0);

      await component.startImport();

      expect(component.step).toBe('preview');
      expect(component.succeededCount).toBe(0);
    });

    it('tallies a per-row DB failure into failedRows rather than failing the whole import', async () => {
      await setup({ error: { message: 'insert failed' } });
      await component.onFileSelected(fakeFileSelectEvent(VALID_CSV));

      await component.startImport();

      expect(component.step).toBe('done');
      expect(component.succeededCount).toBe(0);
      expect(component.failedRows.length).toBe(2);
      expect(component.failedRows[0].reason).toBe('insert failed');
    });
  });

  describe('cancel()', () => {
    it('closes the dialog with no result', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');

      component.cancel();

      expect(closeSpy).toHaveBeenCalledWith();
    });
  });

  describe('close()', () => {
    it('closes with true once at least one item was imported', async () => {
      await setup();
      component.succeededCount = 3;
      const closeSpy = spyOn(dialogRef, 'close');

      component.close();

      expect(closeSpy).toHaveBeenCalledWith(true);
    });

    it('closes with false when nothing was imported', async () => {
      await setup();
      component.succeededCount = 0;
      const closeSpy = spyOn(dialogRef, 'close');

      component.close();

      expect(closeSpy).toHaveBeenCalledWith(false);
    });
  });

  describe('viewInventory()', () => {
    it('closes the dialog and navigates to /inventory', async () => {
      await setup();
      component.succeededCount = 2;
      const closeSpy = spyOn(dialogRef, 'close');
      const router = TestBed.inject(Router);
      const navigateSpy = spyOn(router, 'navigate');

      component.viewInventory();

      expect(closeSpy).toHaveBeenCalledWith(true);
      expect(navigateSpy).toHaveBeenCalledWith(['/inventory']);
    });
  });
});
