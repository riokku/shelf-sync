import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { TaskDetailModalComponent } from './task-detail-modal.component';
import { AuthService } from '../../../core/auth.service';
import { createFakeAuthService, createFakeMatDialogRef, createTestTask } from '../../../testing/fakes';

describe('TaskDetailModalComponent', () => {
  let component: TaskDetailModalComponent;
  let fixture: ComponentFixture<TaskDetailModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskDetailModalComponent],
      providers: [
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
        { provide: MAT_DIALOG_DATA, useValue: createTestTask() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TaskDetailModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

/** Covers the collapsed-by-default transfer picker — a plain "Transfer"
 *  button until clicked, rather than the recipient select sitting
 *  permanently open next to the status field. */
describe('TaskDetailModalComponent transfer picker', () => {
  let component: TaskDetailModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskDetailModalComponent],
      providers: [
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
        { provide: MAT_DIALOG_DATA, useValue: createTestTask() }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(TaskDetailModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts collapsed', () => {
    expect(component.isPickingTransferTarget).toBeFalse();
  });

  it('startTransfer() expands the picker', () => {
    component.startTransfer();
    expect(component.isPickingTransferTarget).toBeTrue();
  });

  it('cancelPickingTransferTarget() collapses it again and clears any picked target/error', () => {
    component.startTransfer();
    component.transferTarget = 'user-2';
    component.transferError = 'something went wrong';

    component.cancelPickingTransferTarget();

    expect(component.isPickingTransferTarget).toBeFalse();
    expect(component.transferTarget).toBeNull();
    expect(component.transferError).toBeNull();
  });
});

/** Same isOverdue rule TaskCardComponent/ManageTasksComponent already
 *  badge their list rows with, now also flagged here once the dialog
 *  itself is open. */
describe('TaskDetailModalComponent isOverdue', () => {
  async function createComponentWithTask(overrides: Parameters<typeof createTestTask>[0]) {
    await TestBed.configureTestingModule({
      imports: [TaskDetailModalComponent],
      providers: [
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
        { provide: MAT_DIALOG_DATA, useValue: createTestTask(overrides) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(TaskDetailModalComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('is true for a past due date on a task that is not done', async () => {
    const component = await createComponentWithTask({ due_date: '2020-01-01', status: 'todo' });
    expect(component.isOverdue).toBeTrue();
  });

  it('is false once the task is done, even with a past due date', async () => {
    const component = await createComponentWithTask({ due_date: '2020-01-01', status: 'done' });
    expect(component.isOverdue).toBeFalse();
  });

  it('is false with no due date set', async () => {
    const component = await createComponentWithTask({ due_date: null, status: 'todo' });
    expect(component.isOverdue).toBeFalse();
  });

  it('is false for a future due date', async () => {
    const component = await createComponentWithTask({ due_date: '2099-01-01', status: 'todo' });
    expect(component.isOverdue).toBeFalse();
  });
});
