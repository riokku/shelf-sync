import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroupDirective } from '@angular/forms';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideNativeDateAdapter } from '@angular/material/core';

import { ManageTasksComponent } from './manage-tasks.component';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
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

    component.taskForm.controls.title.setValue('Restock shelves');
    fixture.detectChanges();

    await component.submitTask();

    const directive = (component as unknown as { taskFormDirective: FormGroupDirective }).taskFormDirective;
    expect(directive.submitted).toBeFalse();
    expect(component.taskForm.controls.title.touched).toBeFalse();
    expect(component.taskForm.controls.title.value).toBe('');
    expect(component.taskForm.controls.title.hasError('required')).toBeTrue();
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
