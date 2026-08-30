import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { StudioOrgDetailComponent } from './studio-org-detail.component';
import { SupabaseService } from '../../../core/supabase.service';
import { NotificationService } from '../../../core/notification.service';
import { SiteSettingsService } from '../../../core/site-settings.service';
import { Profile } from '../../../core/auth.service';
import { Database } from '../../../shared/models/database.types';
import { createFakeActivatedRoute, createFakeQueryBuilder, createFakeSiteSettingsService } from '../../../testing/fakes';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
type FeedbackRow = Database['public']['Tables']['feedback']['Row'];
type ClientErrorLogRow = Database['public']['Tables']['client_error_log']['Row'];
type PlatformActionLogRow = Database['public']['Tables']['platform_action_log']['Row'];

function createFakeDialogRef(result: unknown): MatDialogRef<unknown> {
  return { afterClosed: () => of(result) } as unknown as MatDialogRef<unknown>;
}

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
    account_locked_at: null,
    account_locked_by: null,
    account_locked_reason: null,
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

function createTestAction(overrides: Partial<PlatformActionLogRow> = {}): PlatformActionLogRow {
  return {
    id: 'action-1',
    actor_id: 'admin-1',
    action: 'suspend',
    target_type: 'organization',
    target_id: 'org-1',
    target_label: 'Acme Events',
    reason: 'Non-payment',
    created_at: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function createFakeSupabaseServiceForOrgDetail(data: {
  organization?: OrganizationRow | null;
  organizationError?: { message: string } | null;
  members?: Profile[];
  feedback?: FeedbackRow[];
  errors?: ClientErrorLogRow[];
  suspender?: Profile | null;
  platformActions?: PlatformActionLogRow[];
  actionActors?: Profile[];
  rpc?: jasmine.Spy;
}): SupabaseService {
  let profilesCallCount = 0;
  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'organizations') {
          return createFakeQueryBuilder({ data: data.organization ?? null, error: data.organizationError ?? null });
        }
        if (table === 'profiles') {
          profilesCallCount += 1;
          if (profilesCallCount === 1) {
            return createFakeQueryBuilder({ data: data.members ?? [], error: null });
          }
          // Second (and any later) profiles call is either the single
          // suspender lookup (.maybeSingle()) or the actor-name lookup
          // (.in(), an array) — a given test scenario only ever exercises
          // one of the two, so returning whichever was actually configured
          // for this test is enough.
          if (data.actionActors) {
            return createFakeQueryBuilder({ data: data.actionActors, error: null });
          }
          return createFakeQueryBuilder({ data: data.suspender ?? null, error: null });
        }
        if (table === 'feedback') {
          return createFakeQueryBuilder({ data: data.feedback ?? [], error: null });
        }
        if (table === 'platform_action_log') {
          return createFakeQueryBuilder({ data: data.platformActions ?? [], error: null });
        }
        return createFakeQueryBuilder({ data: data.errors ?? [], error: null });
      },
      rpc: data.rpc ?? jasmine.createSpy('rpc').and.resolveTo({ error: null })
    }
  };
  return fake as unknown as SupabaseService;
}

describe('StudioOrgDetailComponent', () => {
  let component: StudioOrgDetailComponent;
  let fixture: ComponentFixture<StudioOrgDetailComponent>;

  async function setup(
    id: string | null,
    supabaseData: Parameters<typeof createFakeSupabaseServiceForOrgDetail>[0] = {},
    orgLogoUrl: string | null = null
  ) {
    const siteSettings = createFakeSiteSettingsService();
    spyOn(siteSettings, 'loadLogoUrlForOrganization').and.resolveTo(orgLogoUrl);

    await TestBed.configureTestingModule({
      imports: [StudioOrgDetailComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForOrgDetail(supabaseData) },
        { provide: SiteSettingsService, useValue: siteSettings },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute({}, id ? { id } : {}) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StudioOrgDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await setup('org-1', { organization: createTestOrg() });
    expect(component).toBeTruthy();
  });

  it('loads the organization plus members/feedback/errors scoped to it', async () => {
    await setup('org-1', {
      organization: createTestOrg({ id: 'org-1' }),
      members: [createTestProfile({ id: 'm-1' })],
      feedback: [createTestFeedback({ id: 'f-1' })],
      errors: [createTestErrorLog({ id: 'e-1' })]
    });

    expect(component.isLoading).toBeFalse();
    expect(component.organization?.id).toBe('org-1');
    expect(component.members.length).toBe(1);
    expect(component.recentFeedback.length).toBe(1);
    expect(component.recentErrors.length).toBe(1);
  });

  it('resolves the org\'s own logo via SiteSettingsService, scoped by this org\'s id', async () => {
    await setup('org-1', { organization: createTestOrg({ id: 'org-1' }) }, 'https://example.com/logo.png');

    expect(TestBed.inject(SiteSettingsService).loadLogoUrlForOrganization).toHaveBeenCalledWith('org-1');
    expect(component.orgLogoUrl).toBe('https://example.com/logo.png');
  });

  it('leaves orgLogoUrl null when the org has no custom logo', async () => {
    await setup('org-1', { organization: createTestOrg() });

    expect(component.orgLogoUrl).toBeNull();
  });

  it('breaks down members into admin/approved/pending counts', async () => {
    await setup('org-1', {
      organization: createTestOrg(),
      members: [
        createTestProfile({ id: 'm-1', role: 'admin', membership_status: 'approved' }),
        createTestProfile({ id: 'm-2', role: 'staff', membership_status: 'approved' }),
        createTestProfile({ id: 'm-3', role: 'staff', membership_status: 'pending' })
      ]
    });

    expect(component.adminCount).toBe(1);
    expect(component.approvedCount).toBe(2);
    expect(component.pendingCount).toBe(1);
  });

  it('resolves suspendedByName from a second profiles lookup when suspended_by is set', async () => {
    await setup('org-1', {
      organization: createTestOrg({ suspended_at: '2026-02-01T00:00:00.000Z', suspended_by: 'admin-1', suspension_reason: 'Non-payment' }),
      suspender: createTestProfile({ id: 'admin-1', full_name: 'Riley Platform' })
    });

    expect(component.suspendedByName).toBe('Riley Platform');
    expect(component.isSuspended).toBeTrue();
  });

  it('loads recent platform actions scoped to this organization and resolves each actor\'s name', async () => {
    await setup('org-1', {
      organization: createTestOrg(),
      platformActions: [createTestAction({ actor_id: 'admin-1' })],
      actionActors: [createTestProfile({ id: 'admin-1', full_name: 'Riley Platform' })]
    });

    expect(component.recentActions.length).toBe(1);
    expect(component.actionActorName(component.recentActions[0])).toBe('Riley Platform');
    expect(component.actionLabel(component.recentActions[0])).toBe('Suspended');
  });

  it('falls back to "Former platform admin" when an action has no actor at all', async () => {
    await setup('org-1', {
      organization: createTestOrg(),
      platformActions: [createTestAction({ actor_id: null })]
    });

    expect(component.actionActorName(component.recentActions[0])).toBe('Former platform admin');
  });

  it('surfaces a failed load rather than reading as not found', async () => {
    await setup('org-1', { organizationError: { message: 'network error' } });

    expect(component.loadError).toBe('network error');
    expect(component.notFound).toBeFalse();
  });

  it('flags notFound when no row matches the id', async () => {
    await setup('missing-org', { organization: null });

    expect(component.notFound).toBeTrue();
    expect(component.loadError).toBeNull();
  });

  it('flags notFound immediately when there is no id param at all', async () => {
    await setup(null);

    expect(component.notFound).toBeTrue();
    expect(component.isLoading).toBeFalse();
  });

  describe('openUser()', () => {
    it('navigates to the member\'s own detail page', async () => {
      await setup('org-1', { organization: createTestOrg(), members: [createTestProfile({ id: 'm-1' })] });
      const navigateSpy = spyOn(TestBed.inject(Router), 'navigate');

      component.openUser(component.members[0]);

      expect(navigateSpy).toHaveBeenCalledWith(['/studio/users', 'm-1']);
    });
  });

  describe('suspendOrganization()', () => {
    it('calls platform_suspend_organization and updates the org in place on success', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: null });
      await setup('org-1', { organization: createTestOrg(), rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef('Repeated abuse'));
      const successSpy = spyOn(TestBed.inject(NotificationService), 'success');

      component.suspendOrganization();
      await fixture.whenStable();

      expect(rpc).toHaveBeenCalledWith('platform_suspend_organization', { org_id: 'org-1', reason: 'Repeated abuse' });
      expect(component.organization?.suspended_at).toBeTruthy();
      expect(component.organization?.suspension_reason).toBe('Repeated abuse');
      expect(successSpy).toHaveBeenCalled();
    });

    it('surfaces an RPC error inline rather than mutating the org', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: { message: 'not a platform admin' } });
      await setup('org-1', { organization: createTestOrg(), rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef('Reason'));

      component.suspendOrganization();
      await fixture.whenStable();

      expect(component.actionError).toBe('not a platform admin');
      expect(component.organization?.suspended_at).toBeNull();
    });
  });

  describe('unsuspendOrganization()', () => {
    it('calls platform_unsuspend_organization and clears suspension fields on confirm', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: null });
      await setup('org-1', {
        organization: createTestOrg({ suspended_at: '2026-02-01T00:00:00.000Z', suspended_by: 'admin-1', suspension_reason: 'Non-payment' }),
        rpc
      });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));

      component.unsuspendOrganization();
      await fixture.whenStable();

      expect(rpc).toHaveBeenCalledWith('platform_unsuspend_organization', { org_id: 'org-1' });
      expect(component.organization?.suspended_at).toBeNull();
      expect(component.isSuspended).toBeFalse();
    });
  });

  describe('retireOrganization()', () => {
    it('calls platform_retire_organization and sets deleted_at on confirm', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: null });
      await setup('org-1', { organization: createTestOrg(), rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));

      component.retireOrganization();
      await fixture.whenStable();

      expect(rpc).toHaveBeenCalledWith('platform_retire_organization', { org_id: 'org-1' });
      expect(component.organization?.deleted_at).toBeTruthy();
      expect(component.isRetired).toBeTrue();
    });
  });

  describe('restoreOrganization()', () => {
    it('calls platform_restore_organization and clears deleted_at on confirm', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: null });
      await setup('org-1', { organization: createTestOrg({ deleted_at: '2026-02-01T00:00:00.000Z' }), rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));

      component.restoreOrganization();
      await fixture.whenStable();

      expect(rpc).toHaveBeenCalledWith('platform_restore_organization', { org_id: 'org-1' });
      expect(component.organization?.deleted_at).toBeNull();
      expect(component.isRetired).toBeFalse();
    });
  });
});
