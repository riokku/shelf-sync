import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ManageBillingComponent } from './manage-billing.component';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { createFakeAuthService, createFakeProfile, createFakeSupabaseService } from '../../testing/fakes';

describe('ManageBillingComponent', () => {
  let component: ManageBillingComponent;
  let fixture: ComponentFixture<ManageBillingComponent>;

  beforeEach(async () => {
    // ngOnInit loads org/member/item counts and photo storage usage on
    // construction — faked so this hits nothing real, same reasoning as
    // every other spec that does this. The shared fake returns the same
    // canned `data`/`count` for every call regardless of table/RPC, which
    // doesn't fit here (the RPC needs a plain byte count, not the
    // organization row), so the RPC call is overridden separately below.
    const baseFake = createFakeSupabaseService({ data: { created_at: '2026-01-15T00:00:00.000Z' }, count: 3 });
    const fakeSupabaseService = {
      client: {
        ...baseFake.client,
        rpc: () => Promise.resolve({ data: 10 * 1024 * 1024, error: null })
      }
    } as unknown as SupabaseService;

    await TestBed.configureTestingModule({
      imports: [ManageBillingComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        { provide: SupabaseService, useValue: fakeSupabaseService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageBillingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('hardcodes every org onto the Free tier — no subscriptions table exists yet', () => {
    expect(component.currentTier.key).toBe('free');
  });

  describe('usagePercent', () => {
    it('computes a percentage against a real cap', () => {
      expect(component.usagePercent(3, 6)).toBe(50);
    });

    it('clamps to 100 for a real overage', () => {
      expect(component.usagePercent(9, 6)).toBe(100);
    });

    it('returns 0 for an unlimited (null) cap rather than dividing by it', () => {
      expect(component.usagePercent(9, null)).toBe(0);
    });
  });

  describe('usageLabel', () => {
    it('reads "X of Y" against a real cap', () => {
      expect(component.usageLabel(3, 10)).toBe('3 of 10');
    });

    it('reads "X · Unlimited" against a null cap', () => {
      expect(component.usageLabel(3, null)).toBe('3 · Unlimited');
    });
  });

  describe('storageUsageLabel', () => {
    it('folds the MB unit into each number rather than appending it once', () => {
      expect(component.storageUsedMb).toBe(10);
      expect(component.storageUsageLabel()).toBe('10MB of 500MB');
    });
  });
});
