import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomeComponent } from './home.component';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { createFakeAuthService, createFakeSupabaseService } from '../testing/fakes';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;

  async function createComponent(items: { quantity_remaining: number; low_quantity_threshold: number | null }[] = []) {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: items, error: null }) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it('counts items that are low or out of stock', async () => {
    await createComponent([
      { quantity_remaining: 2, low_quantity_threshold: 5 }, // low
      { quantity_remaining: 0, low_quantity_threshold: null }, // out of stock, no threshold set
      { quantity_remaining: 20, low_quantity_threshold: 5 } // sufficient
    ]);

    expect(component.lowStockCount).toBe(2);
  });

  it('shows zero when nothing needs restocking', async () => {
    await createComponent([{ quantity_remaining: 20, low_quantity_threshold: 5 }]);

    expect(component.lowStockCount).toBe(0);
  });
});
