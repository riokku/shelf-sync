import { Component, OnInit, inject } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { SupabaseService } from '../core/supabase.service';
import { AuthService, Profile } from '../core/auth.service';
import { Database } from '../shared/models/database.types';
import { TaskDetailModalComponent } from '../shared/components/task-detail-modal/task-detail-modal.component';
import { TaskCardComponent } from './task-card/task-card.component';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { EmptyStateComponent } from '../shared/components/empty-state/empty-state.component';
import { resolveProfileName } from '../shared/utils/profile-label';

type Task = Database['public']['Tables']['tasks']['Row'];

@Component({
  selector: 'app-tasks',
  imports: [MatProgressSpinnerModule, TaskCardComponent, BreadcrumbsComponent, EmptyStateComponent],
  templateUrl: './tasks.component.html',
  styleUrl: './tasks.component.scss',
})
export class TasksComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);

  private currentUserId: string | null = null;
  private orgProfiles: Profile[] = [];

  tasks: Task[] = [];
  /** Tasks someone else has offered to hand off to the current user — kept
   *  separate from `tasks` since they don't belong to this user's queue
   *  (and don't count toward assigned_to) until accepted. */
  incomingTransfers: Task[] = [];
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
    this.currentUserId = session.user.id;

    const { data: profiles } = await this.supabase.from('profiles').select('*').order('full_name');
    this.orgProfiles = profiles ?? [];

    await this.loadTasks();
  }

  private async loadTasks() {
    if (!this.currentUserId) {
      return;
    }

    this.isLoading = true;

    const [{ data: myTasks }, { data: incoming }] = await Promise.all([
      this.supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', this.currentUserId)
        .order('due_date', { ascending: true, nullsFirst: false }),
      this.supabase
        .from('tasks')
        .select('*')
        .eq('pending_transfer_to', this.currentUserId)
        .order('created_at', { ascending: false })
    ]);

    this.tasks = myTasks ?? [];
    this.incomingTransfers = incoming ?? [];
    this.isLoading = false;
  }

  transferSenderLabel(task: Task): string {
    return resolveProfileName(task.assigned_to, this.orgProfiles) || 'Unknown user';
  }

  pendingTransferToLabel(task: Task): string | null {
    return task.pending_transfer_to
      ? (resolveProfileName(task.pending_transfer_to, this.orgProfiles) || 'someone')
      : null;
  }

  openTask(task: Task) {
    const dialogRef = this.dialog.open(TaskDetailModalComponent, {
      data: task,
      width: 'clamp(75%, 25rem, 60%)',
      panelClass: 'task-details-dialog'
    });

    // A transfer request/response can move a task in or out of either list
    // (incoming -> mine on accept, out of both on decline, etc.), so a full
    // reload is simpler and more robust here than patching one array in place.
    dialogRef.afterClosed().subscribe((updated: Task | undefined) => {
      if (!updated) {
        return;
      }
      this.loadTasks();
    });
  }
}
