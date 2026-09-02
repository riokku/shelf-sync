import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';

import { AuditScheduleFormModalComponent, AuditScheduleFormModalData } from './audit-schedule-form-modal.component';
import { SupabaseService } from '../../../core/supabase.service';
import { InventoryFieldOptionsService } from '../../../core/inventory-field-options.service';
import {
  createFakeInventoryFieldOptionsService,
  createFakeMatDialogRef,
  createFakeSupabaseService
} from '../../../testing/fakes';
import { InventoryAuditSchedule } from '../../models/inventory-audit.model';

describe('AuditScheduleFormModalComponent', () => {
  let component: AuditScheduleFormModalComponent;
  let fixture: ComponentFixture<AuditScheduleFormModalComponent>;
  let dialogRef: MatDialogRef<AuditScheduleFormModalComponent>;
  let supabase: SupabaseService;

  const schedule: InventoryAuditSchedule = {
    id: 'schedule-1',
    physicalLocation: 'Warehouse A',
    frequency: 'monthly',
    note: 'Monthly count',
    nextOccurrenceDate: '2099-01-01',
    active: true,
    createdByLabel: 'Jane Doe',
    createdAt: '2026-01-01T00:00:00Z'
  };

  async function setup(data: AuditScheduleFormModalData = {}, result: { data?: unknown; error?: { message: string } | null } = {}) {
    supabase = createFakeSupabaseService({ data: result.data ?? 'schedule-42', error: result.error ?? null });
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<AuditScheduleFormModalComponent>;

    await TestBed.configureTestingModule({
      imports: [AuditScheduleFormModalComponent],
      providers: [
        provideNativeDateAdapter(),
        { provide: SupabaseService, useValue: supabase },
        {
          provide: InventoryFieldOptionsService,
          useValue: createFakeInventoryFieldOptionsService({ physical_location: ['Warehouse A', 'Warehouse B'] })
        },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AuditScheduleFormModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('is not in edit mode and defaults to monthly with no schedule passed', async () => {
    await setup();
    expect(component.isEditing).toBeFalse();
    expect(component.form.controls.frequency.value).toBe('monthly');
  });

  it('is in edit mode and prefills the form when a schedule is passed', async () => {
    await setup({ schedule });
    expect(component.isEditing).toBeTrue();
    expect(component.form.controls.physicalLocation.value).toBe('Warehouse A');
    expect(component.form.controls.frequency.value).toBe('monthly');
    expect(component.form.controls.note.value).toBe('Monthly count');
  });

  it('requires a first-occurrence date when creating', async () => {
    await setup();
    expect(component.form.controls.firstOccurrenceDate.hasError('required')).toBeTrue();
  });

  it('does not require a first-occurrence date when editing', async () => {
    await setup({ schedule });
    expect(component.form.controls.firstOccurrenceDate.hasError('required')).toBeFalse();
  });

  describe('save()', () => {
    it('creates a schedule via create_audit_schedule and closes with true on success', async () => {
      await setup();
      const rpcSpy = spyOn(supabase.client, 'rpc').and.callThrough();
      const closeSpy = spyOn(dialogRef, 'close');

      component.form.controls.firstOccurrenceDate.setValue(new Date(2099, 0, 15));
      await component.save();

      expect(rpcSpy).toHaveBeenCalledWith(
        'create_audit_schedule',
        jasmine.objectContaining({ p_frequency: 'monthly', p_first_occurrence_date: '2099-01-15' })
      );
      expect(closeSpy).toHaveBeenCalledWith(true);
      expect(component.error).toBeNull();
    });

    it('updates an existing schedule via update_audit_schedule rather than creating one', async () => {
      await setup({ schedule });
      const rpcSpy = spyOn(supabase.client, 'rpc').and.callThrough();

      await component.save();

      expect(rpcSpy).toHaveBeenCalledWith(
        'update_audit_schedule',
        jasmine.objectContaining({ p_schedule_id: 'schedule-1', p_physical_location: 'Warehouse A' })
      );
    });

    it('does not save when required fields are missing', async () => {
      await setup();
      const rpcSpy = spyOn(supabase.client, 'rpc');

      await component.save();

      expect(rpcSpy).not.toHaveBeenCalled();
      expect(component.form.controls.firstOccurrenceDate.hasError('required')).toBeTrue();
    });

    it('surfaces an RPC error rather than closing the dialog', async () => {
      await setup({}, { error: { message: 'this schedule starts within a week and can no longer be edited' } });
      const closeSpy = spyOn(dialogRef, 'close');

      component.form.controls.firstOccurrenceDate.setValue(new Date(2099, 0, 15));
      await component.save();

      expect(component.error).toBe('this schedule starts within a week and can no longer be edited');
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
