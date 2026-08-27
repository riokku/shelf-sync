import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { HeaderComponent } from './header.component';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { NotificationCenterService } from '../core/notification-center.service';
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
  it('counts items that are low or out of stock, for a plain staff user', fakeAsync(() => {
    const supabase = createFakeSupabaseService({
      data: [
        { quantity_remaining: 1, low_quantity_threshold: 5 }, // low
        { quantity_remaining: 0, low_quantity_threshold: null }, // out of stock
        { quantity_remaining: 10, low_quantity_threshold: 5 } // sufficient
      ],
      error: null
    });

    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'staff' })) },
        { provide: SupabaseService, useValue: supabase }
      ]
    });

    const fixture = TestBed.createComponent(HeaderComponent);
    // Not fixture.whenStable() — the constructor now also schedules a
    // setInterval (the online-team-count poll), which Zone.js counts as a
    // permanently-outstanding macrotask, so whenStable() never resolves
    // once it's running. tick() flushes the initial async loads instead.
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.lowStockCount()).toBe(2);
    discardPeriodicTasks();
  }));
});

/** The Studio nav link is purely template-gated (no new component field) —
 *  verified by rendering, not by reading a property. */
describe('HeaderComponent Studio nav link', () => {
  function render(profile: ReturnType<typeof createFakeProfile>) {
    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(profile) },
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    });

    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    tick();
    const linkTexts = fixture.debugElement.queryAll(By.css('.nav-drawer-links a')).map(el => el.nativeElement.textContent.trim());
    discardPeriodicTasks();
    return linkTexts;
  }

  it('is hidden for an ordinary org admin', fakeAsync(() => {
    const linkTexts = render(createFakeProfile({ role: 'admin', is_platform_admin: false }));
    expect(linkTexts.some(text => text.includes('Studio'))).toBeFalse();
  }));

  it('shows up only for the platform-admin account', fakeAsync(() => {
    const linkTexts = render(createFakeProfile({ is_platform_admin: true }));
    expect(linkTexts.some(text => text.includes('Studio'))).toBeTrue();
  }));
});

describe('HeaderComponent notifications panel', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    });
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('toggleNotifications() opens and closes the panel', () => {
    const component = setup().componentInstance;

    expect(component.isNotificationsOpen()).toBeFalse();
    component.toggleNotifications();
    expect(component.isNotificationsOpen()).toBeTrue();
    component.toggleNotifications();
    expect(component.isNotificationsOpen()).toBeFalse();
  });

  it('onNotificationRowClick() marks the notification read and closes the panel', () => {
    const component = setup().componentInstance;
    const notificationCenter = (component as unknown as { notificationCenter: NotificationCenterService }).notificationCenter;
    const markAsReadSpy = spyOn(notificationCenter, 'markAsRead').and.returnValue(Promise.resolve());
    component.toggleNotifications();

    component.onNotificationRowClick({ id: 'notif-1', kind: 'task_assigned', message: 'x', link: '/tasks', readAt: null, createdAt: '2026-01-01T00:00:00.000Z' });

    expect(markAsReadSpy).toHaveBeenCalledWith('notif-1');
    expect(component.isNotificationsOpen()).toBeFalse();
  });
});

describe('HeaderComponent quick menu', () => {
  function setup(profile = createFakeProfile()) {
    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(profile) },
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    });
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('resolves nothing (and hides the row of links) when quick_menu_enabled is false', () => {
    const component = setup(createFakeProfile({ quick_menu_enabled: false, quick_menu_items: ['inventory'] })).componentInstance;

    expect(component.quickMenuItems()).toEqual([]);
    expect(component.showQuickMenu()).toBeFalse();
  });

  it('resolves selected items, in QUICK_MENU_OPTIONS\' own canonical order rather than selection order', () => {
    const component = setup(createFakeProfile({
      quick_menu_enabled: true,
      quick_menu_items: ['tasks', 'home']
    })).componentInstance;

    expect(component.quickMenuItems().map(option => option.key)).toEqual(['home', 'tasks']);
    expect(component.showQuickMenu()).toBeTrue();
  });

  it('drops a requiresManage option (e.g. Manage) for a non-manager, even if it was previously selected', () => {
    const component = setup(createFakeProfile({
      role: 'staff',
      quick_menu_enabled: true,
      quick_menu_items: ['manage', 'help']
    })).componentInstance;

    expect(component.quickMenuItems().map(option => option.key)).toEqual(['help']);
  });

  it('keeps requiresManage options for a manager', () => {
    const component = setup(createFakeProfile({
      role: 'manager',
      quick_menu_enabled: true,
      quick_menu_items: ['manage']
    })).componentInstance;

    expect(component.quickMenuItems().map(option => option.key)).toEqual(['manage']);
  });

  it('hides the row of links when enabled but every selected key is unresolvable/ungranted', () => {
    const component = setup(createFakeProfile({
      role: 'staff',
      quick_menu_enabled: true,
      quick_menu_items: ['manage']
    })).componentInstance;

    expect(component.showQuickMenu()).toBeFalse();
  });
});

describe('HeaderComponent nav drawer', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    });
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('openNavMenu()/closeNavMenu() toggle the drawer', () => {
    const component = setup().componentInstance;

    expect(component.isNavMenuOpen()).toBeFalse();
    component.openNavMenu();
    expect(component.isNavMenuOpen()).toBeTrue();
    component.closeNavMenu();
    expect(component.isNavMenuOpen()).toBeFalse();
  });
});

describe('HeaderComponent organization name', () => {
  it('shows the signed-in org\'s name next to the logo when it has loaded', async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile(), { organizationName: 'Acme Co' }) },
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    const orgNameEl = fixture.debugElement.query(By.css('.brand-org-name'));
    expect(orgNameEl.nativeElement.textContent.trim()).toBe('Acme Co');
  });

  it('renders nothing there while the org name has not loaded yet', async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        // No organizationName override — createFakeAuthService() defaults
        // it to null, same as a real profile/org still loading.
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile()) },
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.brand-org-name'))).toBeNull();
  });
});

describe('HeaderComponent online team count', () => {
  function agoIso(ms: number): string {
    return new Date(Date.now() - ms).toISOString();
  }

  it('counts only approved profiles whose last_active_at is recent', fakeAsync(() => {
    const supabase = createFakeSupabaseService({
      data: [
        { last_active_at: agoIso(0) }, // online
        { last_active_at: null }, // never signed in
        { last_active_at: agoIso(10 * 60_000) } // 10 minutes ago — offline
      ],
      error: null
    });

    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'staff' })) },
        { provide: SupabaseService, useValue: supabase }
      ]
    });

    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.onlineTeamCount()).toBe(1);
    discardPeriodicTasks();
  }));

  it('shows the count next to a pulsing dot, right below the org name', fakeAsync(() => {
    const supabase = createFakeSupabaseService({ data: [{ last_active_at: agoIso(0) }], error: null });

    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile(), { organizationName: 'Acme Co' }) },
        { provide: SupabaseService, useValue: supabase }
      ]
    });

    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const onlineCountEl = fixture.debugElement.query(By.css('.brand-online-count'));
    expect(onlineCountEl.nativeElement.textContent.trim()).toBe('1 online');
    expect(onlineCountEl.query(By.css('.online-dot'))).not.toBeNull();
    discardPeriodicTasks();
  }));

  it('refreshes on a 30s interval while authenticated', fakeAsync(() => {
    // Counts calls to the 'profiles' table specifically, rather than the
    // plain createFakeSupabaseService() helper's one-static-result-for-
    // every-table fake, so each interval tick is distinguishable from the
    // initial load and from the other counts' own (different-table)
    // queries this component also fires.
    let profilesQueryCount = 0;
    // Chainable through whatever this component's *other* counts call
    // (lowStockCount's .select().neq(), etc.) — a narrower builder here
    // would need to anticipate every method each of those happens to
    // chain, which is exactly what this generic one avoids.
    const emptyBuilder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
    };
    for (const method of ['select', 'eq', 'neq', 'not', 'in', 'gte', 'lt', 'order', 'limit', 'single', 'maybeSingle']) {
      emptyBuilder[method] = () => emptyBuilder;
    }
    const supabase = {
      client: {
        from: (table: string) => {
          if (table !== 'profiles') {
            return emptyBuilder;
          }
          profilesQueryCount++;
          return { select: () => ({ eq: () => Promise.resolve({ data: [{ last_active_at: agoIso(0) }], error: null }) }) };
        },
        // NotificationCenterService also subscribes to realtime changes
        // while authenticated (see its own doc comment) — inert stand-ins
        // so that doesn't throw here, same shape createFakeSupabaseService's
        // own createFakeRealtimeChannel() uses.
        channel: () => ({ on: function (this: unknown) { return this; }, subscribe: function (this: unknown) { return this; } }),
        removeChannel: async () => ({ status: 'ok' })
      }
    } as unknown as SupabaseService;

    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'staff' })) },
        { provide: SupabaseService, useValue: supabase }
      ]
    });

    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    tick();
    const queriesAfterLoad = profilesQueryCount;

    tick(30_000);
    expect(profilesQueryCount).toBeGreaterThan(queriesAfterLoad);

    discardPeriodicTasks();
  }));
});
