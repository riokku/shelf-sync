import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';

import { TasksComponent } from './tasks.component';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { TaskDetailModalComponent } from '../shared/components/task-detail-modal/task-detail-modal.component';
import {
  createFakeActivatedRoute,
  createFakeAuthService,
  createFakeProfile,
  createFakeSupabaseService,
  createTestTask
} from '../testing/fakes';

describe('TasksComponent', () => {
  let component: TasksComponent;
  let fixture: ComponentFixture<TasksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TasksComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TasksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

/** Covers tasksBreadcrumbParent's own onClick — see its doc comment for why
 *  clicking "Tasks" in the breadcrumb needs a confirm gate identical to
 *  closeRelatedItem()'s own, since it can skip straight past an
 *  in-progress, unsaved related-item edit in one step. */
describe('TasksComponent closeTaskDetailFromBreadcrumb', () => {
  let component: TasksComponent;
  let fixture: ComponentFixture<TasksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TasksComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TasksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function stubDialog(confirmed: boolean) {
    const dialog = (component as unknown as {
      dialog: { open: (...args: unknown[]) => { afterClosed: () => { subscribe: (cb: (v: boolean) => void) => void } } };
    }).dialog;
    return spyOn(dialog, 'open').and.returnValue({ afterClosed: () => ({ subscribe: cb => cb(confirmed) }) });
  }

  it('closes directly when not viewing a related item', () => {
    component.selectedTask = createTestTask();
    component.viewingRelatedItem = false;
    const openSpy = stubDialog(true);

    component.closeTaskDetailFromBreadcrumb();

    expect(openSpy).not.toHaveBeenCalled();
    expect(component.selectedTask).toBeNull();
  });

  it('closes directly when viewing a related item with no unsaved changes', () => {
    component.selectedTask = createTestTask();
    component.viewingRelatedItem = true;
    component.taskDetailModal = { hasUnsavedChanges: () => false } as unknown as TaskDetailModalComponent;
    const openSpy = stubDialog(true);

    component.closeTaskDetailFromBreadcrumb();

    expect(openSpy).not.toHaveBeenCalled();
    expect(component.selectedTask).toBeNull();
  });

  it('confirms first when viewing a related item with unsaved changes, and stays put if declined', fakeAsync(() => {
    component.selectedTask = createTestTask();
    component.viewingRelatedItem = true;
    component.taskDetailModal = { hasUnsavedChanges: () => true } as unknown as TaskDetailModalComponent;
    stubDialog(false);

    component.closeTaskDetailFromBreadcrumb();
    tick();

    expect(component.selectedTask).not.toBeNull();
  }));

  it('closes once the user confirms leaving unsaved changes', fakeAsync(() => {
    component.selectedTask = createTestTask();
    component.viewingRelatedItem = true;
    component.taskDetailModal = { hasUnsavedChanges: () => true } as unknown as TaskDetailModalComponent;
    stubDialog(true);

    component.closeTaskDetailFromBreadcrumb();
    tick();

    expect(component.selectedTask).toBeNull();
  }));
});

describe('TasksComponent load errors', () => {
  async function createComponent(supabaseService: SupabaseService) {
    await TestBed.configureTestingModule({
      imports: [TasksComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile()) },
        { provide: SupabaseService, useValue: supabaseService }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(TasksComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('sets loadError instead of silently rendering an empty list when the query fails', async () => {
    const failingSupabase = createFakeSupabaseService({ data: null, error: { message: 'Network error' } });
    const component = await createComponent(failingSupabase);

    expect(component.loadError).toBe('Network error');
    expect(component.isLoading).toBeFalse();
    expect(component.tasks).toEqual([]);
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

/** Covers the ?task=<id> deep link (from TaskDetailModalComponent's "Copy
 *  link" button) — always /tasks first since it's reachable by any
 *  approved member, falling back to /manage/tasks only for a viewer who
 *  can actually see the full org list there. */
describe('TasksComponent ?task= deep link', () => {
  async function createComponent(taskId: string, matchingTasks: unknown[], role: 'staff' | 'manager') {
    await TestBed.configureTestingModule({
      imports: [TasksComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role })) },
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: matchingTasks, error: null }) },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute({ task: taskId }) }
      ]
    }).compileComponents();
    return TestBed.createComponent(TasksComponent);
  }

  it('opens the task directly when it is in this user\'s own list', async () => {
    const task = createTestTask({ id: 'task-1' });
    const fixture = await createComponent('task-1', [task], 'staff');

    fixture.detectChanges();
    await fixture.whenStable();

    // Sets selectedTask directly rather than going through openTask() — see
    // that method's own doc comment — since the URL already has ?task= on
    // it and there's nothing left to navigate.
    expect(fixture.componentInstance.selectedTask).toEqual(jasmine.objectContaining({ id: 'task-1' }));
  });

  it('falls back to /manage/tasks for a manager+ viewer when the task is not in their own list', async () => {
    const fixture = await createComponent('task-2', [], 'manager');
    const navigateSpy = spyOn(TestBed.inject(Router), 'navigate');

    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith(['/manage/tasks'], { queryParams: { task: 'task-2' } });
  });

  it('does not redirect a plain staff member when the task is not in their own list', async () => {
    const fixture = await createComponent('task-3', [], 'staff');
    const navigateSpy = spyOn(TestBed.inject(Router), 'navigate');

    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigateSpy).not.toHaveBeenCalled();
  });
});

/** Captures the postgres_changes callback ngOnInit()'s realtime subscription
 *  registers, exposing it as emitChange() — same pattern as
 *  manage-inventory.component.spec.ts/inventory.component.spec.ts. Rather
 *  than a table-aware fake row, this one just counts how many times the
 *  `tasks` table is queried (once per `.select()` in the chain — loadTasks()
 *  makes two per call, one for `assigned_to`, one for `pending_transfer_to`)
 *  — enough to prove a burst of events collapses into a single reload
 *  without needing to fake realistic row data. `profiles`'s own ngOnInit
 *  query resolves to an empty list and isn't counted. */
function createRealtimeCapturingSupabaseService() {
  let capturedCallback: ((payload: unknown) => void) | null = null;
  let tasksSelectCount = 0;

  function builder(table: string) {
    const b: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
    };
    for (const method of ['select', 'eq', 'order']) {
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

describe('TasksComponent realtime updates', () => {
  function configure(service: SupabaseService) {
    TestBed.configureTestingModule({
      imports: [TasksComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile()) },
        { provide: SupabaseService, useValue: service }
      ]
    });
    return TestBed.createComponent(TasksComponent);
  }

  it('collapses a burst of postgres_changes events into a single reload, 300ms after the last one', fakeAsync(() => {
    const { service, emitChange, getTasksSelectCount } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    fixture.detectChanges();
    tick();

    // ngOnInit's own initial loadTasks() call.
    expect(getTasksSelectCount()).toBe(2);

    emitChange({ eventType: 'UPDATE', new: { id: 'task-1' }, old: {} });
    emitChange({ eventType: 'UPDATE', new: { id: 'task-1' }, old: {} });
    emitChange({ eventType: 'UPDATE', new: { id: 'task-1' }, old: {} });

    tick(299);
    expect(getTasksSelectCount()).toBe(2); // still within the debounce window

    tick(1);
    expect(getTasksSelectCount()).toBe(4); // exactly one more loadTasks() call (2 selects), not three
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
    expect(getTasksSelectCount()).toBe(2); // the debounced reload never fired post-destroy
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
