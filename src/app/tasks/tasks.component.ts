import { Component, OnInit, inject } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { SupabaseService } from '../core/supabase.service';
import { AuthService } from '../core/auth.service';
import { Database } from '../shared/models/database.types';
import { TaskDetailModalComponent } from '../shared/components/task-detail-modal/task-detail-modal.component';
import { TaskCardComponent } from './task-card/task-card.component';

type Task = Database['public']['Tables']['tasks']['Row'];

@Component({
  selector: 'app-tasks',
  imports: [MatProgressSpinnerModule, TaskCardComponent],
  templateUrl: './tasks.component.html',
  styleUrl: './tasks.component.scss',
})
export class TasksComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);

  tasks: Task[] = [];
  isLoading = true;

  get incompleteTasks(): Task[] {
    return this.tasks.filter(task => task.status !== 'done');
  }

  get completedTasks(): Task[] {
    return this.tasks.filter(task => task.status === 'done');
  }

  async ngOnInit() {
    const session = await this.authService.getSession();
    if (!session) {
      this.isLoading = false;
      return;
    }

    const { data } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('assigned_to', session.user.id)
      .order('due_date', { ascending: true, nullsFirst: false });

    this.tasks = data ?? [];
    this.isLoading = false;
  }

  openTask(task: Task) {
    const dialogRef = this.dialog.open(TaskDetailModalComponent, {
      data: task,
      width: 'clamp(75%, 25rem, 60%)',
      panelClass: 'task-details-dialog'
    });

    dialogRef.afterClosed().subscribe((updated: Task | undefined) => {
      if (!updated) {
        return;
      }
      this.tasks = this.tasks.map(existing => existing.id === updated.id ? updated : existing);
    });
  }
}
