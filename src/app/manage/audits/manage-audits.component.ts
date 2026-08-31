import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService, Profile } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { InventoryFieldOptionsService } from '../../core/inventory-field-options.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { StartAuditModalComponent } from '../../shared/components/start-audit-modal/start-audit-modal.component';
import { AuditDetailComponent } from './audit-detail/audit-detail.component';
import { InventoryAudit } from '../../shared/models/inventory-audit.model';
import { loadAuditSummaries } from '../../shared/utils/inventory-audits';
import { subscribeToTableChanges } from '../../shared/utils/realtime';
import { FlashTracker } from '../../shared/utils/flash-tracker';
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
 *  call, never a draft sitting unsaved. */
@Component({
  selector: 'app-manage-audits',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent,
    AuditDetailComponent
  ],
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
    await this.loadAudits();
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
    this.destroyRef.onDestroy(() => {
      this.debouncedReloadAudits.cancel();
      this.flashTracker.clear();
      void this.supabase.removeChannel(auditsChannel);
      void this.supabase.removeChannel(countsChannel);
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

  private async reloadAndFlashChangedAudits() {
    await this.loadAudits();
    for (const id of this.pendingFlashIds) {
      this.flashTracker.flash(id);
    }
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
