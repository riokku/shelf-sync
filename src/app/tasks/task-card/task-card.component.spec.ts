import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TaskCardComponent } from './task-card.component';
import { createTestTask } from '../../testing/fakes';

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
