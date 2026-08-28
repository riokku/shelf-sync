import { Component, DestroyRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../core/supabase.service';
import { AuthService, Profile } from '../core/auth.service';
import { HasUnsavedChanges } from '../core/guards/unsaved-changes.guard';
import { Database } from '../shared/models/database.types';
import { TaskDetailModalComponent } from '../shared/components/task-detail-modal/task-detail-modal.component';
import { TaskCardComponent } from './task-card/task-card.component';
import { BreadcrumbParent, BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { EmptyStateComponent } from '../shared/components/empty-state/empty-state.component';
import { PageIntroComponent } from '../shared/components/page-intro/page-intro.component';
import { resolveProfileName } from '../shared/utils/profile-label';
import { subscribeToTableChanges } from '../shared/utils/realtime';
import { debounce } from '../shared/utils/debounce';
import { FlashTracker } from '../shared/utils/flash-tracker';
import { confirmLeaveWithoutSaving } from '../shared/utils/confirm-leave';

type Task = Database['public']['Tables']['tasks']['Row'];

@Component({
  selector: 'app-tasks',
  imports: [
    MatProgressSpinnerModule, MatButtonModule, MatIconModule, TaskCardComponent, BreadcrumbsComponent,
    EmptyStateComponent, PageIntroComponent, TaskDetailModalComponent
  ],
  templateUrl: './tasks.component.html',
  styleUrl: './tasks.component.scss',
})
export class TasksComponent implements OnInit, HasUnsavedChanges {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private dialog = inject(MatDialog);

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
  /** Set by openTask() below — while non-null, the template swaps the whole
   *  browsing UI (both task-row sections) out for this task's detail view
   *  instead, with a Back button (rendered here — see the template's own
   *  back-row, right below the breadcrumbs) returning here. Mirrors
   *  InventoryComponent.selectedItem's own doc comment exactly. */
  selectedTask: Task | null = null;
  /** Mirrors TaskDetailModalComponent's own relatedItemViewChange output —
   *  true while that component has swapped its content for an inventory
   *  item's detail view. Doesn't hide this page's own back-row (below) —
   *  it stays in the one consistent spot below the breadcrumbs regardless —
   *  but redirects its click to taskDetailModal.closeRelatedItem() instead
   *  of closeTaskDetail() while this is true, so "Back" means "back to the
   *  task" rather than skipping past it straight to the task list. */
  viewingRelatedItem = false;
  /** Only ever populated while selectedTask is set (see the template's own
   *  @if) — queried so the back-row button above can reach
   *  closeRelatedItem() directly; see viewingRelatedItem's own doc comment. */
  @ViewChild(TaskDetailModalComponent) taskDetailModal?: TaskDetailModalComponent;
  /** Bound to app-breadcrumbs' own [parentOverride] whenever selectedTask is
   *  set — see BreadcrumbsComponent.parentOverride's own doc comment for why
   *  this needs an override at all (same route, not a separate detail page,
   *  so "Tasks" itself has to become the parent link rather than being
   *  replaced outright). Its own onClick (see BreadcrumbParent's own doc
   *  comment for why a same-route parent link needs one at all) is
   *  closeTaskDetailFromBreadcrumb() below, not closeTaskDetail() directly
   *  — clicking this can skip straight past an in-progress, unsaved
   *  related-item edit (see viewingRelatedItem), which needs its own
   *  confirm first, the same way clicking Back twice in a row would catch
   *  it once on the way. */
  protected readonly tasksBreadcrumbParent: BreadcrumbParent = {
    label: 'Tasks',
    link: '/tasks',
    onClick: () => this.closeTaskDetailFromBreadcrumb()
  };
  /** Bound to app-breadcrumbs' own [labelOverride] whenever selectedTask is
   *  set — the task's own title normally, but the related item's name
   *  instead while viewingRelatedItem, so drilling into an item from a task
   *  (see TaskDetailModalComponent.selectedRelatedItem's own doc comment)
   *  reads as "Home / Tasks / {task title} / {item name}" (the task title
   *  piece is breadcrumbSecondaryLabel below), matching what's actually on
   *  screen, the same way InventoryComponent's own breadcrumb tracks
   *  whichever item is currently showing. */
  get breadcrumbLabel(): string | undefined {
    if (this.viewingRelatedItem) {
      return this.taskDetailModal?.selectedRelatedItem?.name;
    }
    return this.selectedTask?.title;
  }

  /** Bound to app-breadcrumbs' own [secondaryLabel] — only set (to the
   *  task's own title) while viewingRelatedItem, i.e. exactly when
   *  breadcrumbLabel above has moved on to the item's name instead, so the
   *  task doesn't disappear from the trail entirely once its own title
   *  stops being the trailing label. Clicking it (the template's own
   *  (secondaryLabelClick) binding) calls taskDetailModal.closeRelatedItem()
   *  — the exact same call the page's own Back button makes while
   *  viewingRelatedItem (see handleBackClick() below) — so the breadcrumb
   *  segment is a genuine second way back to the task, not just a label.
   *  See BreadcrumbsComponent.secondaryLabel's own doc comment for why this
   *  is a button rather than a second BreadcrumbParent routerLink. */
  get breadcrumbSecondaryLabel(): string | undefined {
    return this.viewingRelatedItem ? this.selectedTask?.title : undefined;
  }
  isLoading = true;
  /** Repeat-count for the loading-state skeleton rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3, 4];

  /** See InventoryComponent.staggerDelay's own doc comment — same cap,
   *  same reasoning. Not applied to the Completed section below: those are
   *  already-done items, and cascading them in too draws attention away
   *  from the two sections a visitor actually needs to act on. */
  staggerDelay(index: number): number {
    return Math.min(index, 8) * 40;
  }
  /** Set when loadTasks()'s own query fails — see InventoryComponent's
   *  identical loadError field for the full reasoning (distinct from an
   *  empty list, backs a Retry button via EmptyStateComponent's
   *  variant="error"). */
  loadError: string | null = null;

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
    // otherwise mirrors (read once from the snapshot, not subscribed). Sets
    // selectedTask directly rather than going through openTask() — the URL
    // already has ?task= on it, so there's nothing to navigate.
    const taskId = this.route.snapshot.queryParamMap.get('task');
    if (taskId) {
      const task = [...this.tasks, ...this.incomingTransfers].find(candidate => candidate.id === taskId);
      if (task) {
        this.selectedTask = task;
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

  /** Re-runs loadTasks() after a failed load — the Retry button's own
   *  handler (see the template's loadError branch). */
  retryLoad() {
    void this.loadTasks();
  }

  private async loadTasks() {
    if (!this.currentUserId) {
      return;
    }

    this.isLoading = true;
    this.loadError = null;

    const [{ data: myTasks, error: myTasksError }, { data: incoming }] = await Promise.all([
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

    if (myTasksError) {
      this.loadError = myTasksError.message;
      this.isLoading = false;
      return;
    }

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

  /** Swaps the browsing UI out for the task's detail view inline (see
   *  selectedTask's own doc comment) rather than opening
   *  TaskDetailModalComponent as a MatDialog, and mirrors that in the URL
   *  (?task=<id>) so the deep link this page already supports on load also
   *  works from a plain click — including the browser's own Back button,
   *  since this pushes a new history entry rather than replacing the
   *  current one. Mirrors InventoryComponent.showDetails() exactly. */
  openTask(task: Task) {
    this.selectedTask = task;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { task: task.id },
      queryParamsHandling: 'merge'
    });
  }

  /** The detail view's own Back button, and (back) handler for
   *  TaskDetailModalComponent itself — see that component's own back
   *  output doc comment for what `changed` means. A transfer
   *  request/response can move a task in or out of either list (incoming
   *  -> mine on accept, out of both on decline, etc.), so a full reload is
   *  simpler and more robust here than patching one array in place —
   *  mirrors this page's own pre-existing dialog-close reasoning exactly,
   *  just triggered by `changed` instead of the dialog closing with a
   *  truthy value. */
  closeTaskDetail(changed = false) {
    this.selectedTask = null;
    this.viewingRelatedItem = false;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { task: null },
      queryParamsHandling: 'merge'
    });
    if (changed) {
      void this.loadTasks();
    }
  }

  /** The single back-row button's own click handler — see
   *  viewingRelatedItem's own doc comment for why this branches instead of
   *  binding closeTaskDetail() directly. */
  handleBackClick() {
    if (this.viewingRelatedItem) {
      this.taskDetailModal?.closeRelatedItem();
    } else {
      this.closeTaskDetail();
    }
  }

  /** tasksBreadcrumbParent's own onClick — see its own doc comment for why
   *  clicking "Tasks" in the breadcrumb needs this at all rather than just
   *  the routerLink it also carries. Unlike handleBackClick() above (which
   *  only ever steps back one level at a time), this can skip straight from
   *  the related-item view all the way out, so it has to run
   *  closeRelatedItem()'s own unsaved-changes check itself first rather
   *  than relying on that method ever actually being called. */
  closeTaskDetailFromBreadcrumb() {
    if (!this.viewingRelatedItem || !(this.taskDetailModal?.hasUnsavedChanges() ?? false)) {
      this.closeTaskDetail();
      return;
    }

    void confirmLeaveWithoutSaving(
      this.dialog,
      'You have unsaved changes on this item that will be lost if you leave it.'
    ).then(confirmed => {
      if (confirmed) {
        this.closeTaskDetail();
      }
    });
  }

  /** Real, would-actually-lose-data input sitting in a related-item edit
   *  right now — delegates to TaskDetailModalComponent's own
   *  hasUnsavedChanges(), which is false whenever no task is even selected
   *  (taskDetailModal is only populated while selectedTask is). Backs the
   *  route-level unsavedChangesGuard (navigating off this page entirely) —
   *  the Back button's own click (handleBackClick() above) is already
   *  covered directly by TaskDetailModalComponent.closeRelatedItem()'s own
   *  confirm gate, so this page needs no separate one of its own. */
  hasUnsavedChanges(): boolean {
    return this.taskDetailModal?.hasUnsavedChanges() ?? false;
  }

  /** CanDeactivate guards never run for a tab close/refresh — only this
   *  catches that case. Modern browsers ignore the custom message and show
   *  their own generic "leave site?" wording; setting returnValue is what
   *  actually triggers that prompt at all (an empty/unset handler does
   *  nothing). */
  @HostListener('window:beforeunload', ['$event'])
  confirmBeforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
