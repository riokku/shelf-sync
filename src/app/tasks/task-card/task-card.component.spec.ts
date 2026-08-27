import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TaskCardComponent } from './task-card.component';
import { createTestTask } from '../../testing/fakes';
import { getTodayIsoDate } from '../../shared/utils/date';

describe('TaskCardComponent', () => {
  let component: TaskCardComponent;
  let fixture: ComponentFixture<TaskCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TaskCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('task', createTestTask());
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('TaskCardComponent severity', () => {
  let fixture: ComponentFixture<TaskCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskCardComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(TaskCardComponent);
  });

  it('is "danger" for an overdue, not-done task', () => {
    fixture.componentRef.setInput('task', createTestTask({ due_date: '2000-01-01', status: 'todo' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.severity).toBe('danger');
  });

  it('is "warn" for a task due exactly today', () => {
    // getTodayIsoDate() (local-time-safe), not `new Date().toISOString()`
    // (UTC-based) — the component's own severity getter compares against
    // getTodayIsoDate() too, and a UTC-vs-local mismatch can silently shift
    // this by a day depending on the runner's timezone/time of day. See
    // date.ts's own doc comment on toIsoDateString() for the same pitfall.
    const today = getTodayIsoDate();
    fixture.componentRef.setInput('task', createTestTask({ due_date: today, status: 'todo' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.severity).toBe('warn');
  });

  it('is "ok" for a task with no due date, a future due date, or a done task', () => {
    fixture.componentRef.setInput('task', createTestTask({ due_date: null }));
    fixture.detectChanges();
    expect(fixture.componentInstance.severity).toBe('ok');

    fixture.componentRef.setInput('task', createTestTask({ due_date: '2099-01-01' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.severity).toBe('ok');

    fixture.componentRef.setInput('task', createTestTask({ due_date: '2000-01-01', status: 'done' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.severity).toBe('ok');
  });
});

describe('TaskCardComponent createdByLabel', () => {
  let fixture: ComponentFixture<TaskCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TaskCardComponent);
    fixture.componentRef.setInput('task', createTestTask());
  });

  it('renders the name in its own column when set', () => {
    fixture.componentRef.setInput('createdByLabel', 'Jamie Rivera');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Jamie Rivera');
  });

  it('renders an empty column when unset (the default)', () => {
    fixture.detectChanges();

    const column = fixture.nativeElement.querySelector('.task-row-created-by') as HTMLElement;
    expect(column.textContent?.trim()).toBe('');
  });
});
