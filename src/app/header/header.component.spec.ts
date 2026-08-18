import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HeaderComponent } from './header.component';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { createFakeAuthService, createFakeProfile, createFakeSupabaseService } from '../testing/fakes';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        // The default fake profile has no manage role, so the pending-count
        // queries this badge would trigger don't actually fire here — faked
        // anyway so that stays true if this spec's profile ever changes.
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

/** lowStockCount is visible to every authenticated user (not gated on
 *  canManage() the way pendingManageCount is above), so it needs its own
 *  authenticated fixture rather than the unauthenticated default above. */
describe('HeaderComponent low stock badge', () => {
  it('counts items that are low or out of stock, for a plain staff user', async () => {
    const supabase = createFakeSupabaseService({
      data: [
        { quantity_remaining: 1, low_quantity_threshold: 5 }, // low
        { quantity_remaining: 0, low_quantity_threshold: null }, // out of stock
        { quantity_remaining: 10, low_quantity_threshold: 5 } // sufficient
      ],
      error: null
    });

    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'staff' })) },
        { provide: SupabaseService, useValue: supabase }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.lowStockCount()).toBe(2);
  });
});
