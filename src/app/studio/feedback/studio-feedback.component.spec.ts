import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StudioFeedbackComponent } from './studio-feedback.component';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService } from '../../core/auth.service';
import { createFakeAuthService, createFakeProfile, createFakeQueryBuilder } from '../../testing/fakes';

interface FakeFeedbackRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  type: string;
  message: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function createTestFeedbackRow(overrides: Partial<FakeFeedbackRow> = {}): FakeFeedbackRow {
  return {
    id: 'feedback-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    type: 'bug',
    message: 'The export button is broken.',
    status: 'new',
    reviewed_by: null,
    reviewed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** loadFeedback()'s own select and its profiles name-resolution query both
 *  moved onto platform_list_feedback()/platform_list_profiles() — see
 *  add_platform_cross_org_read_rpcs' own doc comment — so the only thing
 *  left going through from('feedback') at all is markStatus()'s own
 *  UPDATE, which never collides with the RPC-based load anymore (no more
 *  call-order discrimination needed on that table). 'organizations' still
 *  only needs one canned response, queried alongside the initial load. */
function createFakeSupabaseServiceForFeedback(data: {
  feedback?: FakeFeedbackRow[];
  organizations?: { id: string; name: string }[];
  profiles?: ReturnType<typeof createFakeProfile>[];
  loadError?: { message: string } | null;
  updateError?: { message: string } | null;
}): SupabaseService {
  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'organizations') {
          return createFakeQueryBuilder({ data: data.organizations ?? [], error: null });
        }
        return createFakeQueryBuilder({ data: null, error: data.updateError ?? null });
      },
      rpc: jasmine.createSpy('rpc').and.callFake((fn: string) => {
        if (fn === 'platform_list_feedback') {
          return Promise.resolve({ data: data.feedback ?? [], error: data.loadError ?? null });
        }
        return Promise.resolve({ data: data.profiles ?? [], error: null });
      })
    }
  };
  return fake as unknown as SupabaseService;
}

describe('StudioFeedbackComponent', () => {
  let component: StudioFeedbackComponent;
  let fixture: ComponentFixture<StudioFeedbackComponent>;

  async function createComponent(data: Parameters<typeof createFakeSupabaseServiceForFeedback>[0] = {}) {
    await TestBed.configureTestingModule({
      imports: [StudioFeedbackComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ id: 'admin-1', is_platform_admin: true })) },
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForFeedback(data) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StudioFeedbackComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it('resolves each row\'s org name and submitter label from the joined lookups', async () => {
    await createComponent({
      feedback: [createTestFeedbackRow({ organization_id: 'org-1', user_id: 'user-1' })],
      organizations: [{ id: 'org-1', name: 'Acme Events' }],
      profiles: [createFakeProfile({ id: 'user-1', full_name: 'Jamie Lee', email: 'jamie@example.com' })]
    });

    expect(component.feedback[0].orgName).toBe('Acme Events');
    expect(component.feedback[0].submitterLabel).toBe('Jamie Lee');
    expect(component.feedback[0].submitterEmail).toBe('jamie@example.com');
  });

  it('falls back to "Unknown organization"/"Unknown user" when a lookup misses', async () => {
    await createComponent({ feedback: [createTestFeedbackRow({ organization_id: 'org-missing', user_id: null })] });

    expect(component.feedback[0].orgName).toBe('Unknown organization');
    expect(component.feedback[0].submitterLabel).toBe('Unknown user');
  });

  it('surfaces a failed load rather than reading as an empty list', async () => {
    await createComponent({ loadError: { message: 'network error' } });

    expect(component.loadError).toBe('network error');
    expect(component.feedback).toEqual([]);
  });

  describe('filteredFeedback', () => {
    it('narrows by status', async () => {
      await createComponent({
        feedback: [
          createTestFeedbackRow({ id: 'f1', status: 'new' }),
          createTestFeedbackRow({ id: 'f2', status: 'resolved' })
        ]
      });
      component.statusFilter = 'resolved';

      expect(component.filteredFeedback.map(row => row.id)).toEqual(['f2']);
    });

    it('also matches by org name, submitter, or type label, case-insensitively', async () => {
      await createComponent({
        feedback: [createTestFeedbackRow({ type: 'feature_request', message: 'Add dark mode' })],
        organizations: [{ id: 'org-1', name: 'Acme Events' }]
      });

      component.searchTerm = 'ACME';
      expect(component.filteredFeedback.length).toBe(1);

      component.searchTerm = 'feature';
      expect(component.filteredFeedback.length).toBe(1);

      component.searchTerm = 'nothing matches this';
      expect(component.filteredFeedback.length).toBe(0);
    });
  });

  describe('markStatus()', () => {
    it('updates the row in place and records who reviewed it', async () => {
      await createComponent({
        feedback: [createTestFeedbackRow({ status: 'new' })],
        profiles: [createFakeProfile({ id: 'admin-1', full_name: 'Chris' })]
      });

      await component.markStatus(component.feedback[0], 'reviewed');

      expect(component.feedback[0].status).toBe('reviewed');
      expect(component.feedback[0].reviewed_by).toBe('admin-1');
      expect(component.feedback[0].reviewedByLabel).toBe('Chris');
      expect(component.feedback[0].reviewed_at).toBeTruthy();
    });

    it('leaves the row untouched on an update error', async () => {
      await createComponent({
        feedback: [createTestFeedbackRow({ status: 'new' })],
        updateError: { message: 'update failed' }
      });

      await component.markStatus(component.feedback[0], 'resolved');

      expect(component.feedback[0].status).toBe('new');
    });

    it('reports isUpdating() true while a status change is in flight, false once it settles', async () => {
      await createComponent({ feedback: [createTestFeedbackRow({ status: 'new' })] });
      const row = component.feedback[0];

      const pending = component.markStatus(row, 'reviewed');
      expect(component.isUpdating(row.id)).toBeTrue();
      await pending;
      expect(component.isUpdating(row.id)).toBeFalse();
    });
  });
});
