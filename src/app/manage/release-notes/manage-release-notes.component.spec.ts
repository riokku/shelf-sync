import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ManageReleaseNotesComponent } from './manage-release-notes.component';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { createFakeAuthService, createFakeProfile, createFakeSupabaseService } from '../../testing/fakes';
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

describe('ManageReleaseNotesComponent', () => {
  let component: ManageReleaseNotesComponent;
  let fixture: ComponentFixture<ManageReleaseNotesComponent>;

  async function setup(options: { error?: { message: string } | null; rows?: unknown[] } = {}) {
    await TestBed.configureTestingModule({
      imports: [ManageReleaseNotesComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ id: 'user-1' })) },
        {
          provide: SupabaseService,
          useValue: createFakeSupabaseService({ data: options.rows ?? [createTestReleaseNoteRow()], error: options.error ?? null })
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageReleaseNotesComponent);
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
    await setup({ rows: [createTestReleaseNoteRow({ id: 'note-2', severity: 'emphasized' })] });
    expect(component.releaseNotes.length).toBe(1);
    expect(component.releaseNotes[0].id).toBe('note-2');
    expect(component.releaseNotes[0].severity).toBe('emphasized');
  });

  it('shows an empty state when nothing has been posted yet', async () => {
    await setup({ rows: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Nothing posted yet.');
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

  it('marks the changelog seen for the signed-in user on init', async () => {
    localStorage.setItem('shelf-sync:changelog-last-seen:user-1', '2000-01-01');
    await setup({ rows: [createTestReleaseNoteRow({ posted_at: '2026-09-24' })] });

    const supabase = createFakeSupabaseService({ data: [{ posted_at: '2026-09-24' }], error: null }).client;
    await expectAsync(getUnseenChangelogCount(supabase, 'user-1')).toBeResolvedTo(0);
  });
});
