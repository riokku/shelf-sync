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
  @Output() open = new EventEmitter<Task>();

  readonly statusLabels = TASK_STATUS_LABELS;

  get isOverdue(): boolean {
    return !!this.task.due_date
      && this.task.status !== 'done'
      && this.task.due_date < getTodayIsoDate();
  }
}
