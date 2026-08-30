import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StudioEmailLogComponent } from './studio-email-log.component';
import { SupabaseService } from '../../core/supabase.service';
import { createFakeSupabaseService } from '../../testing/fakes';
import { Database } from '../../shared/models/database.types';

type EmailLogRow = Database['public']['Tables']['notification_email_log']['Row'];

function createTestEmailRow(overrides: Partial<EmailLogRow> = {}): EmailLogRow {
  return {
    id: 'email-1',
    kind: 'task_assigned',
    recipient_email: 'person@example.com',
    organization_id: 'org-1',
    success: true,
    error_message: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('StudioEmailLogComponent', () => {
  let component: StudioEmailLogComponent;
  let fixture: ComponentFixture<StudioEmailLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudioEmailLogComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StudioEmailLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('filteredEmailLog', () => {
    beforeEach(() => {
      component.emailLog = [
        createTestEmailRow({ id: 'ok-1', success: true }),
        createTestEmailRow({ id: 'fail-1', success: false })
      ];
    });

    it('shows only failed sends by default', () => {
      expect(component.filteredEmailLog.map(row => row.id)).toEqual(['fail-1']);
    });

    it('includes successful sends once toggled on', () => {
      component.showSuccessfulSends = true;
      expect(component.filteredEmailLog.map(row => row.id)).toEqual(['ok-1', 'fail-1']);
    });
  });

  describe('pagedEmailLog', () => {
    it('returns only the first page', () => {
      component.emailLog = Array.from({ length: 20 }, (_, i) => createTestEmailRow({ id: `fail-${i}`, success: false }));
      expect(component.pagedEmailLog.length).toBe(component.pageSize);
      expect(component.pagedEmailLog[0].id).toBe('fail-0');
    });

    it('resets to the first page when the filter changes', () => {
      component.pageIndex = 2;
      component.onFilterChange();
      expect(component.pageIndex).toBe(0);
    });
  });

  describe('kindLabel', () => {
    it('maps a known kind to its human label', () => {
      expect(component.kindLabel(createTestEmailRow({ kind: 'retirement_request' }))).toBe('Retirement request');
    });

    it('falls back to the raw kind for an unrecognized value', () => {
      expect(component.kindLabel(createTestEmailRow({ kind: 'something_new' }))).toBe('something_new');
    });
  });

  describe('orgName', () => {
    it('reports an unknown organization when there is no organization_id at all', () => {
      expect(component.orgName(createTestEmailRow({ organization_id: null }))).toBe('Unknown organization');
    });
  });
});

/** Table-aware fake, same shape StudioOrganizationsComponent's own spec
 *  uses — organizations told apart from notification_email_log. */
function createFakeSupabaseServiceForEmailLog(data: {
  rows?: EmailLogRow[];
  orgs?: { id: string; name: string }[];
  loadError?: { message: string } | null;
}): SupabaseService {
  function builder(result: { data: unknown; error: unknown }) {
    const b: Record<string, unknown> = { then: (resolve: (value: typeof result) => void) => resolve(result) };
    for (const method of ['select', 'order', 'limit']) {
      b[method] = () => b;
    }
    return b;
  }

  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'organizations') {
          return builder({ data: data.orgs ?? [], error: null });
        }
        return builder({ data: data.rows ?? [], error: data.loadError ?? null });
      }
    }
  };
  return fake as unknown as SupabaseService;
}

describe('StudioEmailLogComponent loading', () => {
  async function createComponent(data: Parameters<typeof createFakeSupabaseServiceForEmailLog>[0] = {}) {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [StudioEmailLogComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForEmailLog(data) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(StudioEmailLogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('resolves each row\'s organization name from the org id', async () => {
    const component = await createComponent({
      rows: [createTestEmailRow({ organization_id: 'org-1' })],
      orgs: [{ id: 'org-1', name: 'Acme Events' }]
    });

    expect(component.orgName(component.emailLog[0])).toBe('Acme Events');
  });

  it('surfaces a failed load rather than an empty log', async () => {
    const component = await createComponent({ loadError: { message: 'network error' } });

    expect(component.loadError).toBe('network error');
    expect(component.emailLog).toEqual([]);
  });
});
