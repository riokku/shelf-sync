import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AccountComponent } from './account.component';
import { AuthService, Profile } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { SupabaseService } from '../core/supabase.service';
import { createFakeAuthService, createFakeProfile } from '../testing/fakes';
import { MAX_QUICK_MENU_ITEMS } from '../shared/models/quick-menu';

describe('AccountComponent', () => {
  let component: AccountComponent;
  let fixture: ComponentFixture<AccountComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile()) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AccountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('AccountComponent quick menu', () => {
  let component: AccountComponent;
  let updateSpy: jasmine.Spy;
  let notificationSuccessSpy: jasmine.Spy;

  /** A narrow, table-aware fake rather than the shared
   *  createFakeSupabaseService() helper — saveQuickMenu()'s own assertions
   *  need to inspect exactly what was passed to profiles.update(), which
   *  that shared helper's one-fixed-result-for-every-call shape can't
   *  expose. */
  async function setup(profileOverrides: Partial<Profile> = {}): Promise<ComponentFixture<AccountComponent>> {
    const profile = createFakeProfile({ quick_menu_enabled: false, quick_menu_items: [], ...profileOverrides });
    updateSpy = jasmine.createSpy('update').and.returnValue({ eq: () => Promise.resolve({ error: null }) });
    const supabase = {
      client: {
        from: (table: string) => {
          if (table === 'profiles') {
            return { update: updateSpy };
          }
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
        }
      }
    } as unknown as SupabaseService;

    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(profile) },
        { provide: SupabaseService, useValue: supabase }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(AccountComponent);
    component = fixture.componentInstance;
    // Real service, spied rather than replaced — same convention every
    // other spec asserting a save toast in this app already uses (see
    // settings.component.spec.ts's own identical note).
    notificationSuccessSpy = spyOn((component as unknown as { notification: NotificationService }).notification, 'success');
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('toggleQuickMenuItem() adds and removes keys', async () => {
    await setup();

    component.toggleQuickMenuItem('inventory', true);
    expect(component.selectedQuickMenuItems).toEqual(['inventory']);

    component.toggleQuickMenuItem('inventory', false);
    expect(component.selectedQuickMenuItems).toEqual([]);
  });

  it('toggleQuickMenuItem() refuses to add past the max-item cap', async () => {
    await setup({ quick_menu_items: [] });

    for (let i = 0; i < MAX_QUICK_MENU_ITEMS; i++) {
      component.toggleQuickMenuItem(`item-${i}`, true);
    }
    expect(component.selectedQuickMenuItems.length).toBe(MAX_QUICK_MENU_ITEMS);

    component.toggleQuickMenuItem('one-too-many', true);
    expect(component.selectedQuickMenuItems.length).toBe(MAX_QUICK_MENU_ITEMS);
    expect(component.selectedQuickMenuItems).not.toContain('one-too-many');
  });

  it('quickMenuChanged is order-independent and reacts to the enabled flag', async () => {
    await setup({ quick_menu_enabled: true, quick_menu_items: ['home', 'tasks'] });

    expect(component.quickMenuChanged).toBeFalse();

    component.selectedQuickMenuItems = ['tasks', 'home'];
    expect(component.quickMenuChanged).toBeFalse();

    component.selectedQuickMenuItems = ['home'];
    expect(component.quickMenuChanged).toBeTrue();

    component.selectedQuickMenuItems = ['home', 'tasks'];
    component.selectedQuickMenuEnabled = false;
    expect(component.quickMenuChanged).toBeTrue();
  });

  it('saveQuickMenu() persists both fields, updates the local profile, and shows a success toast', async () => {
    await setup();

    component.selectedQuickMenuEnabled = true;
    component.selectedQuickMenuItems = ['inventory', 'tasks'];
    await component.saveQuickMenu();

    expect(updateSpy).toHaveBeenCalledWith({
      quick_menu_enabled: true,
      quick_menu_items: ['inventory', 'tasks']
    });
    expect(component.profile?.quick_menu_enabled).toBeTrue();
    expect(component.profile?.quick_menu_items).toEqual(['inventory', 'tasks']);
    expect(component.quickMenuError).toBeNull();
    expect(notificationSuccessSpy).toHaveBeenCalledWith('Quick menu saved');
  });

  it('saveQuickMenu() surfaces an error message and skips the toast on failure', async () => {
    await setup();
    updateSpy.and.returnValue({ eq: () => Promise.resolve({ error: { message: 'boom' } }) });

    component.selectedQuickMenuEnabled = true;
    await component.saveQuickMenu();

    expect(component.quickMenuError).toBe('boom');
    expect(notificationSuccessSpy).not.toHaveBeenCalled();
  });
});
