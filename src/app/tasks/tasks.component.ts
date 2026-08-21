import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../core/supabase.service';
import { AuthService, Profile } from '../core/auth.service';
import { Database } from '../shared/models/database.types';
import { TaskDetailModalComponent } from '../shared/components/task-detail-modal/task-detail-modal.component';
import { TaskCardComponent } from './task-card/task-card.component';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { EmptyStateComponent } from '../shared/components/empty-state/empty-state.component';
import { resolveProfileName } from '../shared/utils/profile-label';
import { subscribeToTableChanges } from '../shared/utils/realtime';
import { debounce } from '../shared/utils/debounce';
import { FlashTracker } from '../shared/utils/flash-tracker';

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
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  private currentUserId: string | null = null;
  private orgProfiles: Profile[] = [];
  // Which rows should currently show the brief "someone else just changed
  // this" pulse (see shared/utils/flash-tracker.ts and its own
  // shared/styles/_realtime-flash.scss) — read from the template via
  // isFlashing(task.id). Ids land here as raw postgres_changes events come
  // in (see ngOnInit's subscription below) and get flashed once
  // reloadAndFlashChangedTasks()'s reload actually reflects them, not
  // before — flashing a row before its data has updated would be
  // misleading.
  private flashTracker = new FlashTracker();
  private pendingFlashIds = new Set<string>();

  // Collapses a burst of postgres_changes events (e.g. an accept/decline
  // touching more than one row) into one reload — see debounce()'s own
  // doc comment.
  private readonly debouncedReloadTasks = debounce(() => void this.reloadAndFlashChangedTasks(), 300);

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

    // Supports deep links (?task=<id>), e.g. from TaskDetailModalComponent's
    // "Copy link" button — always points here first (this route only needs
    // approvedGuard, unlike /manage/tasks' manageGuard, so it never 403s a
    // plain staff member) rather than at ModalTableComponent's own item
    // directly. A match in this user's own tasks/incoming-transfers opens
    // it directly; no match falls back to /manage/tasks for a manager+
    // viewer, who can see any task in the org — the two-page equivalent of
    // InventoryComponent's single-page ?item= handling, which this
    // otherwise mirrors (read once from the snapshot, not subscribed).
    const taskId = this.route.snapshot.queryParamMap.get('task');
    if (taskId) {
      const task = [...this.tasks, ...this.incomingTransfers].find(candidate => candidate.id === taskId);
      if (task) {
        this.openTask(task);
      } else {
        // getProfile() rather than authService.canManage() — the profile
        // signal populates asynchronously (see AuthService's own note on
        // this) and nothing on this route is guaranteed to have already
        // forced a fresh fetch the way manageGuard does for /manage/tasks,
        // so it could still read stale/empty here on a first hard load.
        const profile = await this.authService.getProfile();
        const isManager = profile?.role === 'admin' || profile?.role === 'manager';
        if (isManager) {
          this.router.navigate(['/manage/tasks'], { queryParams: { task: taskId } });
        }
      }
    }

    // Live updates from other users/tabs — a transfer someone else sends or
    // responds to shows up here without a manual refresh. Reuses loadTasks()
    // itself (debounced) rather than patching a single row, matching
    // openTask()'s own reasoning above: a transfer can move a task between
    // tasks/incomingTransfers, which a full reload already handles correctly.
    // No client-side organization_id filter — see subscribeToTableChanges()'s
    // own comment for why RLS alone is the right boundary here.
    const channel = subscribeToTableChanges(this.supabase, 'tasks', payload => {
      // DELETE isn't tracked — there's no row left to flash once the reload
      // below completes, so it'd never actually be visible.
      if (payload.eventType !== 'DELETE' && payload.new.id) {
        this.pendingFlashIds.add(payload.new.id);
      }
      this.debouncedReloadTasks();
    });
    this.destroyRef.onDestroy(() => {
      this.debouncedReloadTasks.cancel();
      this.flashTracker.clear();
      void this.supabase.removeChannel(channel);
    });
  }

  isFlashing(taskId: string): boolean {
    return this.flashTracker.isFlashing(taskId);
  }

  private async reloadAndFlashChangedTasks() {
    await this.loadTasks();
    for (const id of this.pendingFlashIds) {
      this.flashTracker.flash(id);
    }
    this.pendingFlashIds.clear();
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

  createdByLabel(task: Task): string {
    return resolveProfileName(task.created_by, this.orgProfiles) || 'Unknown user';
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
