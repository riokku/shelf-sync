import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { OrgDetailModalComponent, OrgDetailModalData } from './org-detail-modal.component';
import { SupabaseService } from '../../../core/supabase.service';
import { Profile } from '../../../core/auth.service';
import { Database } from '../../../shared/models/database.types';
import { createFakeMatDialogRef, createFakeQueryBuilder } from '../../../testing/fakes';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
type FeedbackRow = Database['public']['Tables']['feedback']['Row'];
type ClientErrorLogRow = Database['public']['Tables']['client_error_log']['Row'];

function createTestOrg(overrides: Partial<OrganizationRow> = {}): OrganizationRow {
  return {
    id: 'org-1',
    name: 'Acme Events',
    slug: 'acme-events',
    created_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function createTestProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-1',
    organization_id: 'org-1',
    email: 'staffer@example.com',
    full_name: 'Staffer One',
    nickname: null,
    avatar_key: null,
    role: 'staff',
    membership_status: 'approved',
    is_platform_admin: false,
    last_active_at: null,
    quick_menu_enabled: false,
    quick_menu_items: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Profile;
}

function createTestFeedback(overrides: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    id: 'feedback-1',
    organization_id: 'org-1',
    user_id: null,
    type: 'bug',
    status: 'new',
    message: 'Something broke',
    reviewed_at: null,
    reviewed_by: null,
    created_at: '2026-01-05T00:00:00.000Z',
    ...overrides,
  };
}

function createTestErrorLog(overrides: Partial<ClientErrorLogRow> = {}): ClientErrorLogRow {
  return {
    id: 'error-1',
    organization_id: 'org-1',
    user_id: null,
    app_env: 'production',
    message: 'Unexpected token',
    stack: null,
    url: null,
    user_agent: null,
    created_at: '2026-01-06T00:00:00.000Z',
    ...overrides,
  };
}

function createFakeSupabaseServiceForOrgDetail(data: {
  members?: Profile[];
  feedback?: FeedbackRow[];
  errors?: ClientErrorLogRow[];
}): SupabaseService {
  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'profiles') {
          return createFakeQueryBuilder({ data: data.members ?? [], error: null });
        }
        if (table === 'feedback') {
          return createFakeQueryBuilder({ data: data.feedback ?? [], error: null });
        }
        return createFakeQueryBuilder({ data: data.errors ?? [], error: null });
      }
    }
  };
  return fake as unknown as SupabaseService;
}

describe('OrgDetailModalComponent', () => {
  let component: OrgDetailModalComponent;
  let fixture: ComponentFixture<OrgDetailModalComponent>;

  async function setup(
    data: OrgDetailModalData,
    supabaseData: Parameters<typeof createFakeSupabaseServiceForOrgDetail>[0] = {}
  ) {
    await TestBed.configureTestingModule({
      imports: [OrgDetailModalComponent],
      providers: [
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForOrgDetail(supabaseData) },
        { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(OrgDetailModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await setup({ organization: createTestOrg() });
    expect(component).toBeTruthy();
  });

  it('loads members/feedback/errors scoped to the given org and stops loading', async () => {
    await setup(
      { organization: createTestOrg({ id: 'org-1' }) },
      {
        members: [createTestProfile({ id: 'm-1' })],
        feedback: [createTestFeedback({ id: 'f-1' })],
        errors: [createTestErrorLog({ id: 'e-1' })]
      }
    );

    expect(component.isLoading).toBeFalse();
    expect(component.members.length).toBe(1);
    expect(component.recentFeedback.length).toBe(1);
    expect(component.recentErrors.length).toBe(1);
  });

  it('breaks down members into admin/approved/pending counts', async () => {
    await setup(
      { organization: createTestOrg() },
      {
        members: [
          createTestProfile({ id: 'm-1', role: 'admin', membership_status: 'approved' }),
          createTestProfile({ id: 'm-2', role: 'staff', membership_status: 'approved' }),
          createTestProfile({ id: 'm-3', role: 'staff', membership_status: 'pending' })
        ]
      }
    );

    expect(component.adminCount).toBe(1);
    expect(component.approvedCount).toBe(2);
    expect(component.pendingCount).toBe(1);
  });

  it('close() closes the dialog', async () => {
    await setup({ organization: createTestOrg() });
    const closeSpy = spyOn(component.dialogRef, 'close');

    component.close();

    expect(closeSpy).toHaveBeenCalled();
  });
});
