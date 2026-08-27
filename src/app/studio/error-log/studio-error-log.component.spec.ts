import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StudioErrorLogComponent } from './studio-error-log.component';
import { SupabaseService } from '../../core/supabase.service';
import { createFakeSupabaseService } from '../../testing/fakes';
import { Database } from '../../shared/models/database.types';

type ClientErrorLogRow = Database['public']['Tables']['client_error_log']['Row'];

function createTestErrorRow(overrides: Partial<ClientErrorLogRow> = {}): ClientErrorLogRow {
  return {
    id: 'err-1',
    user_id: null,
    organization_id: 'org-1',
    message: 'Something broke',
    stack: null,
    url: null,
    user_agent: null,
    app_env: 'production',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('StudioErrorLogComponent', () => {
  let component: StudioErrorLogComponent;
  let fixture: ComponentFixture<StudioErrorLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudioErrorLogComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudioErrorLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('filteredErrorLog', () => {
    beforeEach(() => {
      component.errorLog = [
        createTestErrorRow({ id: 'prod-1', app_env: 'production' }),
        createTestErrorRow({ id: 'dev-1', app_env: 'development' })
      ];
    });

    it('hides development errors by default', () => {
      expect(component.filteredErrorLog.map(row => row.id)).toEqual(['prod-1']);
    });

    it('includes development errors once toggled on', () => {
      component.includeDevErrors = true;
      expect(component.filteredErrorLog.map(row => row.id)).toEqual(['prod-1', 'dev-1']);
    });
  });

  describe('pagedErrorLog', () => {
    it('returns only the first page', () => {
      component.errorLog = Array.from({ length: 20 }, (_, i) => createTestErrorRow({ id: `err-${i}` }));
      expect(component.pagedErrorLog.length).toBe(component.pageSize);
      expect(component.pagedErrorLog[0].id).toBe('err-0');
    });

    it('resets to the first page when the filter changes', () => {
      component.pageIndex = 2;
      component.onFilterChange();
      expect(component.pageIndex).toBe(0);
    });
  });

  describe('reportedBy', () => {
    it('labels a pre-auth error as a signed-out visitor', () => {
      expect(component.reportedBy(createTestErrorRow({ user_id: null }))).toBe('Signed-out visitor');
    });

    it('falls back to "Former team member" when the reporting user no longer resolves to a profile', () => {
      expect(component.reportedBy(createTestErrorRow({ user_id: 'user-1' }))).toBe('Former team member');
    });
  });

  describe('orgName', () => {
    it('labels a pre-auth error (no organization_id at all) distinctly from a lookup miss', () => {
      expect(component.orgName(createTestErrorRow({ organization_id: null }))).toBe('No organization (pre-login)');
    });

    it('falls back to "Unknown organization" when organization_id doesn\'t resolve to a loaded org', () => {
      expect(component.orgName(createTestErrorRow({ organization_id: 'org-missing' }))).toBe('Unknown organization');
    });
  });
});
