import { ComponentFixture, TestBed } from '@angular/core/testing';
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
