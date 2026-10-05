import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService, Profile } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { InventoryFieldOptionsService } from '../../core/inventory-field-options.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { StartAuditModalComponent } from '../../shared/components/start-audit-modal/start-audit-modal.component';
import { AuditScheduleFormModalComponent } from '../../shared/components/audit-schedule-form-modal/audit-schedule-form-modal.component';
import { AuditDetailComponent } from './audit-detail/audit-detail.component';
import {
  AUDIT_FREQUENCY_LABELS,
  daysUntilAuditOccurrence,
  InventoryAudit,
  InventoryAuditSchedule,
  isAuditScheduleLocked,
  isAuditScheduleUpcoming
} from '../../shared/models/inventory-audit.model';
import { loadAuditSummaries } from '../../shared/utils/inventory-audits';
import { loadAuditSchedules } from '../../shared/utils/inventory-audit-schedules';
import { subscribeToTableChanges } from '../../shared/utils/realtime';
import { FlashTracker } from '../../shared/utils/flash-tracker';
import { flashAndAnnounceChanges } from '../../shared/utils/realtime-announce';
import { debounce } from '../../shared/utils/debounce';

/** manage/audits — org-wide list of every physical inventory audit
 *  ("cycle count"), plus the "Start audit" entry point (admin/manager
 *  only, gated in the template — for real, by start_inventory_audit()
 *  server-side). approvedGuard only, no manageGuard — every approved
 *  member can open an audit and submit counts (same staff-level trust
 *  widen_reservation_access_to_staff.sql already established for physical
 *  warehouse work), same tier manage/reservations and /broadcasts already
 *  established for a manage/* page reachable without admin/manager.
 *
 *  selectedAuditId toggles between this list and <app-audit-detail> inline
 *  (mirrored in the URL as ?audit=<id>, merged alongside whatever else is
 *  already there) — same selectedItemDetail/?item= shape
 *  ManageInventoryComponent already establishes, rather than a routed
 *  manage/audits/:id (see this feature's own plan for why: audits have
 *  only one entry point, their own list, unlike Studio's routed detail
 *  pages which exist specifically for cross-linking from multiple entry
 *  points). No hasUnsavedChanges()/confirm-before-leaving dance the way
 *  ModalTableComponent's own detail view needs — every action here
 *  (submitting a count, applying a discrepancy) is its own immediate RPC
 *  call, never a draft sitting unsaved.
 *
 *  Also hosts recurring audit schedules (inventory_audit_schedules) — see
 *  create_audit_schedule()'s own migration comment for the full mechanism.
 *  Every approved member sees the "Upcoming" section (schedules within a
 *  week of their next occurrence — upcomingSchedules), same open visibility
 *  the audits list itself already has; only admin/manager sees the
 *  management list (all schedules, active or paused) with Edit/Pause-Resume
 *  actions, gated in the template the same way "Start audit" already is. */
@Component({
  selector: 'app-manage-audits',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    RouterLink,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent,
    AuditDetailComponent
  ],
  // AuditScheduleFormModalComponent is opened via MatDialog.open(), not
  // referenced from this component's own template, so it's intentionally
  // not listed above — same convention every other dialog-opening component
  // in this app already follows (e.g. StartAuditModalComponent itself).
  templateUrl: './manage-audits.component.html',
  styleUrl: './manage-audits.component.scss',
})
export class ManageAuditsComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  protected authService = inject(AuthService);
  private notification = inject(NotificationService);
  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private liveAnnouncer = inject(LiveAnnouncer);

  isLoading = true;
  /** Set when loadAudits()'s own query fails — see InventoryComponent's
   *  identical loadError field for the full reasoning. Left set across a
   *  failed background refresh (a realtime-triggered reload, or returning
   *  from the detail view) rather than clearing allAudits, same
   *  background-refresh-safe behavior every other loadError field in this
   *  app already has. */
  loadError: string | null = null;
  readonly skeletonRows = [1, 2, 3];

  private profiles: Profile[] = [];
  audits: InventoryAudit[] = [];

  /** Recurring audit schedules — see loadAuditSchedules()'s own doc comment.
   *  Loaded regardless of role (any approved member needs to see the
   *  Upcoming section derived from this), management actions are what's
   *  actually gated to admin/manager (in the template, mirroring "Start
   *  audit" itself). */
  schedules: InventoryAuditSchedule[] = [];
  scheduleLoadError: string | null = null;
  readonly frequencyLabels = AUDIT_FREQUENCY_LABELS;
  readonly isAuditScheduleLocked = isAuditScheduleLocked;
  private togglingScheduleIds = new Set<string>();
  scheduleActionError: string | null = null;

  selectedAuditId: string | null = null;

  // Which rows should currently show the brief "someone else just changed
  // this" pulse — see shared/utils/flash-tracker.ts and
  // ManageOrdersComponent's own identical pendingFlashIds/debounced-reload
  // pair.
  private flashTracker = new FlashTracker();
  private pendingFlashIds = new Set<string>();
  private readonly debouncedReloadAudits = debounce(() => void this.reloadAndFlashChangedAudits(), 300);

  async ngOnInit() {
    await Promise.all([this.loadProfiles(), this.inventoryFieldOptions.load()]);
    await Promise.all([this.loadAudits(), this.loadSchedules()]);
    this.isLoading = false;

    // Supports a deep link (?audit=<id>), same shape ManageInventoryComponent's
    // own ?item= handling uses.
    const auditParam = this.route.snapshot.queryParamMap.get('audit');
    if (auditParam && this.audits.some(audit => audit.id === auditParam)) {
      this.selectedAuditId = auditParam;
    }

    // Live updates from other users/tabs on either table — a count
    // submitted or applied elsewhere updates this list's own tallies
    // without a manual reload. No client-side organization_id filter — see
    // subscribeToTableChanges()'s own comment for why RLS alone is the
    // right boundary here.
    const auditsChannel = subscribeToTableChanges(this.supabase, 'inventory_audits', payload => {
      if (payload.eventType !== 'DELETE' && payload.new.id) {
        this.pendingFlashIds.add(payload.new.id);
      }
      this.debouncedReloadAudits();
    });
    const countsChannel = subscribeToTableChanges(this.supabase, 'inventory_audit_counts', payload => {
      const auditId = payload.eventType === 'DELETE' ? payload.old.audit_id : payload.new.audit_id;
      if (auditId) {
        this.pendingFlashIds.add(auditId);
      }
      this.debouncedReloadAudits();
    });
    // A schedule change (created, edited, paused/resumed, or advanced by
    // run_scheduled_inventory_audits() itself) reloads schedules alongside
    // audits via the same debounced call below — cheap either way, and
    // keeps one debounce/flash pair covering all three tables rather than a
    // second one just for this.
    const schedulesChannel = subscribeToTableChanges(this.supabase, 'inventory_audit_schedules', payload => {
      const scheduleId = payload.eventType === 'DELETE' ? payload.old.id : payload.new.id;
      if (scheduleId) {
        this.pendingFlashIds.add(scheduleId);
      }
      this.debouncedReloadAudits();
    });
    this.destroyRef.onDestroy(() => {
      this.debouncedReloadAudits.cancel();
      this.flashTracker.clear();
      void this.supabase.removeChannel(auditsChannel);
      void this.supabase.removeChannel(countsChannel);
      void this.supabase.removeChannel(schedulesChannel);
    });
  }

  private async loadProfiles() {
    const { data } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('organization_id', this.authService.organizationId()!)
      .order('full_name');
    this.profiles = data ?? [];
  }

  isFlashing(auditId: string): boolean {
    return this.flashTracker.isFlashing(auditId);
  }

  /** pendingFlashIds mixes two different id spaces (see ngOnInit's own
   *  comment: an audit's own id, or — via the audit_counts channel's
   *  auditId re-mapping — the same; but the schedules channel adds a
   *  *schedule's* own id instead, which never appears in `audits` at all)
   *  — so labelFor here has to check both lists rather than just one. */
  private auditOrScheduleLabel(id: string): string | null {
    const audit = this.audits.find(candidate => candidate.id === id);
    if (audit) {
      return audit.physicalLocation ? `Audit for ${audit.physicalLocation}` : 'Org-wide audit';
    }
    const schedule = this.schedules.find(candidate => candidate.id === id);
    if (schedule) {
      return schedule.physicalLocation ? `Recurring audit for ${schedule.physicalLocation}` : 'Recurring org-wide audit';
    }
    return null;
  }

  private async reloadAndFlashChangedAudits() {
    await Promise.all([this.loadAudits(), this.loadSchedules()]);
    flashAndAnnounceChanges(
      this.pendingFlashIds,
      this.flashTracker,
      this.liveAnnouncer,
      id => this.auditOrScheduleLabel(id),
      label => `${label} updated`
    );
    this.pendingFlashIds.clear();
  }

  /** Re-runs loadAudits() after a failed load — the Retry button's handler. */
  retryLoad() {
    void this.loadAudits();
  }

  private async loadAudits() {
    const { audits, error } = await loadAuditSummaries(this.supabase, this.profiles);
    if (error) {
      this.loadError = error;
      return;
    }
    this.loadError = null;
    this.audits = audits;
  }

  // --- Recurring audit schedules -------------------------------------------

  /** Re-runs loadSchedules() after a failed load — the Upcoming/management
   *  sections' own Retry button handler, separate from retryLoad() above
   *  since the two lists load (and can fail) independently. */
  retryLoadSchedules() {
    void this.loadSchedules();
  }

  private async loadSchedules() {
    const { schedules, error } = await loadAuditSchedules(this.supabase, this.profiles);
    if (error) {
      this.scheduleLoadError = error;
      return;
    }
    this.scheduleLoadError = null;
    this.schedules = schedules;
  }

  /** Every approved member's own view — schedules within a week of firing,
   *  soonest first (loadAuditSchedules() already orders by
   *  next_occurrence_date). A paused schedule never appears here regardless
   *  of date (see isAuditScheduleUpcoming()'s own doc comment). */
  get upcomingSchedules(): InventoryAuditSchedule[] {
    return this.schedules.filter(isAuditScheduleUpcoming);
  }

  /** "Starts today"/"Starts in 3 days" — the Upcoming card's own timing
   *  line, computed once per card rather than calling
   *  daysUntilAuditOccurrence() three times inline in the template. */
  scheduleTimingLabel(schedule: InventoryAuditSchedule): string {
    const days = daysUntilAuditOccurrence(schedule);
    return days <= 0 ? 'Starts today' : `Starts in ${days} day${days === 1 ? '' : 's'}`;
  }

  isTogglingSchedule(scheduleId: string): boolean {
    return this.togglingScheduleIds.has(scheduleId);
  }

  openCreateSchedule() {
    const dialogRef = this.dialog.open(AuditScheduleFormModalComponent, {
      width: 'clamp(28rem, 45vw, 34rem)',
      maxWidth: '90vw'
    });
    dialogRef.afterClosed().subscribe(saved => void this.handleScheduleFormResult(saved, 'created'));
  }

  openEditSchedule(schedule: InventoryAuditSchedule) {
    const dialogRef = this.dialog.open(AuditScheduleFormModalComponent, {
      width: 'clamp(28rem, 45vw, 34rem)',
      maxWidth: '90vw',
      data: { schedule }
    });
    dialogRef.afterClosed().subscribe(saved => void this.handleScheduleFormResult(saved, 'updated'));
  }

  private async handleScheduleFormResult(saved: boolean | undefined, verb: 'created' | 'updated') {
    if (!saved) {
      return;
    }
    await this.loadSchedules();
    this.notification.success(`Recurring audit ${verb}`);
  }

  /** Pause/resume — deliberately not gated by isAuditScheduleLocked() the
   *  way the Edit button is, since set_audit_schedule_active() itself has
   *  no such check (see that RPC's own migration comment for why stopping
   *  the series stays allowed regardless of how soon it's due to fire). */
  async toggleScheduleActive(schedule: InventoryAuditSchedule) {
    if (this.togglingScheduleIds.has(schedule.id)) {
      return;
    }
    this.togglingScheduleIds.add(schedule.id);
    this.scheduleActionError = null;

    const { error } = await this.supabase.rpc('set_audit_schedule_active', {
      p_schedule_id: schedule.id,
      p_active: !schedule.active
    });

    this.togglingScheduleIds.delete(schedule.id);

    if (error) {
      this.scheduleActionError = error.message;
      return;
    }

    await this.loadSchedules();
    this.notification.success(schedule.active ? 'Recurring audit paused' : 'Recurring audit resumed');
  }

  openStartAudit() {
    const dialogRef = this.dialog.open(StartAuditModalComponent, {
      width: 'clamp(28rem, 45vw, 34rem)',
      maxWidth: '90vw'
    });

    // Split out from the subscribe callback itself so a spec can call/await
    // it directly — same reasoning ManageOrdersComponent's own
    // handlePlaceOrderResult() doc comment gives.
    dialogRef.afterClosed().subscribe(auditId => void this.handleStartAuditResult(auditId));
  }

  private async handleStartAuditResult(auditId: string | undefined) {
    if (!auditId) {
      return;
    }
    await this.loadAudits();
    this.notification.success('Audit started');
    this.openAuditDetail(auditId);
  }

  openAuditDetail(auditId: string) {
    this.selectedAuditId = auditId;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { audit: auditId },
      queryParamsHandling: 'merge'
    });
  }

  /** The detail view's own Back button (via AuditDetailComponent's `back`
   *  output). Reloads the list on the way out — the detail view may have
   *  applied counts, or completed/cancelled the audit, all of which change
   *  this list's own tallies/status pill. */
  closeAuditDetail() {
    this.selectedAuditId = null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { audit: null },
      queryParamsHandling: 'merge'
    });
    void this.loadAudits();
  }
}
