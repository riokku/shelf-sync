import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Database } from '../../shared/models/database.types';
import { TASK_STATUS_LABELS } from '../../shared/models/task-status';
import { getTodayIsoDate } from '../../shared/utils/date';

type Task = Database['public']['Tables']['tasks']['Row'];

@Component({
  selector: 'app-task-card',
  imports: [DatePipe, MatIconModule],
  templateUrl: './task-card.component.html',
  styleUrl: './task-card.component.scss',
})
export class TaskCardComponent {
  @Input({ required: true }) task!: Task;
  /** Set by TasksComponent when this task has an outgoing transfer awaiting
   *  the recipient's response — the sender's own name, resolved from the
   *  org profile list, so the row's badge reads "Transfer pending to X"
   *  without this component needing to fetch profiles itself. */
  @Input() pendingTransferToLabel: string | null = null;
  /** Set instead of the above for cards in the "Incoming transfer requests"
   *  section — the current assignee's name, so the row reads "Offered by X". */
  @Input() transferFromLabel: string | null = null;
  /** Resolved by TasksComponent from task.created_by — passed in rather than
   *  read directly off `task` since the raw column is just a profile id,
   *  same reasoning as the transfer labels above. */
  @Input() createdByLabel: string | null = null;
  /** Set by whichever page is rendering this card when this task was just
   *  patched in by a realtime update (see shared/utils/flash-tracker.ts) —
   *  applies the shared `.realtime-flash` treatment (see
   *  shared/styles/_realtime-flash.scss) to this card's own root element. */
  @Input() flash = false;
  @Output() open = new EventEmitter<Task>();

  readonly statusLabels = TASK_STATUS_LABELS;

  get isOverdue(): boolean {
    return !!this.task.due_date
      && this.task.status !== 'done'
      && this.task.due_date < getTodayIsoDate();
  }

  /** Which colored left-rule this row gets — the same 3-tier convention
   *  HomeComponent.taskRowSeverity() and ManageTasksComponent.taskSeverity()
   *  both use: overdue (red) outranks due-today (amber), which outranks
   *  'ok' (a calm tertiary tone for everything else, including a task with
   *  no due date at all or one that's already done). Replaces what used to
   *  be a solid red pill around the due-date text specifically. */
  get severity(): 'danger' | 'warn' | 'ok' {
    if (this.isOverdue) {
      return 'danger';
    }
    if (this.task.due_date === getTodayIsoDate() && this.task.status !== 'done') {
      return 'warn';
    }
    return 'ok';
  }
}
