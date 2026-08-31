import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { StudioOrganizationsComponent } from './studio-organizations.component';
import { SupabaseService } from '../../core/supabase.service';
import { createFakeQueryBuilder } from '../../testing/fakes';

interface FakeOrgRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  deleted_at: string | null;
  suspended_at: string | null;
}

function createTestOrgRow(overrides: Partial<FakeOrgRow> = {}): FakeOrgRow {
  return {
    id: 'org-1',
    name: 'Acme Events',
    slug: 'acme-events',
    created_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    suspended_at: null,
    ...overrides,
  };
}

interface FakeUsageRow {
  organization_id: string;
  member_count: number;
  item_count: number;
  task_count: number;
  storage_bytes: number;
}

function createFakeSupabaseServiceForOrganizations(data: {
  organizations?: FakeOrgRow[];
  profiles?: { organization_id: string; last_active_at: string | null }[];
  usage?: FakeUsageRow[];
  loadError?: { message: string } | null;
}): SupabaseService {
  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'profiles') {
          return createFakeQueryBuilder({ data: data.profiles ?? [], error: null });
        }
        return createFakeQueryBuilder({ data: data.organizations ?? [], error: data.loadError ?? null });
      },
      rpc: jasmine.createSpy('rpc').and.resolveTo({ data: data.usage ?? [], error: null })
    }
  };
  return fake as unknown as SupabaseService;
}

describe('StudioOrganizationsComponent', () => {
  let component: StudioOrganizationsComponent;
  let fixture: ComponentFixture<StudioOrganizationsComponent>;

  async function createComponent(data: Parameters<typeof createFakeSupabaseServiceForOrganizations>[0] = {}) {
    await TestBed.configureTestingModule({
      imports: [StudioOrganizationsComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForOrganizations(data) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StudioOrganizationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it('reduces the cross-org profiles query into a member count and last-active date per org', async () => {
    await createComponent({
      organizations: [createTestOrgRow({ id: 'org-1' }), createTestOrgRow({ id: 'org-2', name: 'Beta Co' })],
      profiles: [
        { organization_id: 'org-1', last_active_at: '2026-02-01T00:00:00.000Z' },
        { organization_id: 'org-1', last_active_at: '2026-03-01T00:00:00.000Z' },
        { organization_id: 'org-2', last_active_at: null }
      ]
    });

    const org1 = component.organizations.find(org => org.id === 'org-1')!;
    const org2 = component.organizations.find(org => org.id === 'org-2')!;

    expect(org1.memberCount).toBe(2);
    expect(org1.lastActiveAt).toBe('2026-03-01T00:00:00.000Z');
    expect(org2.memberCount).toBe(1);
    expect(org2.lastActiveAt).toBeNull();
  });

  it('gives an org with no members at all a zero count and null last-active', async () => {
    await createComponent({ organizations: [createTestOrgRow({ id: 'org-lonely' })], profiles: [] });

    expect(component.organizations[0].memberCount).toBe(0);
    expect(component.organizations[0].lastActiveAt).toBeNull();
  });

  it('merges item/task/storage usage from platform_get_organization_usage, converting bytes to rounded MB', async () => {
    await createComponent({
      organizations: [createTestOrgRow({ id: 'org-1' })],
      usage: [{ organization_id: 'org-1', member_count: 2, item_count: 42, task_count: 7, storage_bytes: 5_242_880 }]
    });

    const org = component.organizations[0];
    expect(org.itemCount).toBe(42);
    expect(org.taskCount).toBe(7);
    expect(org.storageMb).toBe(5);
  });

  it('leaves item/task/storage null for an org the usage RPC has no row for', async () => {
    await createComponent({ organizations: [createTestOrgRow({ id: 'org-retired' })], usage: [] });

    const org = component.organizations[0];
    expect(org.itemCount).toBeNull();
    expect(org.taskCount).toBeNull();
    expect(org.storageMb).toBeNull();
  });

  it('surfaces a failed load rather than reading as an empty list', async () => {
    await createComponent({ loadError: { message: 'network error' } });

    expect(component.loadError).toBe('network error');
    expect(component.organizations).toEqual([]);
  });

  it('openOrgDetail() navigates to this org\'s own page', async () => {
    await createComponent({ organizations: [createTestOrgRow({ id: 'org-1' })] });
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate');

    const org = component.organizations[0];
    component.openOrgDetail(org);

    expect(navigateSpy).toHaveBeenCalledWith(['/studio/organizations', 'org-1']);
  });
});
