import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';

import { TasksComponent } from './tasks.component';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
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
    const openTaskSpy = spyOn(fixture.componentInstance, 'openTask');

    fixture.detectChanges();
    await fixture.whenStable();

    expect(openTaskSpy).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'task-1' }));
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
});
