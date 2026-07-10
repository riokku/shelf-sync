import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { Database } from '../../shared/models/database.types';
import { TASK_STATUS_LABELS } from '../../shared/models/task-status';

type Task = Database['public']['Tables']['tasks']['Row'];

@Component({
  selector: 'app-task-card',
  imports: [DatePipe, MatCardModule],
  templateUrl: './task-card.component.html',
  styleUrl: './task-card.component.scss',
})
export class TaskCardComponent {
  @Input({ required: true }) task!: Task;
  @Output() open = new EventEmitter<Task>();

  readonly statusLabels = TASK_STATUS_LABELS;
}
