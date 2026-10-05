import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { ManageTeamComponent } from './manage-team.component';
import { AuthService, Profile } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { BillingService } from '../../core/billing.service';
import { createFakeActivatedRoute, createFakeAuthService, createFakeBillingService, createFakeProfile, createFakeSupabaseService } from '../../testing/fakes';

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

  describe('?search= deep link (landed on from the command palette\'s "People" results)', () => {
    it('prefills teamSearchTerm from the URL on init', async () => {
      await TestBed.resetTestingModule().configureTestingModule({
        imports: [ManageTeamComponent],
        providers: [
          provideRouter([]),
          { provide: ActivatedRoute, useValue: createFakeActivatedRoute({ search: 'Alice Admin' }) },
          { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
          { provide: SupabaseService, useValue: createFakeSupabaseService() }
        ]
      }).compileComponents();

      const searchFixture = TestBed.createComponent(ManageTeamComponent);
      searchFixture.detectChanges();

      expect(searchFixture.componentInstance.teamSearchTerm).toBe('Alice Admin');
    });

    it('leaves teamSearchTerm empty when there is no ?search= param', () => {
      // The default beforeEach fixture above already has no ?search= param.
      expect(component.teamSearchTerm).toBe('');
    });
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

  describe('bulk selection (pending join requests)', () => {
    beforeEach(() => {
      component.pendingMembers = [
        createFakeProfile({ id: '1' }),
        createFakeProfile({ id: '2' })
      ];
    });

    it('togglePendingSelection() adds and removes an id', () => {
      component.togglePendingSelection('1', true);
      expect(component.isPendingSelected('1')).toBeTrue();

      component.togglePendingSelection('1', false);
      expect(component.isPendingSelected('1')).toBeFalse();
    });

    it('toggleSelectAllPending() selects/deselects every pending request', () => {
      component.toggleSelectAllPending(true);
      expect([...component.selectedPendingMemberIds].sort()).toEqual(['1', '2']);

      component.toggleSelectAllPending(false);
      expect(component.selectedPendingMemberIds.size).toBe(0);
    });

    it('clearPendingSelection() resets selection and any membership error', () => {
      component.togglePendingSelection('1', true);
      component.membershipError = 'something went wrong';

      component.clearPendingSelection();

      expect(component.selectedPendingMemberIds.size).toBe(0);
      expect(component.membershipError).toBeNull();
    });
  });
});

function memberOf(profile: Partial<Profile>) {
  return { profile: createFakeProfile(profile), tasks: [] };
}

describe('ManageTeamComponent load errors', () => {
  // fakeAsync + tick()/discardPeriodicTasks(), not whenStable() — ngOnInit
  // starts a persistent 30s presence-poll setInterval (see its own comment
  // a few lines up), which under real time makes the zone permanently
  // "unstable" and whenStable() never resolves; same reasoning
  // refreshPresence()'s own describe block below already established.
  function createComponent(supabaseService: SupabaseService): ManageTeamComponent {
    TestBed.configureTestingModule({
      imports: [ManageTeamComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        { provide: SupabaseService, useValue: supabaseService }
      ]
    });

    const fixture = TestBed.createComponent(ManageTeamComponent);
    fixture.detectChanges();
    tick();
    return fixture.componentInstance;
  }

  it('sets loadError instead of silently rendering an empty team when the profiles query fails', fakeAsync(() => {
    const failingSupabase = createFakeSupabaseService({ data: null, error: { message: 'Network error' } });
    const component = createComponent(failingSupabase);

    expect(component.loadError).toBe('Network error');
    expect(component.teamMembers).toEqual([]);
    discardPeriodicTasks();
  }));

  it('retryLoad() clears loadError on a successful retry', fakeAsync(() => {
    const failingSupabase = createFakeSupabaseService({ data: null, error: { message: 'Network error' } });
    const component = createComponent(failingSupabase);
    expect(component.loadError).toBe('Network error');

    (component as unknown as { supabase: SupabaseService['client'] }).supabase =
      createFakeSupabaseService({ data: [], error: null }).client;

    component.retryLoad();
    tick();

    expect(component.loadError).toBeNull();
    discardPeriodicTasks();
  }));
});

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
    // maybeSingle is here for BillingService.load()'s own subscriptions
    // lookup (ngOnInit's Promise.all now includes it alongside
    // loadTeamTasks()/loadInviteLink()) — resolves via the generic `then`
    // below to { data: [], error: null }, same as every other table this
    // fake answers, which BillingService.load() treats as "no row yet",
    // i.e. Free tier.
    for (const method of ['select', 'eq', 'order', 'delete', 'single', 'maybeSingle']) {
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

  it('flashes a changed task only once the debounced reload actually reflects it, then clears the flash after it fades', fakeAsync(() => {
    const { service, emitChange } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    expect(component.isFlashing('task-1')).toBeFalse();

    emitChange({ eventType: 'UPDATE', new: { id: 'task-1' }, old: {} });
    // Not yet — still within the 300ms debounce window, so the reload (and
    // therefore the flash) hasn't happened yet.
    expect(component.isFlashing('task-1')).toBeFalse();

    tick(300);
    expect(component.isFlashing('task-1')).toBeTrue();

    tick(1500);
    expect(component.isFlashing('task-1')).toBeFalse();

    discardPeriodicTasks();
  }));

  it('does not flash a deleted task — there is nothing left to show it on', fakeAsync(() => {
    const { service, emitChange } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    emitChange({ eventType: 'DELETE', new: {}, old: { id: 'task-1' } });
    tick(300);

    expect(component.isFlashing('task-1')).toBeFalse();

    discardPeriodicTasks();
  }));
});

/** A Supabase fake purpose-built for the bulk approve/deny tests below —
 *  tracks every admin_approve_member RPC call and every
 *  profiles.delete().eq('id', id) call, and lets a test mark specific ids
 *  as failing to cover the partial-failure tally path. Everything else
 *  (profiles/tasks loads, the activity-log insert) resolves as a generic
 *  empty success. */
function createBulkMembershipFakeSupabaseService(failingIds: Set<string> = new Set<string>()) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const deleteCalls: string[] = [];

  function queryBuilder() {
    let capturedId: string | undefined;
    let isDelete = false;
    const b: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => {
        if (isDelete && capturedId && failingIds.has(capturedId)) {
          resolve({ error: { message: 'Delete failed' } });
        } else {
          resolve({ data: [], error: null });
        }
      },
    };
    for (const method of ['select', 'order', 'insert', 'single', 'maybeSingle']) {
      b[method] = () => b;
    }
    b['delete'] = () => {
      isDelete = true;
      return b;
    };
    b['eq'] = (column: string, value: string) => {
      if (column === 'id') {
        capturedId = value;
        if (isDelete) {
          deleteCalls.push(value);
        }
      }
      return b;
    };
    return b;
  }

  // Inert — ngOnInit() also opens a realtime subscription; this just needs
  // to exist so that call doesn't throw, same stub shape used elsewhere in
  // this app's specs for a component that doesn't otherwise care about it.
  const channel: Record<string, unknown> = {
    on: () => channel,
    subscribe: () => channel,
  };

  const service = {
    client: {
      from: () => queryBuilder(),
      rpc: (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        const targetId = args['target_id'] as string;
        return {
          then: (resolve: (value: unknown) => void) => {
            resolve(failingIds.has(targetId) ? { error: { message: 'Approve failed' } } : { error: null });
          }
        };
      },
      channel: () => channel,
      removeChannel: async () => ({ status: 'ok' }),
    }
  } as unknown as SupabaseService;

  return { service, rpcCalls, deleteCalls };
}

describe('ManageTeamComponent bulk membership actions', () => {
  // Plain async/await, not fakeAsync — ngOnInit()'s presence-poll
  // setInterval is left running (harmless outside fakeAsync, same as the
  // outer plain describe('ManageTeamComponent', ...) block's own tests),
  // and mixing fakeAsync with the real async TestBed compilation these
  // helpers need proved unreliable (discardPeriodicTasks() requires the
  // fakeAsync zone still be active, which a real await inside the same
  // test can quietly break out of).
  //
  // Deliberately no `await fixture.whenStable()` here either — that live
  // setInterval counts as a pending NgZone macrotask forever, so
  // whenStable() would just hang. Not needed anyway: every test below
  // overwrites pendingMembers/selectedPendingMemberIds itself right after
  // calling this, so it doesn't depend on ngOnInit's own initial loads
  // having already settled.
  async function createComponent(supabaseService: SupabaseService) {
    await TestBed.configureTestingModule({
      imports: [ManageTeamComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        { provide: SupabaseService, useValue: supabaseService }
      ]
    }).compileComponents();

    const localFixture = TestBed.createComponent(ManageTeamComponent);
    localFixture.detectChanges();
    return localFixture.componentInstance;
  }

  function callPerformBulkDeny(component: ManageTeamComponent, ids: string[]): Promise<void> {
    return (component as unknown as { performBulkDeny: (ids: string[]) => Promise<void> }).performBulkDeny(ids);
  }

  describe('applyBulkApprove()', () => {
    it('approves every selected pending request and reports success', async () => {
      const { service, rpcCalls } = createBulkMembershipFakeSupabaseService();
      const component = await createComponent(service);
      component.pendingMembers = [createFakeProfile({ id: '1' }), createFakeProfile({ id: '2' })];
      component.selectedPendingMemberIds = new Set(['1', '2']);
      const notificationSuccessSpy = spyOn((component as unknown as { notification: { success: (msg: string) => void } }).notification, 'success');

      await component.applyBulkApprove();

      expect(rpcCalls.length).toBe(2);
      expect(rpcCalls.every(call => call.fn === 'admin_approve_member')).toBeTrue();
      expect(notificationSuccessSpy).toHaveBeenCalledWith('Approved 2 members');
      expect(component.selectedPendingMemberIds.size).toBe(0);
      expect(component.membershipError).toBeNull();
    });

    it('reports a partial failure without losing the successes', async () => {
      const { service } = createBulkMembershipFakeSupabaseService(new Set(['2']));
      const component = await createComponent(service);
      component.pendingMembers = [createFakeProfile({ id: '1' }), createFakeProfile({ id: '2' })];
      component.selectedPendingMemberIds = new Set(['1', '2']);
      const notificationSuccessSpy = spyOn((component as unknown as { notification: { success: (msg: string) => void } }).notification, 'success');

      await component.applyBulkApprove();

      expect(notificationSuccessSpy).toHaveBeenCalledWith('Approved 1 member');
      expect(component.membershipError).toBe("1 of 2 members couldn't be approved.");
    });

    it('does nothing when nothing is selected', async () => {
      const { service, rpcCalls } = createBulkMembershipFakeSupabaseService();
      const component = await createComponent(service);

      await component.applyBulkApprove();

      expect(rpcCalls.length).toBe(0);
    });

    it('is blocked once the org is already at its plan\'s team member limit, without calling the RPC', async () => {
      const { service, rpcCalls } = createBulkMembershipFakeSupabaseService();
      const component = await createComponent(service);
      (component as unknown as { billingService: BillingService }).billingService = createFakeBillingService({
        tier: 'free', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false
      });
      component.teamMembers = Array.from({ length: 3 }, (_, i) => ({ profile: createFakeProfile({ id: `member-${i}` }), tasks: [] }));
      component.pendingMembers = [createFakeProfile({ id: '1' }), createFakeProfile({ id: '2' })];
      component.selectedPendingMemberIds = new Set(['1', '2']);

      await component.applyBulkApprove();

      expect(rpcCalls.length).toBe(0);
      expect(component.membershipError).toContain('team member limit');
    });
  });

  describe('approveMember() plan member limit', () => {
    it('is blocked once the org is already at its plan\'s team member limit (Free: 3), without calling the RPC', async () => {
      const { service, rpcCalls } = createBulkMembershipFakeSupabaseService();
      const component = await createComponent(service);
      (component as unknown as { billingService: BillingService }).billingService = createFakeBillingService({
        tier: 'free', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false
      });
      component.teamMembers = Array.from({ length: 3 }, (_, i) => ({ profile: createFakeProfile({ id: `member-${i}` }), tasks: [] }));

      await component.approveMember(createFakeProfile({ id: 'pending-1' }));

      expect(rpcCalls.length).toBe(0);
      expect(component.membershipError).toContain('team member limit');
    });

    it('does not block approval below the limit', async () => {
      const { service, rpcCalls } = createBulkMembershipFakeSupabaseService();
      const component = await createComponent(service);
      (component as unknown as { billingService: BillingService }).billingService = createFakeBillingService({
        tier: 'free', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false
      });
      component.teamMembers = Array.from({ length: 2 }, (_, i) => ({ profile: createFakeProfile({ id: `member-${i}` }), tasks: [] }));

      await component.approveMember(createFakeProfile({ id: 'pending-1' }));

      expect(rpcCalls.length).toBe(1);
    });
  });

  describe('performBulkDeny() (the actual work applyBulkDeny() runs once confirmed)', () => {
    it('denies every given request and reports success', async () => {
      const { service, deleteCalls } = createBulkMembershipFakeSupabaseService();
      const component = await createComponent(service);
      component.pendingMembers = [createFakeProfile({ id: '1' }), createFakeProfile({ id: '2' })];
      const notificationSuccessSpy = spyOn((component as unknown as { notification: { success: (msg: string) => void } }).notification, 'success');

      await callPerformBulkDeny(component, ['1', '2']);

      expect(deleteCalls.sort()).toEqual(['1', '2']);
      expect(notificationSuccessSpy).toHaveBeenCalledWith('Denied 2 join requests');
      expect(component.selectedPendingMemberIds.size).toBe(0);
    });

    it('reports a partial failure without losing the successes', async () => {
      const { service } = createBulkMembershipFakeSupabaseService(new Set(['2']));
      const component = await createComponent(service);
      component.pendingMembers = [createFakeProfile({ id: '1' }), createFakeProfile({ id: '2' })];
      const notificationSuccessSpy = spyOn((component as unknown as { notification: { success: (msg: string) => void } }).notification, 'success');

      await callPerformBulkDeny(component, ['1', '2']);

      expect(notificationSuccessSpy).toHaveBeenCalledWith('Denied 1 join request');
      expect(component.membershipError).toBe("1 of 2 requests couldn't be denied.");
    });
  });

  describe('applyBulkDeny()', () => {
    it('opens a confirmation dialog scoped to the current selection, and does nothing else yet', async () => {
      const { service, deleteCalls } = createBulkMembershipFakeSupabaseService();
      const component = await createComponent(service);
      component.pendingMembers = [createFakeProfile({ id: '1' }), createFakeProfile({ id: '2' })];
      component.selectedPendingMemberIds = new Set(['1', '2']);
      const dialog = (component as unknown as { dialog: { open: (...args: unknown[]) => { afterClosed: () => { subscribe: () => void } } } }).dialog;
      const openSpy = spyOn(dialog, 'open').and.returnValue({ afterClosed: () => ({ subscribe: () => {} }) });

      component.applyBulkDeny();

      expect(openSpy).toHaveBeenCalledWith(jasmine.any(Function), jasmine.objectContaining({
        data: jasmine.objectContaining({ title: 'Deny 2 join requests?', danger: true })
      }));
      expect(deleteCalls.length).toBe(0);
    });

    it('does nothing when nothing is selected', async () => {
      const { service } = createBulkMembershipFakeSupabaseService();
      const component = await createComponent(service);
      const dialog = (component as unknown as { dialog: { open: (...args: unknown[]) => unknown } }).dialog;
      const openSpy = spyOn(dialog, 'open');

      component.applyBulkDeny();

      expect(openSpy).not.toHaveBeenCalled();
    });
  });
});
