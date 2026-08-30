import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StudioAuditLogComponent } from './studio-audit-log.component';
import { SupabaseService } from '../../core/supabase.service';
import { createFakeQueryBuilder } from '../../testing/fakes';

interface FakeActionLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  target_label: string;
  reason: string | null;
  created_at: string;
}

function createTestActionRow(overrides: Partial<FakeActionLogRow> = {}): FakeActionLogRow {
  return {
    id: 'action-1',
    actor_id: 'admin-1',
    action: 'suspend',
    target_type: 'organization',
    target_id: 'org-1',
    target_label: 'Acme Events',
    reason: 'Non-payment',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createFakeSupabaseServiceForAuditLog(data: {
  actionLog?: FakeActionLogRow[];
  profiles?: { id: string; email: string; full_name: string | null; nickname: string | null }[];
  loadError?: { message: string } | null;
}): SupabaseService {
  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'profiles') {
          return createFakeQueryBuilder({ data: data.profiles ?? [], error: null });
        }
        return createFakeQueryBuilder({ data: data.actionLog ?? [], error: data.loadError ?? null });
      }
    }
  };
  return fake as unknown as SupabaseService;
}

describe('StudioAuditLogComponent', () => {
  let component: StudioAuditLogComponent;
  let fixture: ComponentFixture<StudioAuditLogComponent>;

  async function createComponent(data: Parameters<typeof createFakeSupabaseServiceForAuditLog>[0] = {}) {
    await TestBed.configureTestingModule({
      imports: [StudioAuditLogComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForAuditLog(data) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StudioAuditLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it('resolves the actor name from the loaded profiles list', async () => {
    await createComponent({
      actionLog: [createTestActionRow({ actor_id: 'admin-1' })],
      profiles: [{ id: 'admin-1', email: 'admin@example.com', full_name: 'Ada Admin', nickname: null }]
    });

    expect(component.actorName(component.actionLog[0])).toBe('Ada Admin');
  });

  it('falls back to "Former platform admin" when the actor no longer has a profile', async () => {
    await createComponent({ actionLog: [createTestActionRow({ actor_id: null })] });

    expect(component.actorName(component.actionLog[0])).toBe('Former platform admin');
  });

  it('maps a known action to its human label and falls back to the raw value otherwise', async () => {
    await createComponent({ actionLog: [createTestActionRow({ action: 'lock' })] });
    expect(component.actionLabel(component.actionLog[0])).toBe('Locked');

    expect(component.actionLabel({ ...createTestActionRow(), action: 'something_new' } as never)).toBe('something_new');
  });

  it('links an organization target to its Studio detail page', async () => {
    await createComponent({ actionLog: [createTestActionRow({ target_type: 'organization', target_id: 'org-9' })] });
    expect(component.targetLink(component.actionLog[0])).toEqual(['/studio/organizations', 'org-9']);
  });

  it('links a user target to its Studio detail page', async () => {
    await createComponent({ actionLog: [createTestActionRow({ target_type: 'user', target_id: 'user-9' })] });
    expect(component.targetLink(component.actionLog[0])).toEqual(['/studio/users', 'user-9']);
  });

  it('surfaces a failed load rather than an empty audit log', async () => {
    await createComponent({ loadError: { message: 'network error' } });

    expect(component.loadError).toBe('network error');
    expect(component.actionLog).toEqual([]);
  });
});
