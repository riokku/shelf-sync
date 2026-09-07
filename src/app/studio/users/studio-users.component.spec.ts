import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { StudioUsersComponent } from './studio-users.component';
import { SupabaseService } from '../../core/supabase.service';
import { Profile } from '../../core/auth.service';
import { Database } from '../../shared/models/database.types';
import { createFakeQueryBuilder } from '../../testing/fakes';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];

function createTestProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-1',
    organization_id: 'org-1',
    email: 'alex@example.com',
    full_name: 'Alex Rivera',
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

function createFakeSupabaseServiceForUsers(data: {
  profiles?: Profile[];
  organizations?: OrganizationRow[];
  loadError?: { message: string } | null;
}): SupabaseService {
  const fake = {
    client: {
      from: () => createFakeQueryBuilder({ data: data.organizations ?? [], error: null }),
      // platform_list_profiles() replaced this component's own direct
      // `.from('profiles')` read — see add_platform_cross_org_read_rpcs'
      // own doc comment.
      rpc: jasmine.createSpy('rpc').and.resolveTo({ data: data.profiles ?? [], error: data.loadError ?? null })
    }
  };
  return fake as unknown as SupabaseService;
}

describe('StudioUsersComponent', () => {
  let component: StudioUsersComponent;
  let fixture: ComponentFixture<StudioUsersComponent>;

  async function createComponent(data: Parameters<typeof createFakeSupabaseServiceForUsers>[0] = {}) {
    await TestBed.configureTestingModule({
      imports: [StudioUsersComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForUsers(data) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StudioUsersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it('has no search matches until a search term is entered, but displayedProfiles still shows recent signups', async () => {
    await createComponent({ profiles: [createTestProfile()], organizations: [createTestOrg()] });

    expect(component.filteredResults).toEqual([]);
    expect(component.displayedProfiles.length).toBe(1);
  });

  describe('recentProfiles / displayedProfiles', () => {
    it('sorts by created_at descending and caps at 20', async () => {
      const profiles = Array.from({ length: 25 }, (_, i) =>
        createTestProfile({ id: `p${i}`, created_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` })
      );
      await createComponent({ profiles, organizations: [createTestOrg()] });

      expect(component.recentProfiles.length).toBe(20);
      // p24 (Jan 25) is the most recently created — should lead the list.
      expect(component.recentProfiles[0].id).toBe('p24');
      expect(component.recentProfiles[19].id).toBe('p5');
    });

    it('displayedProfiles is recentProfiles with no search term, and filteredResults once one is typed', async () => {
      await createComponent({
        profiles: [
          createTestProfile({ id: 'p1', full_name: 'Alex Rivera', email: 'alex@example.com', created_at: '2026-01-01T00:00:00.000Z' }),
          createTestProfile({ id: 'p2', full_name: 'Jordan Lee', email: 'jordan@example.com', created_at: '2026-01-02T00:00:00.000Z' })
        ],
        organizations: [createTestOrg()]
      });

      expect(component.displayedProfiles.map(p => p.id)).toEqual(['p2', 'p1']);

      component.searchTerm = 'alex';
      expect(component.displayedProfiles.map(p => p.id)).toEqual(['p1']);
    });
  });

  it('matches on name or email, case-insensitively', async () => {
    await createComponent({
      profiles: [
        createTestProfile({ id: 'p1', full_name: 'Alex Rivera', email: 'alex@example.com' }),
        createTestProfile({ id: 'p2', full_name: 'Jordan Lee', email: 'jordan@example.com' })
      ],
      organizations: [createTestOrg()]
    });

    component.searchTerm = 'ALEX';
    expect(component.filteredResults.map(p => p.id)).toEqual(['p1']);

    component.searchTerm = 'jordan@example.com';
    expect(component.filteredResults.map(p => p.id)).toEqual(['p2']);
  });

  it('caps displayed results while totalMatchCount reports the full match count', async () => {
    const profiles = Array.from({ length: 30 }, (_, i) =>
      createTestProfile({ id: `p${i}`, full_name: `Match Person ${i}`, email: `match${i}@example.com` })
    );
    await createComponent({ profiles, organizations: [createTestOrg()] });

    component.searchTerm = 'match';

    expect(component.totalMatchCount).toBe(30);
    expect(component.filteredResults.length).toBe(25);
  });

  it('resolves an org name from the loaded organizations map', async () => {
    await createComponent({
      profiles: [createTestProfile({ full_name: 'Alex Rivera', organization_id: 'org-1' })],
      organizations: [createTestOrg({ id: 'org-1', name: 'Gatherwell Events Co.' })]
    });
    component.searchTerm = 'Alex';

    expect(component.organizationName(component.filteredResults[0])).toBe('Gatherwell Events Co.');
  });

  it('openUser() navigates to the profile\'s own detail page', async () => {
    await createComponent({
      profiles: [createTestProfile({ id: 'profile-1', full_name: 'Alex Rivera', organization_id: 'org-1' })],
      organizations: [createTestOrg({ id: 'org-1', name: 'Gatherwell Events Co.' })]
    });
    component.searchTerm = 'Alex';
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate');

    component.openUser(component.filteredResults[0]);

    expect(navigateSpy).toHaveBeenCalledWith(['/studio/users', 'profile-1']);
  });

  it('shows a Locked badge instead of Approved/Pending for a locked account', async () => {
    await createComponent({
      profiles: [createTestProfile({ full_name: 'Alex Rivera', account_locked_at: '2026-01-01T00:00:00.000Z' })],
      organizations: [createTestOrg()]
    });
    component.searchTerm = 'Alex';
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Locked');
    expect(fixture.nativeElement.textContent).not.toContain('Approved');
  });

  it('renders a row per recent signup by default, with no search term typed', async () => {
    await createComponent({
      profiles: [
        createTestProfile({ id: 'p1', full_name: 'Alex Rivera', created_at: '2026-01-01T00:00:00.000Z' }),
        createTestProfile({ id: 'p2', full_name: 'Jordan Lee', created_at: '2026-01-02T00:00:00.000Z' })
      ],
      organizations: [createTestOrg()]
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Alex Rivera');
    expect(text).toContain('Jordan Lee');
    expect(text).toContain('Showing the 2 most recently signed up users');
  });

  it('surfaces a failed load rather than reading as an empty directory', async () => {
    await createComponent({ loadError: { message: 'network error' } });

    expect(component.loadError).toBe('network error');
  });
});
