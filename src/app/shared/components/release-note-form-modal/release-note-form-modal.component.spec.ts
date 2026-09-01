import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';

import { ReleaseNoteFormModalComponent, ReleaseNoteFormModalData } from './release-note-form-modal.component';
import { SupabaseService } from '../../../core/supabase.service';
import { createFakeMatDialogRef, createFakeSupabaseService } from '../../../testing/fakes';
import { ReleaseNote } from '../../models/release-note.model';

function createTestReleaseNote(overrides: Partial<ReleaseNote> = {}): ReleaseNote {
  return {
    id: 'note-1',
    title: 'Existing entry',
    description: 'Existing description',
    severity: 'standard',
    postedAt: '2026-09-01',
    createdById: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ReleaseNoteFormModalComponent', () => {
  let component: ReleaseNoteFormModalComponent;
  let fixture: ComponentFixture<ReleaseNoteFormModalComponent>;
  let dialogRef: MatDialogRef<ReleaseNoteFormModalComponent>;

  async function setup(data: Partial<ReleaseNoteFormModalData> = {}, options: { error?: { message: string } | null } = {}) {
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<ReleaseNoteFormModalComponent>;

    await TestBed.configureTestingModule({
      imports: [ReleaseNoteFormModalComponent],
      providers: [
        provideNativeDateAdapter(),
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], error: options.error ?? null }) },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { ...data } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ReleaseNoteFormModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('is not in edit mode and starts with blank fields (severity standard, posted date today) when no entry is passed', async () => {
    await setup();
    expect(component.isEditing).toBeFalse();
    expect(component.form.controls.title.value).toBe('');
    expect(component.form.controls.description.value).toBe('');
    expect(component.form.controls.severity.value).toBe('standard');
    expect(component.form.controls.postedAt.value).not.toBeNull();
  });

  it('is in edit mode and prefills the form when a release note is passed', async () => {
    const releaseNote = createTestReleaseNote({ severity: 'critical', postedAt: '2026-08-15' });
    await setup({ releaseNote });

    expect(component.isEditing).toBeTrue();
    expect(component.form.controls.title.value).toBe('Existing entry');
    expect(component.form.controls.description.value).toBe('Existing description');
    expect(component.form.controls.severity.value).toBe('critical');
    expect(component.form.controls.postedAt.value?.getFullYear()).toBe(2026);
    expect(component.form.controls.postedAt.value?.getMonth()).toBe(7); // August, 0-indexed
    expect(component.form.controls.postedAt.value?.getDate()).toBe(15);
  });

  describe('save()', () => {
    it('does not save when the title or description is left blank', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');

      await component.save();

      expect(closeSpy).not.toHaveBeenCalled();
      expect(component.form.controls.title.hasError('required')).toBeTrue();
      expect(component.form.controls.description.hasError('required')).toBeTrue();
    });

    it('creates a new release note and closes with true on success', async () => {
      await setup();
      const closeSpy = spyOn(dialogRef, 'close');
      component.form.controls.title.setValue('New entry');
      component.form.controls.description.setValue('What changed.');

      await component.save();

      expect(component.error).toBeNull();
      expect(closeSpy).toHaveBeenCalledWith(true);
    });

    it('updates an existing release note rather than creating one when editing', async () => {
      const releaseNote = createTestReleaseNote();
      await setup({ releaseNote });
      const closeSpy = spyOn(dialogRef, 'close');
      component.form.controls.title.setValue('Updated title');

      await component.save();

      expect(component.error).toBeNull();
      expect(closeSpy).toHaveBeenCalledWith(true);
    });

    it('surfaces a save failure inline rather than closing the dialog', async () => {
      await setup({}, { error: { message: 'insert failed' } });
      const closeSpy = spyOn(dialogRef, 'close');
      component.form.controls.title.setValue('New entry');
      component.form.controls.description.setValue('What changed.');

      await component.save();

      expect(component.error).toBe('insert failed');
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
