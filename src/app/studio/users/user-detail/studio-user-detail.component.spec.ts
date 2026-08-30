import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { of } from 'rxjs';

import { StudioUserDetailComponent } from './studio-user-detail.component';
import { SupabaseService } from '../../../core/supabase.service';
import { AuthService, Profile } from '../../../core/auth.service';
import { NotificationService } from '../../../core/notification.service';
import { Database } from '../../../shared/models/database.types';
import {
  createFakeActivatedRoute,
  createFakeAuthService,
  createFakeProfile,
  createFakeQueryBuilder
} from '../../../testing/fakes';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
type PlatformActionLogRow = Database['public']['Tables']['platform_action_log']['Row'];

function createTestAction(overrides: Partial<PlatformActionLogRow> = {}): PlatformActionLogRow {
  return {
    id: 'action-1',
    actor_id: 'admin-1',
    action: 'lock',
    target_type: 'user',
    target_id: 'user-1',
    target_label: 'Alex Rivera',
    reason: 'Suspicious activity',
    created_at: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

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

function createFakeSupabaseServiceForUserDetail(data: {
  profile?: Profile | null;
  profileError?: { message: string } | null;
  organization?: OrganizationRow | null;
  locker?: Profile | null;
  platformActions?: PlatformActionLogRow[];
  actionActors?: Profile[];
  rpc?: jasmine.Spy;
}): SupabaseService {
  let profilesCallCount = 0;
  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'organizations') {
          return createFakeQueryBuilder({ data: data.organization ?? null, error: null });
        }
        if (table === 'platform_action_log') {
          return createFakeQueryBuilder({ data: data.platformActions ?? [], error: null });
        }
        profilesCallCount += 1;
        if (profilesCallCount === 1) {
          return createFakeQueryBuilder({ data: data.profile ?? null, error: data.profileError ?? null });
        }
        // Second (and any later) profiles call is either the single locker
        // lookup (.maybeSingle()) or the actor-name lookup (.in(), an
        // array) — a given test scenario only ever exercises one of the two.
        if (data.actionActors) {
          return createFakeQueryBuilder({ data: data.actionActors, error: null });
        }
        return createFakeQueryBuilder({ data: data.locker ?? null, error: null });
      },
      rpc: data.rpc ?? jasmine.createSpy('rpc').and.resolveTo({ error: null })
    }
  };
  return fake as unknown as SupabaseService;
}

describe('StudioUserDetailComponent', () => {
  let component: StudioUserDetailComponent;
  let fixture: ComponentFixture<StudioUserDetailComponent>;

  async function setup(
    id: string | null,
    supabaseData: Parameters<typeof createFakeSupabaseServiceForUserDetail>[0] = {},
    viewerId = 'platform-admin-1'
  ) {
    await TestBed.configureTestingModule({
      imports: [StudioUserDetailComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForUserDetail(supabaseData) },
        {
          provide: AuthService,
          useValue: createFakeAuthService(createFakeProfile({ id: viewerId, is_platform_admin: true }), { hasSession: true })
        },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute({}, id ? { id } : {}) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StudioUserDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await setup('user-1', { profile: createFakeProfile({ id: 'user-1' }), organization: createTestOrg() });
    expect(component).toBeTruthy();
  });

  it('loads the profile plus its organization', async () => {
    await setup('user-1', {
      profile: createFakeProfile({ id: 'user-1', full_name: 'Alex Rivera' }),
      organization: createTestOrg({ id: 'org-1', name: 'Acme Events' })
    });

    expect(component.isLoading).toBeFalse();
    expect(component.profile?.full_name).toBe('Alex Rivera');
    expect(component.organization?.name).toBe('Acme Events');
  });

  describe('organizationBreadcrumbParent', () => {
    it('is null until the organization has loaded', async () => {
      await setup('user-1', { profile: createFakeProfile({ id: 'user-1' }), organization: null });
      expect(component.organizationBreadcrumbParent).toBeNull();
    });

    it('links to the org\'s own detail page once loaded', async () => {
      await setup('user-1', {
        profile: createFakeProfile({ id: 'user-1' }),
        organization: createTestOrg({ id: 'org-1', name: 'Acme Events' })
      });

      expect(component.organizationBreadcrumbParent).toEqual({ label: 'Acme Events', link: '/studio/organizations/org-1' });
    });
  });

  it('resolves lockedByName from a second profiles lookup when account_locked_by is set', async () => {
    await setup('user-1', {
      profile: createFakeProfile({
        id: 'user-1',
        account_locked_at: '2026-02-01T00:00:00.000Z',
        account_locked_by: 'admin-1'
      }),
      organization: createTestOrg(),
      locker: createFakeProfile({ id: 'admin-1', full_name: 'Riley Platform' })
    });

    expect(component.lockedByName).toBe('Riley Platform');
    expect(component.isLocked).toBeTrue();
  });

  it('loads recent platform actions scoped to this person and resolves each actor\'s name', async () => {
    await setup('user-1', {
      profile: createFakeProfile({ id: 'user-1' }),
      organization: createTestOrg(),
      platformActions: [createTestAction({ actor_id: 'admin-1' })],
      actionActors: [createFakeProfile({ id: 'admin-1', full_name: 'Riley Platform' })]
    });

    expect(component.recentActions.length).toBe(1);
    expect(component.actionActorName(component.recentActions[0])).toBe('Riley Platform');
    expect(component.actionLabel(component.recentActions[0])).toBe('Locked');
  });

  it('falls back to "Former platform admin" when an action has no actor at all', async () => {
    await setup('user-1', {
      profile: createFakeProfile({ id: 'user-1' }),
      organization: createTestOrg(),
      platformActions: [createTestAction({ actor_id: null })]
    });

    expect(component.actionActorName(component.recentActions[0])).toBe('Former platform admin');
  });

  it('surfaces a failed load rather than reading as not found', async () => {
    await setup('user-1', { profileError: { message: 'network error' } });

    expect(component.loadError).toBe('network error');
    expect(component.notFound).toBeFalse();
  });

  it('flags notFound when no row matches the id', async () => {
    await setup('missing-user', { profile: null });

    expect(component.notFound).toBeTrue();
    expect(component.loadError).toBeNull();
  });

  it('flags notFound immediately when there is no id param at all', async () => {
    await setup(null);

    expect(component.notFound).toBeTrue();
    expect(component.isLoading).toBeFalse();
  });

  it('isViewingOwnAccount is true when the loaded profile is the signed-in platform admin themselves', async () => {
    await setup('platform-admin-1', { profile: createFakeProfile({ id: 'platform-admin-1' }), organization: createTestOrg() }, 'platform-admin-1');

    expect(component.isViewingOwnAccount).toBeTrue();
  });

  describe('onLockToggleChange()', () => {
    it('reverts the toggle\'s own visual state synchronously before opening a dialog', async () => {
      await setup('user-1', { profile: createFakeProfile({ id: 'user-1' }), organization: createTestOrg() });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));
      const source = { checked: true } as unknown as MatSlideToggleChange['source'];

      component.onLockToggleChange({ checked: true, source } as MatSlideToggleChange);

      // isLocked is false (nothing committed yet) — the toggle's own
      // checked flag is reset to match it immediately, not left showing
      // the optimistic click-flip while the dialog is still open.
      expect(source.checked).toBeFalse();
    });

    it('locking calls platform_lock_user_account and updates the profile in place on success', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: null });
      await setup('user-1', { profile: createFakeProfile({ id: 'user-1', full_name: 'Alex Rivera' }), organization: createTestOrg(), rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef('Repeated abuse'));
      const successSpy = spyOn(TestBed.inject(NotificationService), 'success');
      const source = { checked: true } as unknown as MatSlideToggleChange['source'];

      component.onLockToggleChange({ checked: true, source } as MatSlideToggleChange);
      await fixture.whenStable();

      expect(rpc).toHaveBeenCalledWith('platform_lock_user_account', { target_id: 'user-1', reason: 'Repeated abuse' });
      expect(component.isLocked).toBeTrue();
      expect(component.lockedByName).toBe('you');
      expect(successSpy).toHaveBeenCalled();
      // The toggle's own checked flag is set directly on success, not left
      // to the parent's [checked]="isLocked" binding to notice and re-push
      // it — see onLockToggleChange()'s own doc comment for why.
      expect(source.checked).toBeTrue();
    });

    it('locking does nothing when the reason dialog is cancelled', async () => {
      const rpc = jasmine.createSpy('rpc');
      await setup('user-1', { profile: createFakeProfile({ id: 'user-1' }), organization: createTestOrg(), rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));
      const source = { checked: true } as unknown as MatSlideToggleChange['source'];

      component.onLockToggleChange({ checked: true, source } as MatSlideToggleChange);
      await fixture.whenStable();

      expect(rpc).not.toHaveBeenCalled();
      expect(component.isLocked).toBeFalse();
    });

    it('surfaces a lock RPC error inline rather than mutating the profile', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: { message: 'only platform admins can lock a user account' } });
      await setup('user-1', { profile: createFakeProfile({ id: 'user-1' }), organization: createTestOrg(), rpc });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef('Reason'));
      const source = { checked: true } as unknown as MatSlideToggleChange['source'];

      component.onLockToggleChange({ checked: true, source } as MatSlideToggleChange);
      await fixture.whenStable();

      expect(component.actionError).toBe('only platform admins can lock a user account');
      expect(component.isLocked).toBeFalse();
    });

    it('unlocking calls platform_unlock_user_account and clears lock fields on confirm', async () => {
      const rpc = jasmine.createSpy('rpc').and.resolveTo({ error: null });
      await setup('user-1', {
        profile: createFakeProfile({ id: 'user-1', account_locked_at: '2026-02-01T00:00:00.000Z', account_locked_by: 'admin-1' }),
        organization: createTestOrg(),
        rpc
      });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
      const source = { checked: true } as unknown as MatSlideToggleChange['source'];

      component.onLockToggleChange({ checked: false, source } as MatSlideToggleChange);
      await fixture.whenStable();

      expect(rpc).toHaveBeenCalledWith('platform_unlock_user_account', { target_id: 'user-1' });
      expect(component.isLocked).toBeFalse();
      expect(component.lockedByName).toBeNull();
      // Same explicit re-sync as the lock path above, in the other direction.
      expect(source.checked).toBeFalse();
    });
  });
});
