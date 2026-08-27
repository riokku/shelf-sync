import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { StudioUsersComponent } from './studio-users.component';
import { OrgDetailModalComponent } from '../organizations/org-detail-modal/org-detail-modal.component';
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
      from: (table: string) => {
        if (table === 'organizations') {
          return createFakeQueryBuilder({ data: data.organizations ?? [], error: null });
        }
        return createFakeQueryBuilder({ data: data.profiles ?? [], error: data.loadError ?? null });
      }
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

  it('shows no results until a search term is entered', async () => {
    await createComponent({ profiles: [createTestProfile()], organizations: [createTestOrg()] });

    expect(component.filteredResults).toEqual([]);
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

  it('openOrganization() opens OrgDetailModalComponent with the profile\'s org', async () => {
    const organization = createTestOrg({ id: 'org-1', name: 'Gatherwell Events Co.' });
    await createComponent({
      profiles: [createTestProfile({ full_name: 'Alex Rivera', organization_id: 'org-1' })],
      organizations: [organization]
    });
    component.searchTerm = 'Alex';
    const dialog = TestBed.inject(MatDialog);
    const openSpy = spyOn(dialog, 'open');

    component.openOrganization(component.filteredResults[0]);

    expect(openSpy).toHaveBeenCalledWith(OrgDetailModalComponent, jasmine.objectContaining({
      data: { organization }
    }));
  });

  it('surfaces a failed load rather than reading as an empty directory', async () => {
    await createComponent({ loadError: { message: 'network error' } });

    expect(component.loadError).toBe('network error');
  });
});
