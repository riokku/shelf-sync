import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormGroupDirective } from '@angular/forms';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { provideNativeDateAdapter } from '@angular/material/core';

import { ManageTasksComponent } from './manage-tasks.component';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { NotificationService } from '../../core/notification.service';
import { createFakeActivatedRoute, createFakeAuthService, createFakeProfile, createFakeSupabaseService, createTestTask } from '../../testing/fakes';

describe('ManageTasksComponent', () => {
  let component: ManageTasksComponent;
  let fixture: ComponentFixture<ManageTasksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageTasksComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        // ngOnInit loads profiles/tasks/related-items on construction —
        // faked so this hits nothing real, same reasoning as every other spec.
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageTasksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('setViewMode() updates viewMode and reflects it in the URL as ?tab=, without adding a history entry', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate');

    component.setViewMode('all');

    expect(component.viewMode).toBe('all');
    expect(navigateSpy).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { tab: 'all' },
      queryParamsHandling: 'merge',
      replaceUrl: true
    }));
  });

  describe('filteredAllTasks', () => {
    beforeEach(() => {
      component.allTasks = [
        createTestTask({ id: 'task-1', title: 'Restock shelves', status: 'todo', assigned_to: 'user-1', due_date: '2026-01-10' }),
        createTestTask({ id: 'task-2', title: 'Order supplies', status: 'in_progress', assigned_to: 'user-2', due_date: '2026-02-01' }),
        createTestTask({ id: 'task-3', title: 'Audit inventory', status: 'done', assigned_to: 'user-1', due_date: null })
      ];
    });

    it('returns every task with no filters applied', () => {
      expect(component.filteredAllTasks.length).toBe(3);
    });

    it('filters by search term against title', () => {
      component.taskFilterSearch = 'restock';
      expect(component.filteredAllTasks.map(t => t.id)).toEqual(['task-1']);
    });

    it('filters by search term against id', () => {
      component.taskFilterSearch = 'task-2';
      expect(component.filteredAllTasks.map(t => t.id)).toEqual(['task-2']);
    });

    it('filters by assignee', () => {
      component.taskFilterAssignee = 'user-1';
      expect(component.filteredAllTasks.map(t => t.id)).toEqual(['task-1', 'task-3']);
    });

    it('filters by status', () => {
      component.taskFilterStatus = 'done';
      expect(component.filteredAllTasks.map(t => t.id)).toEqual(['task-3']);
    });

    it('filters by due-before date, excluding tasks with no due date', () => {
      component.taskFilterDueBefore = new Date(2026, 0, 15);
      expect(component.filteredAllTasks.map(t => t.id)).toEqual(['task-1']);
    });

    it('combines filters with AND semantics', () => {
      component.taskFilterAssignee = 'user-1';
      component.taskFilterStatus = 'todo';
      expect(component.filteredAllTasks.map(t => t.id)).toEqual(['task-1']);
    });
  });

  describe('hasActiveTaskFilters / clearTaskFilters', () => {
    it('is false with no filters set', () => {
      expect(component.hasActiveTaskFilters).toBe(false);
    });

    it('is true when any single filter is set', () => {
      component.taskFilterSearch = 'restock';
      expect(component.hasActiveTaskFilters).toBe(true);
    });

    it('clearTaskFilters resets every filter field', () => {
      component.taskFilterSearch = 'restock';
      component.taskFilterAssignee = 'user-1';
      component.taskFilterStatus = 'done';
      component.taskFilterDueBefore = new Date(2026, 0, 15);

      component.clearTaskFilters();

      expect(component.taskFilterSearch).toBe('');
      expect(component.taskFilterAssignee).toBeNull();
      expect(component.taskFilterStatus).toBeNull();
      expect(component.taskFilterDueBefore).toBeNull();
      expect(component.hasActiveTaskFilters).toBe(false);
    });
  });

  describe('filteredInventoryItemsForTask', () => {
    beforeEach(() => {
      (component as unknown as { relatedItemOptions: { id: string; name: string }[] }).relatedItemOptions = [
        { id: 'item-1', name: 'Cordless Drill' },
        { id: 'item-2', name: 'Safety Goggles' }
      ];
    });

    it('returns every option when the search control is empty', () => {
      expect(component.filteredInventoryItemsForTask.length).toBe(2);
    });

    it('filters by name substring, case-insensitively', () => {
      component.relatedItemSearchControl.setValue('drill');
      expect(component.filteredInventoryItemsForTask.map(item => item.id)).toEqual(['item-1']);
    });

    it('filters by id substring', () => {
      component.relatedItemSearchControl.setValue('item-2');
      expect(component.filteredInventoryItemsForTask.map(item => item.id)).toEqual(['item-2']);
    });
  });

  describe('bulk selection', () => {
    beforeEach(() => {
      component.allTasks = [
        createTestTask({ id: '1', title: 'Restock shelves' }),
        createTestTask({ id: '2', title: 'Order supplies' })
      ];
    });

    it('defaults to off', () => {
      expect(component.bulkEditEnabled).toBeFalse();
    });

    it('toggleBulkEdit(true) turns it on without touching an existing selection', () => {
      component.toggleTaskSelection('1', true);

      component.toggleBulkEdit(true);

      expect(component.bulkEditEnabled).toBeTrue();
      expect(component.isTaskSelected('1')).toBeTrue();
    });

    it('toggleBulkEdit(false) turns it off and clears selection, status value, and any bulk error', () => {
      component.toggleBulkEdit(true);
      component.toggleTaskSelection('1', true);
      component.bulkStatusValue = 'done';
      component.bulkActionError = 'something went wrong';

      component.toggleBulkEdit(false);

      expect(component.bulkEditEnabled).toBeFalse();
      expect(component.selectedTaskIds.size).toBe(0);
      expect(component.bulkStatusValue).toBeNull();
      expect(component.bulkActionError).toBeNull();
    });

    it('toggleTaskSelection() adds and removes an id', () => {
      component.toggleTaskSelection('1', true);
      expect(component.isTaskSelected('1')).toBeTrue();

      component.toggleTaskSelection('1', false);
      expect(component.isTaskSelected('1')).toBeFalse();
    });

    it('toggleSelectAllFiltered() selects/deselects every currently-filtered task', () => {
      component.toggleSelectAllFiltered(true);
      expect([...component.selectedTaskIds].sort()).toEqual(['1', '2']);

      component.toggleSelectAllFiltered(false);
      expect(component.selectedTaskIds.size).toBe(0);
    });

    it('clearTaskSelection() resets selection, status value, and any bulk error', () => {
      component.toggleTaskSelection('1', true);
      component.bulkStatusValue = 'done';
      component.bulkActionError = 'something went wrong';

      component.clearTaskSelection();

      expect(component.selectedTaskIds.size).toBe(0);
      expect(component.bulkStatusValue).toBeNull();
      expect(component.bulkActionError).toBeNull();
    });

    describe('selectedVisibleTaskIds', () => {
      it('matches selectedTaskIds when nothing is filtered out', () => {
        component.toggleSelectAllFiltered(true);
        expect(component.selectedVisibleTaskIds.size).toBe(2);
      });

      // The one case this getter exists for: a task selected before a
      // filter change that hides it stays in selectedTaskIds (so it
      // reappears if the filter is cleared again) but drops out of the
      // *visible* count the toolbar and bulk actions actually use.
      it('excludes a selected task that a filter has since hidden', () => {
        component.toggleTaskSelection('1', true);
        component.toggleTaskSelection('2', true);

        component.taskFilterSearch = 'restock';

        expect(component.selectedTaskIds.size).toBe(2);
        expect([...component.selectedVisibleTaskIds]).toEqual(['1']);
      });
    });
  });

});

describe('ManageTasksComponent submitTask() success', () => {
  // Regression test for a bug where, after a successful submit, the
  // freshly-reset create-task form immediately showed "Title is required"
  // even though every field was blank and untouched. FormGroup.reset()
  // (what submitTask() used to call directly) only clears each control's
  // value/dirty/touched state — it doesn't know about the *directive's*
  // own `submitted` flag, which Material's default ErrorStateMatcher also
  // treats as "show errors" regardless of touched. The fix routes the
  // reset through the FormGroupDirective (#taskFormDirective="ngForm" in
  // the template) via resetForm(), which clears `submitted` too.
  it('clears the FormGroupDirective\'s submitted flag, not just the FormGroup', async () => {
    await TestBed.configureTestingModule({
      imports: [ManageTasksComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile()) },
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], error: null }) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageTasksComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    // Success is surfaced as a toast rather than inline text under the
    // form (see NotificationService) — spied here to confirm it still
    // fires now that submitTask() routes the reset through resetForm().
    const notificationSuccessSpy = spyOn((component as unknown as { notification: NotificationService }).notification, 'success');

    component.taskForm.controls.title.setValue('Restock shelves');
    fixture.detectChanges();

    await component.submitTask();

    const directive = (component as unknown as { taskFormDirective: FormGroupDirective }).taskFormDirective;
    expect(directive.submitted).toBeFalse();
    expect(component.taskForm.controls.title.touched).toBeFalse();
    expect(component.taskForm.controls.title.value).toBe('');
    expect(component.taskForm.controls.title.hasError('required')).toBeTrue();
    expect(notificationSuccessSpy).toHaveBeenCalledWith('Task created');
  });
});

/** Covers reading the active tab back out of ?tab= on load — mirrors
 *  SettingsComponent's own ?tab= spec coverage. */
describe('ManageTasksComponent ?tab= handling', () => {
  async function createWithTab(tab: string | undefined): Promise<ManageTasksComponent> {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [ManageTasksComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService() },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute(tab ? { tab } : {}) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageTasksComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('opens directly to the tab named in ?tab= when it names a real tab', async () => {
    expect((await createWithTab('all')).viewMode).toBe('all');
  });

  it('falls back to the default tab when ?tab= is missing or not a real tab', async () => {
    expect((await createWithTab(undefined)).viewMode).toBe('create');
    expect((await createWithTab('bogus')).viewMode).toBe('create');
  });

  it('a ?task= deep link still wins over ?tab=, since a deep-linked task always lives on "All tasks"', async () => {
    const task = createTestTask({ id: 'task-1' });

    await TestBed.configureTestingModule({
      imports: [ManageTasksComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [task], error: null }) },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute({ tab: 'create', task: 'task-1' }) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageTasksComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.viewMode).toBe('all');
  });
});

/** Covers the ?task=<id> deep link — either landed on directly or arrived
 *  via TasksComponent's own fallback for a task outside that viewer's
 *  personal list. */
describe('ManageTasksComponent ?task= deep link', () => {
  it('opens the matching task and switches off the create-form default view', async () => {
    const task = createTestTask({ id: 'task-1' });

    await TestBed.configureTestingModule({
      imports: [ManageTasksComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [task], error: null }) },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute({ task: 'task-1' }) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageTasksComponent);
    const openTaskDetailSpy = spyOn(fixture.componentInstance, 'openTaskDetail');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(openTaskDetailSpy).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'task-1' }));
    expect(fixture.componentInstance.viewMode).toBe('all');
  });

  it('does nothing when no task matches the id', async () => {
    await TestBed.configureTestingModule({
      imports: [ManageTasksComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], error: null }) },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute({ task: 'nonexistent' }) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ManageTasksComponent);
    const openTaskDetailSpy = spyOn(fixture.componentInstance, 'openTaskDetail');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(openTaskDetailSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.viewMode).toBe('create');
  });
});

/** Captures the postgres_changes callback ngOnInit()'s realtime subscription
 *  registers, exposing it as emitChange() — same pattern as
 *  tasks.component.spec.ts. Counts `tasks` table `.select()` calls (one per
 *  loadTasks() call) to prove a burst of events collapses into a single
 *  reload, without needing to fake realistic row data. `profiles`/
 *  `inventory_items` (ngOnInit's other two queries) resolve to empty lists
 *  and aren't counted. */
function createRealtimeCapturingSupabaseService() {
  let capturedCallback: ((payload: unknown) => void) | null = null;
  let tasksSelectCount = 0;

  function builder(table: string) {
    const b: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
    };
    for (const method of ['select', 'eq', 'order', 'delete', 'insert']) {
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

describe('ManageTasksComponent realtime updates', () => {
  function configure(service: SupabaseService) {
    TestBed.configureTestingModule({
      imports: [ManageTasksComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: service }
      ]
    });
    return TestBed.createComponent(ManageTasksComponent);
  }

  it('collapses a burst of postgres_changes events into a single reload, 300ms after the last one', fakeAsync(() => {
    const { service, emitChange, getTasksSelectCount } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    fixture.detectChanges();
    tick();

    // ngOnInit's own initial loadTasks() call.
    expect(getTasksSelectCount()).toBe(1);

    emitChange({ eventType: 'UPDATE', new: { id: 'task-1' }, old: {} });
    emitChange({ eventType: 'UPDATE', new: { id: 'task-1' }, old: {} });
    emitChange({ eventType: 'UPDATE', new: { id: 'task-1' }, old: {} });

    tick(299);
    expect(getTasksSelectCount()).toBe(1); // still within the debounce window

    tick(1);
    expect(getTasksSelectCount()).toBe(2); // exactly one more loadTasks() call, not three
  }));

  it('cancels a pending debounced reload and removes the channel on destroy', fakeAsync(() => {
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
  }));
});

/** A Supabase fake purpose-built for the bulk status-change/delete tests
 *  below — tracks every update_task_status RPC call and every
 *  tasks.delete().eq('id', id) call, and lets a test mark specific ids as
 *  failing to cover the partial-failure tally path. Everything else
 *  (profiles/tasks/related-items loads) resolves as a generic empty
 *  success. */
function createBulkTaskActionFakeSupabaseService(failingIds: Set<string> = new Set<string>()) {
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
    for (const method of ['select', 'order', 'insert']) {
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

  const service = {
    client: {
      from: () => queryBuilder(),
      rpc: (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        const taskId = args['task_id'] as string;
        return {
          then: (resolve: (value: unknown) => void) => {
            resolve(failingIds.has(taskId) ? { error: { message: 'Status update failed' } } : { error: null });
          }
        };
      }
    }
  } as unknown as SupabaseService;

  return { service, rpcCalls, deleteCalls };
}

describe('ManageTasksComponent bulk actions', () => {
  async function createComponent(supabaseService: SupabaseService) {
    await TestBed.configureTestingModule({
      imports: [ManageTasksComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile()) },
        { provide: SupabaseService, useValue: supabaseService }
      ]
    }).compileComponents();

    const localFixture = TestBed.createComponent(ManageTasksComponent);
    localFixture.detectChanges();
    await localFixture.whenStable();
    return localFixture.componentInstance;
  }

  function callPerformBulkDelete(component: ManageTasksComponent, ids: string[]): Promise<void> {
    return (component as unknown as { performBulkDelete: (ids: string[]) => Promise<void> }).performBulkDelete(ids);
  }

  describe('applyBulkStatusChange()', () => {
    it('does nothing when no status is picked', async () => {
      const { service, rpcCalls } = createBulkTaskActionFakeSupabaseService();
      const component = await createComponent(service);
      component.allTasks = [createTestTask({ id: '1' })];
      component.selectedTaskIds = new Set(['1']);

      await component.applyBulkStatusChange();

      expect(rpcCalls.length).toBe(0);
    });

    it('updates every selected task and reports success', async () => {
      const { service, rpcCalls } = createBulkTaskActionFakeSupabaseService();
      const component = await createComponent(service);
      component.allTasks = [createTestTask({ id: '1' }), createTestTask({ id: '2' })];
      component.selectedTaskIds = new Set(['1', '2']);
      component.bulkStatusValue = 'done';
      const notificationSuccessSpy = spyOn((component as unknown as { notification: { success: (msg: string) => void } }).notification, 'success');

      await component.applyBulkStatusChange();

      expect(rpcCalls.length).toBe(2);
      expect(rpcCalls.every(call => call.fn === 'update_task_status' && call.args['new_status'] === 'done')).toBeTrue();
      expect(notificationSuccessSpy).toHaveBeenCalledWith('Updated 2 tasks');
      expect(component.selectedTaskIds.size).toBe(0);
      expect(component.bulkActionError).toBeNull();
    });

    it('reports a partial failure without losing the successes', async () => {
      const { service } = createBulkTaskActionFakeSupabaseService(new Set(['2']));
      const component = await createComponent(service);
      component.allTasks = [createTestTask({ id: '1' }), createTestTask({ id: '2' })];
      component.selectedTaskIds = new Set(['1', '2']);
      component.bulkStatusValue = 'done';
      const notificationSuccessSpy = spyOn((component as unknown as { notification: { success: (msg: string) => void } }).notification, 'success');

      await component.applyBulkStatusChange();

      expect(notificationSuccessSpy).toHaveBeenCalledWith('Updated 1 task');
      expect(component.bulkActionError).toBe("1 of 2 tasks couldn't be updated.");
    });

    it('only acts on the currently-visible (filtered) selection', async () => {
      const { service, rpcCalls } = createBulkTaskActionFakeSupabaseService();
      const component = await createComponent(service);
      component.allTasks = [
        createTestTask({ id: '1', title: 'Restock shelves' }),
        createTestTask({ id: '2', title: 'Order supplies' })
      ];
      component.selectedTaskIds = new Set(['1', '2']);
      component.taskFilterSearch = 'restock';
      component.bulkStatusValue = 'done';

      await component.applyBulkStatusChange();

      expect(rpcCalls.length).toBe(1);
      expect(rpcCalls[0].args['task_id']).toBe('1');
    });
  });

  describe('applyBulkDelete()', () => {
    it('opens a confirmation dialog scoped to the currently-visible selection, and does nothing else yet', async () => {
      const { service, deleteCalls } = createBulkTaskActionFakeSupabaseService();
      const component = await createComponent(service);
      component.allTasks = [createTestTask({ id: '1' }), createTestTask({ id: '2' })];
      component.selectedTaskIds = new Set(['1', '2']);
      const dialog = (component as unknown as { dialog: { open: (...args: unknown[]) => { afterClosed: () => { subscribe: () => void } } } }).dialog;
      const openSpy = spyOn(dialog, 'open').and.returnValue({ afterClosed: () => ({ subscribe: () => {} }) });

      component.applyBulkDelete();

      expect(openSpy).toHaveBeenCalledWith(jasmine.any(Function), jasmine.objectContaining({
        data: jasmine.objectContaining({ title: 'Delete 2 tasks?', danger: true })
      }));
      expect(deleteCalls.length).toBe(0);
    });

    it('does nothing when there is no visible selection', async () => {
      const { service } = createBulkTaskActionFakeSupabaseService();
      const component = await createComponent(service);
      const dialog = (component as unknown as { dialog: { open: (...args: unknown[]) => unknown } }).dialog;
      const openSpy = spyOn(dialog, 'open');

      component.applyBulkDelete();

      expect(openSpy).not.toHaveBeenCalled();
    });
  });

  describe('performBulkDelete() (the actual work applyBulkDelete() runs once confirmed)', () => {
    it('deletes every given task and reports success', async () => {
      const { service, deleteCalls } = createBulkTaskActionFakeSupabaseService();
      const component = await createComponent(service);
      const notificationSuccessSpy = spyOn((component as unknown as { notification: { success: (msg: string) => void } }).notification, 'success');

      await callPerformBulkDelete(component, ['1', '2']);

      expect(deleteCalls.sort()).toEqual(['1', '2']);
      expect(notificationSuccessSpy).toHaveBeenCalledWith('Deleted 2 tasks');
      expect(component.selectedTaskIds.size).toBe(0);
      expect(component.bulkActionError).toBeNull();
    });

    it('reports a partial failure without losing the successes', async () => {
      const { service } = createBulkTaskActionFakeSupabaseService(new Set(['2']));
      const component = await createComponent(service);
      const notificationSuccessSpy = spyOn((component as unknown as { notification: { success: (msg: string) => void } }).notification, 'success');

      await callPerformBulkDelete(component, ['1', '2']);

      expect(notificationSuccessSpy).toHaveBeenCalledWith('Deleted 1 task');
      expect(component.bulkActionError).toBe("1 of 2 tasks couldn't be deleted.");
    });
  });
});
