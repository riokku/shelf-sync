import { Component, OnInit, inject } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SupabaseService } from '../../core/supabase.service';
import { Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { Database } from '../../shared/models/database.types';
import { isRowLowStock, isRowOutOfStock } from '../../shared/utils/inventory-stock';
import { loadAllInventoryItemDiscards } from '../../shared/utils/inventory-item-discards';
import { resolveProfileName } from '../../shared/utils/profile-label';
import { getTodayIsoDate } from '../../shared/utils/date';
import { TASK_STATUSES, TASK_STATUS_LABELS, TaskStatus } from '../../shared/models/task-status';

type InventoryItemReportRow = Pick<
  Database['public']['Tables']['inventory_items']['Row'],
  'id' | 'category' | 'physical_location' | 'quantity_remaining' | 'low_quantity_threshold'
    | 'price_per_unit' | 'price_per_container' | 'quantity_per_container' | 'status'
>;
type TaskReportRow = Pick<
  Database['public']['Tables']['tasks']['Row'],
  'status' | 'due_date' | 'created_at' | 'updated_at' | 'assigned_to'
>;

const UNCATEGORIZED = 'Uncategorized';
const UNSPECIFIED_LOCATION = 'Unspecified';
const UNASSIGNED = 'Unassigned';

interface BreakdownRow {
  label: string;
  primary: number;
  itemCount: number;
}

interface RetirementRateRow {
  category: string;
  retiredCount: number;
  totalCount: number;
  rate: number;
}

interface AssigneeWorkloadRow {
  label: string;
  todo: number;
  inProgress: number;
  done: number;
  overdue: number;
}

/** Admin/manager-only reporting page (manage/reports) — three sections
 *  (Inventory value & stock health / Stock movement & loss / Task
 *  throughput), each its own full-width card rather than tabs, since these
 *  are meant to be scanned together rather than switched between (unlike
 *  Settings, which has genuinely separate per-section save flows that
 *  justify its own tab split). All-time snapshots, no date-range picker —
 *  a reasonable v1 scope; a trailing-window filter would need either
 *  periodic value snapshots or a real date-range UI, neither of which
 *  exists yet.
 *
 *  Every count/value here is derived client-side from three plain queries
 *  (inventory_items, inventory_item_discards, tasks) rather than a bespoke
 *  RPC per stat — this app has no existing precedent for
 *  server-side-aggregated reporting, and the org sizes this schema
 *  realistically holds today make a client-side reduce cheap enough not to
 *  need one. */
@Component({
  selector: 'app-manage-reports',
  imports: [CurrencyPipe, DecimalPipe, MatIconModule, MatProgressSpinnerModule, MatProgressBarModule, BreadcrumbsComponent],
  templateUrl: './manage-reports.component.html',
  styleUrl: './manage-reports.component.scss',
})
export class ManageReportsComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  isLoading = true;

  // --- Inventory value & stock health ---
  totalValue = 0;
  activeItemCount = 0;
  lowStockCount = 0;
  outOfStockCount = 0;
  valueByCategory: BreakdownRow[] = [];
  valueByLocation: BreakdownRow[] = [];

  // --- Stock movement & loss ---
  totalDiscardedUnits = 0;
  discardEventCount = 0;
  /** BreakdownRow.label is the reason text, .primary the total quantity
   *  discarded for that reason, .itemCount the number of discard events —
   *  same shape as every other breakdown list on this page (see barWidth's
   *  own comment for why that's what lets them all share one method). */
  topDiscardReasons: BreakdownRow[] = [];
  discardsByCategory: BreakdownRow[] = [];
  retirementRateByCategory: RetirementRateRow[] = [];

  // --- Task throughput ---
  totalTasks = 0;
  completedTaskCount = 0;
  overdueTaskCount = 0;
  /** null when there's no completed task yet to average — distinct from 0,
   *  which would misleadingly read as "every task closes instantly". */
  averageDaysToClose: number | null = null;
  workloadByAssignee: AssigneeWorkloadRow[] = [];

  get completionRatePercent(): number {
    return this.totalTasks === 0 ? 0 : Math.round((this.completedTaskCount / this.totalTasks) * 100);
  }

  /** Every breakdown list on this page shares the same BreakdownRow shape
   *  (see topDiscardReasons' own comment on why reasons fit this too), so
   *  one method scales every mat-progress-bar the same way: relative to
   *  the largest `primary` value in *that* list, not some page-wide
   *  maximum. Falls back to 1 to avoid a divide by zero when a section is
   *  empty. */
  barWidth(rows: BreakdownRow[], value: number): number {
    const max = Math.max(1, ...rows.map(row => row.primary));
    return (value / max) * 100;
  }

  async ngOnInit() {
    const [{ data: items }, discards, { data: tasks }, { data: profiles }] = await Promise.all([
      this.supabase
        .from('inventory_items')
        .select('id, category, physical_location, quantity_remaining, low_quantity_threshold, price_per_unit, price_per_container, quantity_per_container, status'),
      loadAllInventoryItemDiscards(this.supabase),
      this.supabase.from('tasks').select('status, due_date, created_at, updated_at, assigned_to'),
      this.supabase.from('profiles').select('*')
    ]);

    this.buildStockHealth(items ?? []);
    this.buildMovementAndLoss(items ?? [], discards);
    this.buildTaskThroughput(tasks ?? [], profiles ?? []);

    this.isLoading = false;
  }

  /** Prefers price_per_unit; falls back to a derived per-unit price from
   *  price_per_container/quantity_per_container (bulk-priced items may only
   *  ever have that pair filled in) so an item priced only "by the case"
   *  still contributes to the total instead of silently valuing at $0. */
  private effectiveUnitPrice(row: InventoryItemReportRow): number {
    if (row.price_per_unit) {
      return row.price_per_unit;
    }
    if (row.price_per_container && row.quantity_per_container) {
      return row.price_per_container / row.quantity_per_container;
    }
    return 0;
  }

  private buildStockHealth(items: InventoryItemReportRow[]) {
    // Retired/pending-retirement items only ever reach that status at
    // quantity_remaining = 0 (see request_item_retirement's own gate), so
    // this filter mostly documents intent rather than changing the sum —
    // but it does keep a future non-zero edge case from silently counting.
    const active = items.filter(item => item.status === 'active');

    this.activeItemCount = active.length;
    this.totalValue = active.reduce((sum, item) => sum + item.quantity_remaining * this.effectiveUnitPrice(item), 0);
    this.lowStockCount = active.filter(isRowLowStock).length;
    this.outOfStockCount = active.filter(isRowOutOfStock).length;

    this.valueByCategory = this.groupByValue(active, item => item.category || UNCATEGORIZED);
    this.valueByLocation = this.groupByValue(active, item => item.physical_location || UNSPECIFIED_LOCATION);
  }

  private groupByValue(items: InventoryItemReportRow[], labelFor: (item: InventoryItemReportRow) => string): BreakdownRow[] {
    const rows = new Map<string, BreakdownRow>();
    for (const item of items) {
      const label = labelFor(item);
      const row = rows.get(label) ?? { label, primary: 0, itemCount: 0 };
      row.primary += item.quantity_remaining * this.effectiveUnitPrice(item);
      row.itemCount += 1;
      rows.set(label, row);
    }
    return [...rows.values()].sort((a, b) => b.primary - a.primary);
  }

  private buildMovementAndLoss(
    items: InventoryItemReportRow[],
    discards: { item_id: string; quantity: number; reason: string }[]
  ) {
    const categoryByItemId = new Map(items.map(item => [item.id, item.category || UNCATEGORIZED]));

    this.discardEventCount = discards.length;
    this.totalDiscardedUnits = discards.reduce((sum, discard) => sum + discard.quantity, 0);

    const reasonRows = new Map<string, BreakdownRow>();
    const categoryRows = new Map<string, BreakdownRow>();
    for (const discard of discards) {
      const reasonRow = reasonRows.get(discard.reason) ?? { label: discard.reason, primary: 0, itemCount: 0 };
      reasonRow.primary += discard.quantity;
      reasonRow.itemCount += 1;
      reasonRows.set(discard.reason, reasonRow);

      const category = categoryByItemId.get(discard.item_id) ?? UNCATEGORIZED;
      const categoryRow = categoryRows.get(category) ?? { label: category, primary: 0, itemCount: 0 };
      categoryRow.primary += discard.quantity;
      categoryRows.set(category, categoryRow);
    }
    this.topDiscardReasons = [...reasonRows.values()].sort((a, b) => b.primary - a.primary).slice(0, 5);
    this.discardsByCategory = [...categoryRows.values()].sort((a, b) => b.primary - a.primary);

    const retirementRows = new Map<string, RetirementRateRow>();
    for (const item of items) {
      const category = item.category || UNCATEGORIZED;
      const row = retirementRows.get(category) ?? { category, retiredCount: 0, totalCount: 0, rate: 0 };
      row.totalCount += 1;
      if (item.status === 'retired') {
        row.retiredCount += 1;
      }
      retirementRows.set(category, row);
    }
    this.retirementRateByCategory = [...retirementRows.values()]
      .map(row => ({ ...row, rate: row.totalCount === 0 ? 0 : row.retiredCount / row.totalCount }))
      .filter(row => row.retiredCount > 0)
      .sort((a, b) => b.rate - a.rate);
  }

  private buildTaskThroughput(tasks: TaskReportRow[], profiles: Profile[]) {
    const today = getTodayIsoDate();
    this.totalTasks = tasks.length;
    const doneTasks = tasks.filter(task => task.status === 'done');
    this.completedTaskCount = doneTasks.length;
    // Mirrors ManageTasksComponent.isTaskOverdue()'s own condition exactly.
    this.overdueTaskCount = tasks.filter(task => !!task.due_date && task.status !== 'done' && task.due_date < today).length;

    if (doneTasks.length > 0) {
      const totalDays = doneTasks.reduce((sum, task) => sum + this.daysBetween(task.created_at, task.updated_at), 0);
      this.averageDaysToClose = totalDays / doneTasks.length;
    } else {
      this.averageDaysToClose = null;
    }

    const rows = new Map<string, AssigneeWorkloadRow>();
    for (const task of tasks) {
      const label = task.assigned_to ? (resolveProfileName(task.assigned_to, profiles) || 'Former team member') : UNASSIGNED;
      const row = rows.get(label) ?? { label, todo: 0, inProgress: 0, done: 0, overdue: 0 };
      if (task.status === 'todo') {
        row.todo += 1;
      } else if (task.status === 'in_progress') {
        row.inProgress += 1;
      } else {
        row.done += 1;
      }
      if (!!task.due_date && task.status !== 'done' && task.due_date < today) {
        row.overdue += 1;
      }
      rows.set(label, row);
    }
    this.workloadByAssignee = [...rows.values()].sort((a, b) => (b.todo + b.inProgress) - (a.todo + a.inProgress));
  }

  /** Fractional days (not floored — flooring each task before averaging
   *  would bias the average down) between created_at and updated_at.
   *  updated_at is a proxy for "when this task was marked done": any edit
   *  bumps it, not only a status change, but a plain assignee can only ever
   *  change status via update_task_status(), so this is accurate for the
   *  common case and only approximate for an admin/manager who edited a
   *  task's other fields after it was already done. */
  private daysBetween(startIso: string, endIso: string): number {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    return Math.max(0, ms / (1000 * 60 * 60 * 24));
  }

  readonly taskStatuses = TASK_STATUSES;
  readonly taskStatusLabels = TASK_STATUS_LABELS;

  statusCount(row: AssigneeWorkloadRow, status: TaskStatus): number {
    if (status === 'todo') {
      return row.todo;
    }
    if (status === 'in_progress') {
      return row.inProgress;
    }
    return row.done;
  }
}
