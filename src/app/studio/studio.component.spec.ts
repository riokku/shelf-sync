import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StudioComponent } from './studio.component';
import { SupabaseService } from '../core/supabase.service';
import { createFakeSupabaseService } from '../testing/fakes';

describe('StudioComponent', () => {
  let component: StudioComponent;
  let fixture: ComponentFixture<StudioComponent>;

  async function createComponent(count: number) {
    await TestBed.configureTestingModule({
      imports: [StudioComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], count, error: null }) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await createComponent(0);
    expect(component).toBeTruthy();
  });

  it('badges the Feedback card with the count of not-yet-reviewed feedback', async () => {
    await createComponent(4);
    expect(component.newFeedbackCount).toBe(4);
  });

  it('shows zero when nothing new is waiting', async () => {
    await createComponent(0);
    expect(component.newFeedbackCount).toBe(0);
  });
});

/** Table-aware — unlike the shared createFakeSupabaseService() above (one
 *  canned count reused everywhere), the dashboard stats need
 *  organizations/profiles/client_error_log told apart from feedback and
 *  from each other. */
function createFakeSupabaseServiceForStats(counts: {
  feedback: number;
  organizations: number;
  approvedUsers: number;
  errorRows: { app_env: string | null }[];
}): SupabaseService {
  function builderFor(count: number, data: unknown[] = []) {
    const builder: Record<string, unknown> = {
      then: (resolve: (value: { data: unknown[]; count: number; error: null }) => void) =>
        resolve({ data, count, error: null }),
    };
    for (const method of ['select', 'eq', 'neq', 'is', 'gte', 'order']) {
      builder[method] = () => builder;
    }
    return builder;
  }

  const fake = {
    client: {
      from: (table: string) => {
        if (table === 'feedback') {
          return builderFor(counts.feedback);
        }
        if (table === 'organizations') {
          // Both totalOrgCount (deleted_at is null) and newOrgCount
          // (created_at within the last week) query this same table — the
          // fake doesn't tell the two apart, they share one canned count,
          // same "not testing the exact filter, just that both wire up"
          // scope every other count-only stat in this app's specs uses.
          return builderFor(counts.organizations);
        }
        if (table === 'profiles') {
          return builderFor(counts.approvedUsers);
        }
        if (table === 'client_error_log') {
          return builderFor(counts.errorRows.length, counts.errorRows);
        }
        return builderFor(0);
      }
    }
  };
  return fake as unknown as SupabaseService;
}

describe('StudioComponent dashboard stats', () => {
  async function createComponent(counts: {
    feedback: number;
    organizations: number;
    approvedUsers: number;
    errorRows: { app_env: string | null }[];
  }) {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [StudioComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseServiceForStats(counts) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(StudioComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('loads the headline organization/user/feedback counts', async () => {
    const component = await createComponent({
      feedback: 3,
      organizations: 12,
      approvedUsers: 47,
      errorRows: []
    });

    expect(component.totalOrgCount).toBe(12);
    expect(component.newOrgCount).toBe(12);
    expect(component.approvedUserCount).toBe(47);
    expect(component.newFeedbackCount).toBe(3);
    expect(component.isLoadingStats).toBeFalse();
  });

  it('counts only non-development errors in the last 24 hours', async () => {
    const component = await createComponent({
      feedback: 0,
      organizations: 0,
      approvedUsers: 0,
      errorRows: [
        { app_env: 'production' },
        { app_env: 'development' },
        { app_env: null } // treated as "not development", same as StudioErrorLogComponent's own check
      ]
    });

    expect(component.recentErrorCount).toBe(2);
  });
});
