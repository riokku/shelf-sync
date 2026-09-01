import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { StudioReleaseNotesComponent } from './studio-release-notes.component';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { ReleaseNoteFormModalComponent } from '../../shared/components/release-note-form-modal/release-note-form-modal.component';
import { createFakeAuthService, createFakeProfile, createFakeSupabaseService } from '../../testing/fakes';
import { ReleaseNote } from '../../shared/models/release-note.model';
import { getUnseenChangelogCount } from '../../shared/utils/changelog';

function createTestReleaseNoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    title: 'Existing entry',
    description: 'Existing description',
    severity: 'standard',
    posted_at: '2026-09-01',
    created_by: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

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

function createFakeDialogRef(result: unknown): MatDialogRef<unknown> {
  return { afterClosed: () => of(result) } as unknown as MatDialogRef<unknown>;
}

describe('StudioReleaseNotesComponent', () => {
  let component: StudioReleaseNotesComponent;
  let fixture: ComponentFixture<StudioReleaseNotesComponent>;

  async function setup(options: { error?: { message: string } | null; rows?: unknown[] } = {}) {
    await TestBed.configureTestingModule({
      imports: [StudioReleaseNotesComponent],
      providers: [
        provideRouter([]),
        {
          provide: SupabaseService,
          useValue: createFakeSupabaseService({ data: options.rows ?? [createTestReleaseNoteRow()], error: options.error ?? null })
        },
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ id: 'user-1', is_platform_admin: true })) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StudioReleaseNotesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      // Same "best effort" reasoning this app's own storage access has.
    }
  });

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('loads and maps release notes from the DB row shape', async () => {
    await setup({ rows: [createTestReleaseNoteRow({ id: 'note-2', severity: 'critical' })] });
    expect(component.releaseNotes.length).toBe(1);
    expect(component.releaseNotes[0].id).toBe('note-2');
    expect(component.releaseNotes[0].severity).toBe('critical');
  });

  it('shows the empty state when there are no release notes yet', async () => {
    await setup({ rows: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No release notes yet');
  });

  it('sets loadError instead of silently rendering an empty list when the query fails', async () => {
    await setup({ error: { message: 'Network error' } });
    fixture.detectChanges();

    expect(component.loadError).toBe('Network error');
    expect(component.releaseNotes).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Couldn\'t load release notes. Network error');
  });

  it('retryLoad() clears loadError on a successful retry', async () => {
    await setup({ error: { message: 'Network error' } });
    expect(component.loadError).toBe('Network error');

    (component as unknown as { supabase: SupabaseService['client'] }).supabase =
      createFakeSupabaseService({ data: [createTestReleaseNoteRow()], error: null }).client;

    component.retryLoad();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.loadError).toBeNull();
  });

  it('marks the changelog seen for the signed-in user, up through the newest loaded entry', async () => {
    localStorage.setItem('shelf-sync:changelog-last-seen:user-1', '2000-01-01');
    await setup({ rows: [createTestReleaseNoteRow({ posted_at: '2026-09-24' })] });

    const supabase = createFakeSupabaseService({ data: [{ posted_at: '2026-09-24' }], error: null }).client;
    await expectAsync(getUnseenChangelogCount(supabase, 'user-1')).toBeResolvedTo(0);
  });

  describe('newReleaseNote()', () => {
    it('opens the form modal with no release note in its data (create mode)', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));

      component.newReleaseNote();

      expect(openSpy).toHaveBeenCalledWith(ReleaseNoteFormModalComponent, jasmine.objectContaining({
        data: jasmine.objectContaining({ releaseNote: undefined })
      }));
    });

    it('reloads and toasts "Release note posted" on a truthy close', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      component.newReleaseNote();
      await fixture.whenStable();

      expect(successSpy).toHaveBeenCalledWith('Release note posted');
    });
  });

  describe('editReleaseNote()', () => {
    it('opens the form modal with the release note in its data, and toasts "Release note updated" on save', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      const releaseNote = createTestReleaseNote();
      const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      component.editReleaseNote(releaseNote);
      await fixture.whenStable();

      expect(openSpy).toHaveBeenCalledWith(ReleaseNoteFormModalComponent, jasmine.objectContaining({
        data: jasmine.objectContaining({ releaseNote })
      }));
      expect(successSpy).toHaveBeenCalledWith('Release note updated');
    });
  });

  describe('removeReleaseNote()', () => {
    it('deletes and toasts on confirmation', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      component.removeReleaseNote(createTestReleaseNote());
      // A real macrotask flush (rather than counting microtask hops) —
      // removeReleaseNote()'s dialogRef.afterClosed() subscribe callback
      // chains multiple awaits against the fake Supabase client's own plain
      // thenables (see testing/fakes.ts's own createFakeQueryBuilder),
      // which whenStable() alone doesn't reliably wait all the way through
      // — same reasoning BroadcastsComponent's own identical test gives.
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(component.deleteError).toBeNull();
      expect(successSpy).toHaveBeenCalledWith('Release note deleted');
    });

    it('does nothing when the confirmation is dismissed', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(false));
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      component.removeReleaseNote(createTestReleaseNote());
      await fixture.whenStable();

      expect(successSpy).not.toHaveBeenCalled();
    });

    it('surfaces a delete failure inline', async () => {
      await setup({ error: { message: 'delete failed' } });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));

      component.removeReleaseNote(createTestReleaseNote());
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(component.deleteError).toBe('delete failed');
    });
  });
});
