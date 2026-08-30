import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StudioUsageComponent } from './studio-usage.component';
import { SupabaseService } from '../../core/supabase.service';

interface FakeUsageRow {
  organization_id: string;
  member_count: number;
  item_count: number;
  storage_bytes: number;
}

function createFakeSupabaseServiceForUsage(data: {
  usage?: FakeUsageRow[];
  orgs?: { id: string; name: string }[];
  usageError?: { message: string } | null;
}): SupabaseService {
  function builder(result: { data: unknown; error: unknown }) {
    const b: Record<string, unknown> = { then: (resolve: (value: typeof result) => void) => resolve(result) };
    for (const method of ['select']) {
      b[method] = () => b;
    }
    return b;
  }

  const fake = {
    client: {
      from: () => builder({ data: data.orgs ?? [], error: null }),
      rpc: () => builder({ data: data.usage ?? [], error: data.usageError ?? null })
    }
  };
  return fake as unknown as SupabaseService;
}

describe('StudioUsageComponent', () => {
  let fixture: ComponentFixture<StudioUsageComponent>;

  async function createComponent(data: Parameters<typeof createFakeSupabaseServiceForUsage>[0] = {}) {
    await TestBed.configureTestingModule({
      imports: [StudioUsageComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForUsage(data) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StudioUsageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('should create', async () => {
    const component = await createComponent();
    expect(component).toBeTruthy();
  });

  it('ranks organizations by storage/items/members, resolving names from the org table', async () => {
    const component = await createComponent({
      usage: [
        { organization_id: 'org-1', member_count: 2, item_count: 50, storage_bytes: 10 * 1024 * 1024 },
        { organization_id: 'org-2', member_count: 8, item_count: 5, storage_bytes: 1024 * 1024 }
      ],
      orgs: [{ id: 'org-1', name: 'Acme Events' }, { id: 'org-2', name: 'Beta Co' }]
    });

    expect(component.topByStorage[0].label).toBe('Acme Events');
    expect(component.topByStorage[0].value).toBe(10);
    expect(component.topByMembers[0].label).toBe('Beta Co');
    expect(component.topByItems[0].label).toBe('Acme Events');
  });

  it('flags an organization exceeding the Free tier limits with what it exceeded', async () => {
    const component = await createComponent({
      usage: [{ organization_id: 'org-1', member_count: 12, item_count: 5, storage_bytes: 1024 * 1024 }],
      orgs: [{ id: 'org-1', name: 'Big Team Co' }]
    });

    expect(component.overLimit.length).toBe(1);
    expect(component.overLimit[0].name).toBe('Big Team Co');
    expect(component.overLimit[0].exceeded).toEqual(['12 members']);
  });

  it('lists no organization as over the limit when every org fits inside Free', async () => {
    const component = await createComponent({
      usage: [{ organization_id: 'org-1', member_count: 1, item_count: 1, storage_bytes: 0 }],
      orgs: [{ id: 'org-1', name: 'Tiny Org' }]
    });

    expect(component.overLimit.length).toBe(0);
  });

  it('surfaces a failed load rather than an all-empty usage report', async () => {
    const component = await createComponent({ usageError: { message: 'network error' } });

    expect(component.loadError).toBe('network error');
    expect(component.hasAnyUsage).toBeFalse();
  });
});
