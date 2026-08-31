import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { of } from 'rxjs';

import { TaskDetailModalComponent } from './task-detail-modal.component';
import { TransferTaskModalComponent } from '../transfer-task-modal/transfer-task-modal.component';
import { AuthService } from '../../../core/auth.service';
import { SupabaseService } from '../../../core/supabase.service';
import { NotificationService } from '../../../core/notification.service';
import {
  createFakeAuthService,
  createFakeMatDialogRef,
  createFakeProfile,
  createFakeSupabaseService,
  createTestTask
} from '../../../testing/fakes';

function createFakeDialogRef(result: unknown): MatDialogRef<unknown> {
  return { afterClosed: () => of(result) } as unknown as MatDialogRef<unknown>;
}

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

  it('copyLink() copies a /tasks?task=<id> URL, never /manage/tasks — see its own doc comment for why', async () => {
    spyOn(navigator.clipboard, 'writeText').and.resolveTo();

    await component.copyLink();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/tasks?task=task-1`);
    expect(component.linkCopied).toBeTrue();
  });
});

/** Regression test for the crash that shipped with the "inline pages"
 *  conversion — TasksComponent/ManageTasksComponent/ManageTeamComponent all
 *  embed this component with a plain [task] binding and no enclosing
 *  MatDialog, so MAT_DIALOG_DATA/MatDialogRef both resolve to null via their
 *  optional injects (see dialogRef's own doc comment). The describe block
 *  above always provides MAT_DIALOG_DATA, which masked this: selectedStatus
 *  used to read this.task.status in a field initializer, which runs during
 *  construction — *before* Angular applies an @Input() binding — so
 *  this.task was still null and the read threw, leaving the whole detail
 *  view blank (only the caller's own outer heading rendered, since that
 *  lives in the parent's own template). */
describe('TaskDetailModalComponent inline embedding (no enclosing dialog)', () => {
  it('constructs and renders without an enclosing MatDialog, resolving selectedStatus from the [task] input', async () => {
    await TestBed.configureTestingModule({
      imports: [TaskDetailModalComponent],
      providers: [
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService() }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(TaskDetailModalComponent);
    const task = createTestTask({ status: 'in_progress' });
    fixture.componentRef.setInput('task', task);

    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.componentInstance.selectedStatus).toBe('in_progress');
  });
});

describe('TaskDetailModalComponent createdByLabel', () => {
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

  it('resolves the creator\'s name from the loaded org profiles', async () => {
    const component = await createComponentWithTask({ created_by: 'user-2' });
    // ngOnInit's own profiles fetch isn't faked in this suite (see the
    // "should create" describe block above) — set directly so this test
    // isn't at the mercy of whatever that real network call resolves to.
    component.orgProfiles = [createFakeProfile({ id: 'user-2', full_name: 'Jamie Rivera', nickname: null })];

    expect(component.createdByLabel()).toBe('Jamie Rivera');
  });

  it('falls back to "Unknown user" when the creator no longer resolves to a profile', async () => {
    const component = await createComponentWithTask({ created_by: 'user-2' });
    component.orgProfiles = [];

    expect(component.createdByLabel()).toBe('Unknown user');
  });
});

/** Picking a transfer target now happens in its own popup
 *  (TransferTaskModalComponent) rather than an inline panel next to the
 *  status field — startTransfer() just opens it (same pure
 *  data-collector/afterClosed() pattern ManageSuppliersComponent's own
 *  dialog-opening methods already establish), and requestTransfer() makes
 *  the actual RPC call once it closes with a picked id. */
describe('TaskDetailModalComponent transfer popup', () => {
  async function createComponentWithTask(overrides: Parameters<typeof createTestTask>[0] = {}) {
    await TestBed.configureTestingModule({
      imports: [TaskDetailModalComponent],
      providers: [
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService() },
        { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
        { provide: MAT_DIALOG_DATA, useValue: createTestTask(overrides) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(TaskDetailModalComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  it('startTransfer() opens TransferTaskModalComponent with the transferable people', async () => {
    const { component } = await createComponentWithTask();
    component.orgProfiles = [
      createFakeProfile({ id: 'user-1' }),
      createFakeProfile({ id: 'user-2' })
    ];
    const dialog = TestBed.inject(MatDialog);
    const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));

    component.startTransfer();

    expect(openSpy).toHaveBeenCalledWith(
      TransferTaskModalComponent,
      jasmine.objectContaining({ data: { people: component.transferablePeople } })
    );
  });

  it('requests the transfer once the popup closes with a picked target', async () => {
    const { component, fixture } = await createComponentWithTask();
    const dialog = TestBed.inject(MatDialog);
    spyOn(dialog, 'open').and.returnValue(createFakeDialogRef('user-2'));
    const notification = TestBed.inject(NotificationService);
    const successSpy = spyOn(notification, 'success');
    const backSpy = spyOn(component.back, 'emit');

    component.startTransfer();
    // requestTransfer() is fire-and-forget from the afterClosed() subscriber
    // (see startTransfer()'s own doc comment) — let it settle before
    // asserting.
    await fixture.whenStable();

    expect(successSpy).toHaveBeenCalledWith('Transfer requested');
    expect(backSpy).toHaveBeenCalledWith(true);
  });

  it('does not request a transfer when the popup closes without picking anyone (Cancel)', async () => {
    const { component, fixture } = await createComponentWithTask();
    const dialog = TestBed.inject(MatDialog);
    spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));
    const notification = TestBed.inject(NotificationService);
    const successSpy = spyOn(notification, 'success');

    component.startTransfer();
    await fixture.whenStable();

    expect(successSpy).not.toHaveBeenCalled();
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

/** The Save button only ever writes selectedStatus (see saveStatus()'s own
 *  doc comment — this dialog can't edit anything else) — it should be
 *  disabled whenever there's genuinely nothing to save, rather than
 *  inviting a click that just closes the view without writing anything. */
describe('TaskDetailModalComponent Save button', () => {
  async function createComponentWithTask(overrides: Parameters<typeof createTestTask>[0] = {}) {
    await TestBed.configureTestingModule({
      imports: [TaskDetailModalComponent],
      providers: [
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: SupabaseService, useValue: createFakeSupabaseService() },
        { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
        { provide: MAT_DIALOG_DATA, useValue: createTestTask(overrides) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(TaskDetailModalComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  function saveButton(fixture: ComponentFixture<TaskDetailModalComponent>): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.save-status-button');
  }

  it('is disabled as soon as the dialog opens, before any status change', async () => {
    const { fixture } = await createComponentWithTask({ status: 'todo' });

    expect(saveButton(fixture).disabled).toBeTrue();
  });

  it('becomes enabled once the selected status actually differs from the task\'s own', async () => {
    const { component, fixture } = await createComponentWithTask({ status: 'todo' });

    component.selectedStatus = 'in_progress';
    fixture.detectChanges();

    expect(saveButton(fixture).disabled).toBeFalse();
  });

  it('re-disables if the dropdown is set back to the task\'s original status', async () => {
    const { component, fixture } = await createComponentWithTask({ status: 'todo' });
    component.selectedStatus = 'in_progress';
    fixture.detectChanges();
    expect(saveButton(fixture).disabled).toBeFalse();

    component.selectedStatus = 'todo';
    fixture.detectChanges();

    expect(saveButton(fixture).disabled).toBeTrue();
  });

  it('disables again while a save is already in flight', async () => {
    const { component, fixture } = await createComponentWithTask({ status: 'todo' });
    component.selectedStatus = 'in_progress';
    component.isSaving = true;
    fixture.detectChanges();

    expect(saveButton(fixture).disabled).toBeTrue();
  });

  it('saveStatus() stays a no-op (just leaves, no RPC) if ever called with nothing actually changed', async () => {
    const { component } = await createComponentWithTask({ status: 'todo' });
    const backSpy = spyOn(component.back, 'emit');
    const supabase = TestBed.inject(SupabaseService);
    const rpcSpy = spyOn(supabase.client, 'rpc');

    await component.saveStatus();

    expect(rpcSpy).not.toHaveBeenCalled();
    expect(backSpy).toHaveBeenCalledWith(false);
  });
});
