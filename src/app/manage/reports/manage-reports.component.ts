import { Component, OnInit, inject } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule, MatButtonToggleChange } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService, Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { DonutChartComponent } from '../../shared/components/donut-chart/donut-chart.component';
import { RingStatComponent } from '../../shared/components/ring-stat/ring-stat.component';
import { Database } from '../../shared/models/database.types';
import { isRowLowStock, isRowOutOfStock } from '../../shared/utils/inventory-stock';
import { loadAllInventoryItemDiscards } from '../../shared/utils/inventory-item-discards';
import { resolveProfileName } from '../../shared/utils/profile-label';
import { getTodayIsoDate, parseIsoDate, toIsoDateString } from '../../shared/utils/date';
import { TASK_STATUSES, TASK_STATUS_LABELS, TaskStatus } from '../../shared/models/task-status';

type InventoryItemReportRow = Pick<
  Database['public']['Tables']['inventory_items']['Row'],
  'id' | 'category' | 'physical_location' | 'quantity_remaining' | 'low_quantity_threshold'
    | 'price_per_unit' | 'price_per_container' | 'quantity_per_container' | 'status'
>;
type DiscardReportRow = Pick<
  Database['public']['Tables']['inventory_item_discards']['Row'],
  'item_id' | 'quantity' | 'reason' | 'discarded_at'
>;
type TaskReportRow = Pick<
  Database['public']['Tables']['tasks']['Row'],
  'status' | 'due_date' | 'created_at' | 'updated_at' | 'assigned_to'
>;

const UNCATEGORIZED = 'Uncategorized';
const UNSPECIFIED_LOCATION = 'Unspecified';
const UNASSIGNED = 'Unassigned';

/** The five choices behind the "Stock movement & loss"/"Task throughput"
 *  date-range filter — see ManageReportsComponent's own class doc comment
 *  for which stats this actually applies to. */
type ReportRangePreset = '7d' | '30d' | '90d' | 'all' | 'custom';

function isReportRangePreset(value: string | null): value is ReportRangePreset {
  return value === '7d' || value === '30d' || value === '90d' || value === 'all' || value === 'custom';
}

interface DateRange {
  from: Date | null;
  to: Date | null;
}

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
 *  justify its own tab split).
 *
 *  "Inventory value & stock health" is always a live snapshot (current
 *  quantity/value, current low/out-of-stock counts) — a trailing-window
 *  filter would need periodic value snapshots, which don't exist, so this
 *  section never reads the date range below at all. "Stock movement &
 *  loss"/"Task throughput" mix genuinely event-based stats (discards,
 *  tasks created/closed — these respect the range) with a few more
 *  point-in-time facts of their own (retirementRateByCategory,
 *  overdueTaskCount, workloadByAssignee — current status/queue, not an
 *  event, so these stay unranged too, each with its own "current" caption
 *  in the template so the split reads as intentional). See
 *  buildMovementAndLoss()/buildTaskThroughput()'s own comments for exactly
 *  which fields each ranged stat filters on.
 *
 *  Every count/value here is derived client-side from three plain queries
 *  (inventory_items, inventory_item_discards, tasks) rather than a bespoke
 *  RPC per stat — this app has no existing precedent for
 *  server-side-aggregated reporting, and the org sizes this schema
 *  realistically holds today make a client-side reduce cheap enough not to
 *  need one. The date range itself never triggers a second network
 *  round-trip either — loadReportData() fetches everything once, keeps the
 *  raw arrays on the component, and a range change just re-runs the ranged
 *  build methods locally (recomputeRangedSections()), so switching ranges
 *  is instant with no loading state of its own. */
@Component({
  selector: 'app-manage-reports',
  imports: [
    CurrencyPipe, DecimalPipe, ReactiveFormsModule, RouterLink, MatButtonModule, MatButtonToggleModule,
    MatDatepickerModule, MatFormFieldModule, MatIconModule, MatInputModule, BreadcrumbsComponent,
    PageHeaderComponent, EmptyStateComponent, DonutChartComponent, RingStatComponent
  ],
  templateUrl: './manage-reports.component.html',
  styleUrl: './manage-reports.component.scss',
})
export class ManageReportsComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  // --- Date range (Stock movement & loss / Task throughput only — see the
  // class doc comment above) ---
  rangePreset: ReportRangePreset = 'all';
  readonly customRangeForm = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null)
  });

  /** The actual bounds the two ranged build methods filter against —
   *  computed fresh from rangePreset/customRangeForm on every read rather
   *  than stored, so there's exactly one source of truth for "what range is
   *  selected right now." `{ from: null, to: null }` (the 'all' preset, and
   *  this component's default) is a deliberate no-op for isWithinRange()
   *  below, so "All time" reproduces today's original unranged behavior
   *  exactly. */
  get currentRange(): DateRange {
    if (this.rangePreset === 'all') {
      return { from: null, to: null };
    }
    if (this.rangePreset === 'custom') {
      const { start, end } = this.customRangeForm.getRawValue();
      return { from: start ? this.startOfDay(start) : null, to: end ? this.endOfDay(end) : null };
    }
    const days = this.rangePreset === '7d' ? 7 : this.rangePreset === '30d' ? 30 : 90;
    const from = this.startOfDay(new Date());
    from.setDate(from.getDate() - (days - 1));
    return { from, to: this.endOfDay(new Date()) };
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  /** Read once on init (see SettingsComponent's own ?tab= read for the
   *  identical shape) — ?range=7d|30d|90d|all|custom, plus ?from=/?to= only
   *  meaningful (and only read) when range=custom, so a scoped report view
   *  is bookmarkable/shareable. */
  private readRangeFromUrl() {
    const rangeParam = this.route.snapshot.queryParamMap.get('range');
    if (isReportRangePreset(rangeParam)) {
      this.rangePreset = rangeParam;
    }
    if (this.rangePreset === 'custom') {
      this.customRangeForm.setValue({
        start: parseIsoDate(this.route.snapshot.queryParamMap.get('from')),
        end: parseIsoDate(this.route.snapshot.queryParamMap.get('to'))
      }, { emitEvent: false });
    }
  }

  /** Mirrors SettingsComponent.setViewMode()'s own queryParamsHandling:
   *  'merge' + replaceUrl: true shape — switching ranges updates the URL
   *  without spamming browser history with an entry per click. */
  private updateRangeQueryParams() {
    const isCustom = this.rangePreset === 'custom';
    const { start, end } = this.customRangeForm.getRawValue();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        range: this.rangePreset === 'all' ? null : this.rangePreset,
        from: isCustom ? toIsoDateString(start) : null,
        to: isCustom ? toIsoDateString(end) : null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  setRangePreset(event: MatButtonToggleChange) {
    this.rangePreset = event.value as ReportRangePreset;
    this.updateRangeQueryParams();
    // 'custom' has no picked dates yet the moment it's selected — nothing
    // to recompute until onCustomRangeChange() below actually fires.
    if (this.rangePreset !== 'custom') {
      this.recomputeRangedSections();
    }
  }

  onCustomRangeChange() {
    this.updateRangeQueryParams();
    this.recomputeRangedSections();
  }

  /** Re-runs the two range-aware build methods against the already-loaded
   *  raw arrays — no network call, see the class doc comment above. Called
   *  once from loadReportData() itself and again on every range change. */
  private recomputeRangedSections() {
    this.buildMovementAndLoss(this.rawItems, this.rawDiscards, this.currentRange);
    this.buildTaskThroughput(this.rawTasks, this.profiles, this.currentRange);
  }

  private isWithinRange(isoTimestamp: string, range: DateRange): boolean {
    if (!range.from && !range.to) {
      return true;
    }
    const date = new Date(isoTimestamp);
    return (!range.from || date >= range.from) && (!range.to || date <= range.to);
  }

  // Raw query results, kept around so a range change can recompute the
  // ranged sections locally instead of re-querying.
  private rawItems: InventoryItemReportRow[] = [];
  private rawDiscards: DiscardReportRow[] = [];
  private rawTasks: TaskReportRow[] = [];
  private profiles: Profile[] = [];

  isLoading = true;
  /** Fixed counts for the loading-state skeleton — a stat-grid is always 4
   *  tiles (2 for Stock movement's own narrower grid), a breakdown list is
   *  a plausible-looking 3 rows regardless of how many the real data ends
   *  up having (unknowable before it loads). */
  readonly skeletonStatTiles = [1, 2, 3, 4];
  readonly skeletonNarrowStatTiles = [1, 2];
  readonly skeletonThroughputStatTiles = [1, 2, 3];
  readonly skeletonBreakdownRows = [1, 2, 3];
  /** Set when any of the three primary queries ngOnInit runs
   *  (inventory_items, inventory_item_discards, tasks) fails — see
   *  InventoryComponent's identical loadError field for the full reasoning.
   *  The profiles lookup alongside them is a secondary label lookup (just
   *  resolving assignee names for workloadByAssignee), not this page's own
   *  primary content, so it's left unchecked, same "secondary loads stay
   *  unchecked" line ManageReservationsComponent's own loadError draws. */
  loadError: string | null = null;

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
   *  one method scales every .bar-fill width the same way: relative to
   *  the largest `primary` value in *that* list, not some page-wide
   *  maximum. Falls back to 1 to avoid a divide by zero when a section is
   *  empty. */
  barWidth(rows: BreakdownRow[], value: number): number {
    const max = Math.max(1, ...rows.map(row => row.primary));
    return (value / max) * 100;
  }

  /** Feeds DonutChartComponent — capped to the top 5 categories plus one
   *  "Other" slice folding in the rest, since a donut with a dozen-plus
   *  thin slices reads as noise rather than a shape. The breakdown list
   *  right below it is unaffected by this cap and still lists every
   *  category with its exact dollar value; this is purely the chart's own
   *  at-a-glance view, not the source of truth for what's actually there. */
  get valueByCategoryChartData(): { label: string; value: number }[] {
    const top = this.valueByCategory.slice(0, 5).map(row => ({ label: row.label, value: row.primary }));
    const rest = this.valueByCategory.slice(5).reduce((sum, row) => sum + row.primary, 0);
    return rest > 0 ? [...top, { label: 'Other', value: rest }] : top;
  }

  /** Re-runs ngOnInit()'s own loads after a failed one — the Retry button's
   *  handler (see the template's own loadError branch). */
  retryLoad() {
    void this.loadReportData();
  }

  async ngOnInit() {
    this.readRangeFromUrl();
    await this.loadReportData();
  }

  private async loadReportData() {
    this.isLoading = true;

    const [itemsResult, discardsResult, tasksResult, { data: profiles }] = await Promise.all([
      this.supabase
        .from('inventory_items')
        .select('id, category, physical_location, quantity_remaining, low_quantity_threshold, price_per_unit, price_per_container, quantity_per_container, status'),
      loadAllInventoryItemDiscards(this.supabase),
      this.supabase.from('tasks').select('status, due_date, created_at, updated_at, assigned_to'),
      this.supabase.from('profiles').select('*').eq('organization_id', this.authService.organizationId()!)
    ]);

    const error = itemsResult.error?.message ?? discardsResult.error ?? tasksResult.error?.message ?? null;
    if (error) {
      this.loadError = error;
      this.isLoading = false;
      return;
    }
    this.loadError = null;

    this.rawItems = itemsResult.data ?? [];
    this.rawDiscards = discardsResult.discards;
    this.rawTasks = tasksResult.data ?? [];
    this.profiles = profiles ?? [];

    this.buildStockHealth(this.rawItems);
    this.recomputeRangedSections();

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

  /** discardEventCount/totalDiscardedUnits/topDiscardReasons/discardsByCategory
   *  are filtered to discard.discarded_at within `range` — these are the
   *  "what happened" stats a date range genuinely applies to.
   *  retirementRateByCategory stays unranged (see below) — a category's
   *  current retired-vs-total ratio isn't an event with a timestamp to
   *  filter on, it's a live snapshot of `status`, the same "current, not
   *  affected by the date range" reasoning stockHealth's whole section
   *  already has. */
  private buildMovementAndLoss(
    items: InventoryItemReportRow[],
    discards: DiscardReportRow[],
    range: DateRange
  ) {
    const categoryByItemId = new Map(items.map(item => [item.id, item.category || UNCATEGORIZED]));
    const discardsInRange = discards.filter(discard => this.isWithinRange(discard.discarded_at, range));

    this.discardEventCount = discardsInRange.length;
    this.totalDiscardedUnits = discardsInRange.reduce((sum, discard) => sum + discard.quantity, 0);

    const reasonRows = new Map<string, BreakdownRow>();
    const categoryRows = new Map<string, BreakdownRow>();
    for (const discard of discardsInRange) {
      // A discard event can carry more than one reason at once (e.g. "Water
      // damage" and "Wear and tear") — each selected reason gets full
      // credit for the event's whole quantity, rather than splitting it
      // between them, since every reason genuinely applied to the whole
      // batch that was discarded, not just a fraction of it.
      for (const reason of discard.reason) {
        const reasonRow = reasonRows.get(reason) ?? { label: reason, primary: 0, itemCount: 0 };
        reasonRow.primary += discard.quantity;
        reasonRow.itemCount += 1;
        reasonRows.set(reason, reasonRow);
      }

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

  /** totalTasks/completedTaskCount are scoped to tasks *created* within
   *  `range` (a cohort question: "of what opened in this window, how much
   *  is done now") and averageDaysToClose to tasks *closed* within it
   *  (updated_at, the same "closed at" proxy daysBetween()'s own doc
   *  comment already explains) — a separate cohort, not the same tasks.
   *  overdueTaskCount/workloadByAssignee both stay unranged, reading the
   *  full `tasks` array regardless — both are "what does the queue look
   *  like right now" facts, not something that happened in a window, the
   *  same "current" reasoning retirementRateByCategory's own comment gives. */
  private buildTaskThroughput(tasks: TaskReportRow[], profiles: Profile[], range: DateRange) {
    const today = getTodayIsoDate();

    const tasksCreatedInRange = tasks.filter(task => this.isWithinRange(task.created_at, range));
    this.totalTasks = tasksCreatedInRange.length;
    this.completedTaskCount = tasksCreatedInRange.filter(task => task.status === 'done').length;

    // Mirrors ManageTasksComponent.isTaskOverdue()'s own condition exactly.
    this.overdueTaskCount = tasks.filter(task => !!task.due_date && task.status !== 'done' && task.due_date < today).length;

    const doneTasksClosedInRange = tasks.filter(task => task.status === 'done' && this.isWithinRange(task.updated_at, range));
    if (doneTasksClosedInRange.length > 0) {
      const totalDays = doneTasksClosedInRange.reduce((sum, task) => sum + this.daysBetween(task.created_at, task.updated_at), 0);
      this.averageDaysToClose = totalDays / doneTasksClosedInRange.length;
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

  /** Width of one status segment within an assignee's stacked bar, scaled
   *  against the *page-wide* busiest assignee's own total (not against
   *  100% of this row alone) — so the bar's overall length also reads as
   *  "how much this person has on their plate" relative to the rest of
   *  the team, not just the mix of statuses within their own workload. */
  workloadSegmentWidth(row: AssigneeWorkloadRow, status: TaskStatus): number {
    const maxTotal = Math.max(1, ...this.workloadByAssignee.map(r => r.todo + r.inProgress + r.done));
    return (this.statusCount(row, status) / maxTotal) * 100;
  }

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
