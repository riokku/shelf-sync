import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { of } from 'rxjs';

import { OrgDetailModalComponent, OrgDetailModalData } from './org-detail-modal.component';
import { SupabaseService } from '../../../core/supabase.service';
import { NotificationService } from '../../../core/notification.service';
import { Profile } from '../../../core/auth.service';
import { Database } from '../../../shared/models/database.types';
import { createFakeMatDialogRef, createFakeQueryBuilder } from '../../../testing/fakes';

function createFakeDialogRef(result: unknown): MatDialogRef<unknown> {
  return { afterClosed: () => of(result) } as unknown as MatDialogRef<unknown>;
}

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
    suspended_at: null,
    suspended_by: null,
    suspension_reason: null,
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
  /** The org's suspended_by profile, if any — returned on the *second*
   *  call to from('profiles') (the first is always the members list load;
   *  suspendedByName's own lookup, when it happens, always comes after). */
  suspender?: Profile | null;
  rpc?: jasmine.Spy;
}): SupabaseService {
  let profilesCallCount = 0;
  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'profiles') {
          profilesCallCount += 1;
          if (profilesCallCount === 1) {
            return createFakeQueryBuilder({ data: data.members ?? [], error: null });
          }
          return createFakeQueryBuilder({ data: data.suspender ?? null, error: null });
        }
        if (table === 'feedback') {
          return createFakeQueryBuilder({ data: data.feedback ?? [], error: null });
        }
        return createFakeQueryBuilder({ data: data.errors ?? [], error: null });
      },
      rpc: data.rpc ?? jasmine.createSpy('rpc').and.resolveTo({ error: null })
    }
  };
  return fake as unknown as SupabaseService;
}

describe('OrgDetailModalComponent', () => {
  let component: OrgDetailModalComponent;
  let fixture: ComponentFixture<OrgDetailModalComponent>;
  let supabaseService: SupabaseService;

  async function setup(
    data: OrgDetailModalData,
    supabaseData: Parameters<typeof createFakeSupabaseServiceForOrgDetail>[0] = {}
  ) {
    supabaseService = createFakeSupabaseServiceForOrgDetail(supabaseData);

    await TestBed.configureTestingModule({
      imports: [OrgDetailModalComponent],
      providers: [
        { provide: SupabaseService, useValue: supabaseService },
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

  it('resolves suspendedByName from a second profiles lookup when suspended_by is set', async () => {
    await setup(
      { organization: createTestOrg({ suspended_at: '2026-02-01T00:00:00.000Z', suspended_by: 'admin-1', suspension_reason: 'Non-payment' }) },
      { suspender: createTestProfile({ id: 'admin-1', full_name: 'Riley Platform' }) }
    );

    expect(component.suspendedByName).toBe('Riley Platform');
    expect(component.isSuspended).toBeTrue();
  });

  describe('suspendOrganization()', () => {
    it('does nothing when the modal is dismissed without a reason', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: null });
      await setup({ organization: createTestOrg() }, { rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));

      component.suspendOrganization();
      await fixture.whenStable();

      expect(rpc).not.toHaveBeenCalled();
    });

    it('calls platform_suspend_organization and updates the org in place on success', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: null });
      await setup({ organization: createTestOrg() }, { rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef('Repeated abuse'));
      const successSpy = spyOn(TestBed.inject(NotificationService), 'success');

      component.suspendOrganization();
      await fixture.whenStable();

      expect(rpc).toHaveBeenCalledWith('platform_suspend_organization', { org_id: 'org-1', reason: 'Repeated abuse' });
      expect(component.organization.suspended_at).toBeTruthy();
      expect(component.organization.suspension_reason).toBe('Repeated abuse');
      expect(successSpy).toHaveBeenCalled();
    });

    it('surfaces an RPC error inline rather than mutating the org', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: { message: 'not a platform admin' } });
      await setup({ organization: createTestOrg() }, { rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef('Reason'));

      component.suspendOrganization();
      await fixture.whenStable();

      expect(component.actionError).toBe('not a platform admin');
      expect(component.organization.suspended_at).toBeNull();
    });
  });

  describe('unsuspendOrganization()', () => {
    it('calls platform_unsuspend_organization and clears suspension fields on confirm', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: null });
      await setup(
        { organization: createTestOrg({ suspended_at: '2026-02-01T00:00:00.000Z', suspended_by: 'admin-1', suspension_reason: 'Non-payment' }) },
        { rpc }
      );
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));

      component.unsuspendOrganization();
      await fixture.whenStable();

      expect(rpc).toHaveBeenCalledWith('platform_unsuspend_organization', { org_id: 'org-1' });
      expect(component.organization.suspended_at).toBeNull();
      expect(component.isSuspended).toBeFalse();
    });

    it('does nothing when not confirmed', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: null });
      await setup({ organization: createTestOrg({ suspended_at: '2026-02-01T00:00:00.000Z' }) }, { rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(false));

      component.unsuspendOrganization();
      await fixture.whenStable();

      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe('retireOrganization()', () => {
    it('calls platform_retire_organization and sets deleted_at on confirm', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: null });
      await setup({ organization: createTestOrg() }, { rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));

      component.retireOrganization();
      await fixture.whenStable();

      expect(rpc).toHaveBeenCalledWith('platform_retire_organization', { org_id: 'org-1' });
      expect(component.organization.deleted_at).toBeTruthy();
      expect(component.isRetired).toBeTrue();
    });
  });

  describe('restoreOrganization()', () => {
    it('calls platform_restore_organization and clears deleted_at on confirm', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: null });
      await setup({ organization: createTestOrg({ deleted_at: '2026-02-01T00:00:00.000Z' }) }, { rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));

      component.restoreOrganization();
      await fixture.whenStable();

      expect(rpc).toHaveBeenCalledWith('platform_restore_organization', { org_id: 'org-1' });
      expect(component.organization.deleted_at).toBeNull();
      expect(component.isRetired).toBeFalse();
    });
  });
});
