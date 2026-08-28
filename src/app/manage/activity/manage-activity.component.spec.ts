import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ManageActivityComponent } from './manage-activity.component';
import { SupabaseService } from '../../core/supabase.service';
import { createFakeSupabaseService } from '../../testing/fakes';

describe('ManageActivityComponent', () => {
  let component: ManageActivityComponent;
  let fixture: ComponentFixture<ManageActivityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageActivityComponent],
      providers: [
        provideRouter([]),
        // ngOnInit loads profiles then today's entries on construction —
        // faked so this hits nothing real, same reasoning as every other spec.
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [] }) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageActivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('defaults to showing today', () => {
    expect(component.isToday).toBeTrue();
  });

  describe('day navigation', () => {
    it('previousDay() moves selectedDate back a day and clears isToday', () => {
      component.previousDay();
      expect(component.isToday).toBeFalse();
    });

    it('nextDay() moves back toward today, and stops there', () => {
      component.previousDay();
      component.previousDay();
      expect(component.isToday).toBeFalse();

      component.nextDay();
      expect(component.isToday).toBeFalse();

      component.nextDay();
      expect(component.isToday).toBeTrue();
    });

    it('nextDay() is a no-op once already on today — never advances into the future', () => {
      const today = component.selectedDate;
      component.nextDay();
      expect(component.selectedDate).toEqual(today);
    });
  });

  describe('entityIcon', () => {
    it('maps each entity type to the same icon its Manage hub card uses', () => {
      expect(component.entityIcon('inventory_item')).toBe('inventory_2');
      expect(component.entityIcon('task')).toBe('checklist');
      expect(component.entityIcon('member')).toBe('group');
    });
  });
});

describe('ManageActivityComponent load errors', () => {
  async function createComponent(supabaseService: SupabaseService): Promise<ManageActivityComponent> {
    await TestBed.configureTestingModule({
      imports: [ManageActivityComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: supabaseService }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageActivityComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('sets loadError instead of silently rendering an empty day when the entries query fails', async () => {
    const failingSupabase = createFakeSupabaseService({ data: null, error: { message: 'Network error' } });
    const component = await createComponent(failingSupabase);

    expect(component.loadError).toBe('Network error');
    expect(component.entries).toEqual([]);
  });

  it('retryLoad() clears loadError on a successful retry', async () => {
    const failingSupabase = createFakeSupabaseService({ data: null, error: { message: 'Network error' } });
    const component = await createComponent(failingSupabase);
    expect(component.loadError).toBe('Network error');

    (component as unknown as { supabase: SupabaseService['client'] }).supabase =
      createFakeSupabaseService({ data: [], error: null }).client;

    component.retryLoad();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.loadError).toBeNull();
  });
});
