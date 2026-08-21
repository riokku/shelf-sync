import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ManageTeamComponent } from './manage-team.component';
import { AuthService, Profile } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { createFakeAuthService, createFakeProfile, createFakeSupabaseService } from '../../testing/fakes';

describe('ManageTeamComponent', () => {
  let component: ManageTeamComponent;
  let fixture: ComponentFixture<ManageTeamComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageTeamComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        // ngOnInit loads profiles/tasks/invite-link on construction — faked
        // so this hits nothing real, same reasoning as every other spec.
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageTeamComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('filteredTeamMembers', () => {
    function memberOf(profile: Partial<Profile>) {
      return {
        profile: createFakeProfile(profile),
        tasks: []
      };
    }

    beforeEach(() => {
      component.teamMembers = [
        memberOf({ id: 'user-1', full_name: 'Jane Doe', nickname: null }),
        memberOf({ id: 'user-2', full_name: 'John Smith', nickname: 'Slugger' }),
        memberOf({ id: 'user-3', full_name: 'Jamie Lee', nickname: null })
      ];
    });

    it('returns every member when the search term is empty', () => {
      expect(component.filteredTeamMembers.length).toBe(3);
    });

    it('matches by full name, case-insensitively', () => {
      component.teamSearchTerm = 'doe';
      expect(component.filteredTeamMembers.map(m => m.profile.id)).toEqual(['user-1']);
    });

    it('matches by nickname when the name itself does not match', () => {
      component.teamSearchTerm = 'slugger';
      expect(component.filteredTeamMembers.map(m => m.profile.id)).toEqual(['user-2']);
    });

    it('matches a shared substring across multiple members', () => {
      component.teamSearchTerm = 'ja';
      expect(component.filteredTeamMembers.map(m => m.profile.id)).toEqual(['user-1', 'user-3']);
    });

    it('returns nothing when no member matches', () => {
      component.teamSearchTerm = 'nonexistent';
      expect(component.filteredTeamMembers).toEqual([]);
    });

    it('trims surrounding whitespace on the search term', () => {
      component.teamSearchTerm = '  doe  ';
      expect(component.filteredTeamMembers.map(m => m.profile.id)).toEqual(['user-1']);
    });

    describe('showOnlineOnly', () => {
      beforeEach(() => {
        component.teamMembers = [
          memberOf({ id: 'user-1', full_name: 'Jane Doe', last_active_at: new Date().toISOString() }), // online
          memberOf({ id: 'user-2', full_name: 'John Smith', last_active_at: null }), // offline
          memberOf({ id: 'user-3', full_name: 'Jamie Lee', last_active_at: null }) // offline
        ];
      });

      it('is a no-op when off', () => {
        expect(component.filteredTeamMembers.length).toBe(3);
      });

      it('narrows to only online members when on', () => {
        component.showOnlineOnly = true;
        expect(component.filteredTeamMembers.map(m => m.profile.id)).toEqual(['user-1']);
      });

      it('combines with the search term', () => {
        component.showOnlineOnly = true;
        component.teamSearchTerm = 'smith'; // matches user-2, who's offline
        expect(component.filteredTeamMembers).toEqual([]);
      });
    });
  });

  describe('emptyTeamMessage', () => {
    it('reads as a plain search-mismatch message by default', () => {
      component.teamSearchTerm = 'nonexistent';
      expect(component.emptyTeamMessage).toBe('No team members match your search.');
    });

    it('reads as an online-specific message when only showOnlineOnly is active', () => {
      component.showOnlineOnly = true;
      expect(component.emptyTeamMessage).toBe('No team members are online right now.');
    });

    it('combines both when search and showOnlineOnly are both active', () => {
      component.teamSearchTerm = 'nonexistent';
      component.showOnlineOnly = true;
      expect(component.emptyTeamMessage).toBe('No online team members match your search.');
    });
  });

  describe('toggleShowOnlineOnly / clearTeamFilters', () => {
    it('toggleShowOnlineOnly() sets showOnlineOnly', () => {
      component.toggleShowOnlineOnly(true);
      expect(component.showOnlineOnly).toBeTrue();

      component.toggleShowOnlineOnly(false);
      expect(component.showOnlineOnly).toBeFalse();
    });

    it('clearTeamFilters() resets both the search term and showOnlineOnly', () => {
      component.teamSearchTerm = 'jane';
      component.showOnlineOnly = true;

      component.clearTeamFilters();

      expect(component.teamSearchTerm).toBe('');
      expect(component.showOnlineOnly).toBeFalse();
    });
  });

  describe('isOnline / lastSeenLabel', () => {
    it('delegates to the shared presence helpers (see presence.spec.ts for their own coverage)', () => {
      const onlineProfile = createFakeProfile({ last_active_at: new Date().toISOString() });
      const offlineProfile = createFakeProfile({ last_active_at: null });

      expect(component.isOnline(onlineProfile)).toBeTrue();
      expect(component.isOnline(offlineProfile)).toBeFalse();
      expect(component.lastSeenLabel(offlineProfile)).toBe('Never signed in');
    });
  });

  describe('presenceLabel', () => {
    // Always some text — the online dot alone (shown only when online)
    // otherwise left a row with nothing there once a member came online,
    // which shifted the role badge/actions next to it out of line with
    // every other (offline, "Last seen …") row.
    it('reads "Online" for an online profile instead of a last-seen time', () => {
      const onlineProfile = createFakeProfile({ last_active_at: new Date().toISOString() });
      expect(component.presenceLabel(onlineProfile)).toBe('Online');
    });

    it('falls back to the last-seen time for an offline profile', () => {
      const offlineProfile = createFakeProfile({ last_active_at: null });
      expect(component.presenceLabel(offlineProfile)).toBe('Never signed in');
    });
  });
});

function memberOf(profile: Partial<Profile>) {
  return { profile: createFakeProfile(profile), tasks: [] };
}

describe('ManageTeamComponent refreshPresence()', () => {
  // Private — accessed the same way other specs in this app reach a
  // private method/field (see e.g. modal-table.component.spec.ts's
  // toggleLock() tests), rather than making it public just for testing.
  function callRefreshPresence(component: ManageTeamComponent): Promise<void> {
    return (component as unknown as { refreshPresence: () => Promise<void> }).refreshPresence();
  }

  it('patches last_active_at onto already-loaded team/pending member profiles in place', async () => {
    await TestBed.configureTestingModule({
      imports: [ManageTeamComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        {
          provide: SupabaseService,
          useValue: createFakeSupabaseService({
            data: [
              { id: 'user-1', last_active_at: '2026-01-01T00:05:00.000Z' },
              { id: 'user-2', last_active_at: '2026-01-01T00:06:00.000Z' }
            ],
            error: null
          })
        }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageTeamComponent);
    const component = fixture.componentInstance;
    // Deliberately no fixture.detectChanges() here — that would run
    // ngOnInit(), which (a) registers a setInterval that Zone.js counts as
    // a permanently-outstanding macrotask (whenStable() would then never
    // resolve), and (b) races the teamMembers/pendingMembers assignments
    // right below with ngOnInit's own async loadProfiles()/loadTeamTasks(),
    // which would otherwise clobber them once it resolves. Testing
    // refreshPresence() in isolation needs neither — it's a plain method on
    // an already-constructed component instance.

    component.teamMembers = [memberOf({ id: 'user-1', last_active_at: null })];
    component.pendingMembers = [createFakeProfile({ id: 'user-2', last_active_at: null })];

    await callRefreshPresence(component);

    expect(component.teamMembers[0].profile.last_active_at).toBe('2026-01-01T00:05:00.000Z');
    expect(component.pendingMembers[0].last_active_at).toBe('2026-01-01T00:06:00.000Z');
  });

  it('leaves a profile untouched if its id is not present in the fetched rows', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ManageTeamComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], error: null }) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageTeamComponent);
    const component = fixture.componentInstance;
    // See the previous test's note on deliberately skipping detectChanges().

    component.teamMembers = [memberOf({ id: 'user-1', last_active_at: '2026-01-01T00:00:00.000Z' })];

    await callRefreshPresence(component);

    expect(component.teamMembers[0].profile.last_active_at).toBe('2026-01-01T00:00:00.000Z');
  });
});

/** Captures the postgres_changes callback ngOnInit()'s realtime subscription
 *  registers, exposing it as emitChange() — same pattern as
 *  tasks.component.spec.ts/manage-tasks.component.spec.ts. Counts `tasks`
 *  table `.select()` calls (one per loadTeamTasks() call) to prove a burst
 *  of events collapses into a single reload. `profiles`/`organizations`
 *  (ngOnInit's other queries) resolve to empty/null and aren't counted. */
function createRealtimeCapturingSupabaseService() {
  let capturedCallback: ((payload: unknown) => void) | null = null;
  let tasksSelectCount = 0;

  function builder(table: string) {
    const b: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
    };
    for (const method of ['select', 'eq', 'order', 'delete', 'single']) {
      b[method] = () => {
        if (table === 'tasks' && method === 'select') {
          tasksSelectCount++;
        }
        return b;
      };
    }
    return b;
  }

  const channel: Record<string, unknown> = {
    on: (_type: string, _filter: unknown, callback: (payload: unknown) => void) => {
      capturedCallback = callback;
      return channel;
    },
    subscribe: () => channel,
  };

  const service = {
    client: {
      from: (table: string) => builder(table),
      channel: () => channel,
      removeChannel: async () => ({ status: 'ok' }),
    }
  } as unknown as SupabaseService;

  return {
    service,
    emitChange: (payload: unknown) => capturedCallback?.(payload),
    getTasksSelectCount: () => tasksSelectCount,
  };
}

describe('ManageTeamComponent realtime updates', () => {
  function configure(service: SupabaseService) {
    TestBed.configureTestingModule({
      imports: [ManageTeamComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        { provide: SupabaseService, useValue: service }
      ]
    });
    return TestBed.createComponent(ManageTeamComponent);
  }

  // discardPeriodicTasks() at the end of each test — ngOnInit() also starts
  // the pre-existing, deliberately-untouched presence-poll setInterval (see
  // its own comment), which fakeAsync() would otherwise complain is still
  // pending when the test ends. Same pattern header.component.spec.ts
  // already uses for its own interval.
  it('collapses a burst of postgres_changes events into a single reload, 300ms after the last one', fakeAsync(() => {
    const { service, emitChange, getTasksSelectCount } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    fixture.detectChanges();
    tick();

    // ngOnInit's own initial loadTeamTasks() call.
    expect(getTasksSelectCount()).toBe(1);

    emitChange({ eventType: 'UPDATE', new: { id: 'task-1' }, old: {} });
    emitChange({ eventType: 'UPDATE', new: { id: 'task-1' }, old: {} });
    emitChange({ eventType: 'UPDATE', new: { id: 'task-1' }, old: {} });

    tick(299);
    expect(getTasksSelectCount()).toBe(1); // still within the debounce window

    tick(1);
    expect(getTasksSelectCount()).toBe(2); // exactly one more loadTeamTasks() call, not three

    discardPeriodicTasks();
  }));

  it('cancels a pending debounced reload and removes the channel on destroy, without disturbing the presence-poll interval', fakeAsync(() => {
    const { service, emitChange, getTasksSelectCount } = createRealtimeCapturingSupabaseService();
    const removeChannelSpy = spyOn(service.client, 'removeChannel').and.callThrough();
    const fixture = configure(service);
    fixture.detectChanges();
    tick();

    emitChange({ eventType: 'UPDATE', new: { id: 'task-1' }, old: {} });
    fixture.destroy();
    tick(300);

    expect(removeChannelSpy).toHaveBeenCalled();
    expect(getTasksSelectCount()).toBe(1); // the debounced reload never fired post-destroy

    discardPeriodicTasks();
  }));
});
