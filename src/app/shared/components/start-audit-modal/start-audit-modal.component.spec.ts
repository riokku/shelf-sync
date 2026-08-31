import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { StartAuditModalComponent } from './start-audit-modal.component';
import { SupabaseService } from '../../../core/supabase.service';
import { InventoryFieldOptionsService } from '../../../core/inventory-field-options.service';
import {
  createFakeInventoryFieldOptionsService,
  createFakeMatDialogRef,
  createFakeSupabaseService
} from '../../../testing/fakes';

describe('StartAuditModalComponent', () => {
  let component: StartAuditModalComponent;
  let fixture: ComponentFixture<StartAuditModalComponent>;
  let dialogRef: MatDialogRef<StartAuditModalComponent>;

  async function setup(options: { data?: unknown; error?: { message: string } | null } = {}) {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<StartAuditModalComponent>;

    await TestBed.configureTestingModule({
      imports: [StartAuditModalComponent],
      providers: [
        {
          provide: SupabaseService,
          useValue: createFakeSupabaseService({ data: options.data ?? 'audit-1', error: options.error ?? null })
        },
        {
          provide: InventoryFieldOptionsService,
          useValue: createFakeInventoryFieldOptionsService({ physical_location: ['Warehouse A', 'Warehouse B'] })
        },
        { provide: MatDialogRef, useValue: dialogRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StartAuditModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  describe('save()', () => {
    it('starts the audit and closes with the new audit id on success', async () => {
      await setup({ data: 'audit-42' });
      const closeSpy = spyOn(dialogRef, 'close');

      await component.save();

      expect(component.error).toBeNull();
      expect(closeSpy).toHaveBeenCalledWith('audit-42');
    });

    it('surfaces an RPC error rather than closing the dialog', async () => {
      await setup({ error: { message: 'no items found in scope for this audit' } });
      const closeSpy = spyOn(dialogRef, 'close');

      await component.save();

      expect(component.error).toBe('no items found in scope for this audit');
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('is a no-op while already saving', async () => {
      await setup();
      component.isSaving = true;
      const closeSpy = spyOn(dialogRef, 'close');

      await component.save();

      expect(closeSpy).not.toHaveBeenCalled();
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
});
