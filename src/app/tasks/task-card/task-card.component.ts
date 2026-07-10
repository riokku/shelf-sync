import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { Database } from '../../shared/models/database.types';

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

  readonly statusLabels: Record<Task['status'], string> = {
    todo: 'To do',
    in_progress: 'In progress',
    done: 'Done'
  };
}
