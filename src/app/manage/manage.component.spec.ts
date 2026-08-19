import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ManageComponent } from './manage.component';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { createFakeAuthService, createFakeProfile, createFakeSupabaseService } from '../testing/fakes';

describe('ManageComponent', () => {
  let component: ManageComponent;
  let fixture: ComponentFixture<ManageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        // The admin profile above means ngOnInit's pending-count queries
        // (for the Tasks/Team card badges) actually run during this test —
        // fake the client so that hits nothing real.
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

/** Regression coverage for a real bug: this hub's Inventory card had no
 *  badge at all for pending retirement requests, even though
 *  HeaderComponent's combined nav badge (pendingManageCount) already
 *  summed retirement + transfer + join-request counts — so the nav could
 *  show a higher total than anything visibly added up to on this page. */
describe('ManageComponent pendingRetirementCount', () => {
  it('is populated from inventory_items alongside the other two counts', async () => {
    await TestBed.configureTestingModule({
      imports: [ManageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], count: 3, error: null }) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.pendingRetirementCount).toBe(3);
  });
});
