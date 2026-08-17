import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNativeDateAdapter } from '@angular/material/core';

import { ManageTasksComponent } from './manage-tasks.component';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { createFakeAuthService, createFakeSupabaseService, createTestTask } from '../../testing/fakes';

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
