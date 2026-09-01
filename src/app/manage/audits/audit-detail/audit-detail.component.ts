import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/supabase.service';
import { AuthService, Profile } from '../../../core/auth.service';
import { NotificationService } from '../../../core/notification.service';
import { ConfettiService } from '../../../core/confetti.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { RingStatComponent } from '../../../shared/components/ring-stat/ring-stat.component';
import { UserAvatarComponent } from '../../../shared/components/user-avatar/user-avatar.component';
import { InventoryAudit, InventoryAuditCount, isAuditDiscrepancy } from '../../../shared/models/inventory-audit.model';
import { loadAuditDetail } from '../../../shared/utils/inventory-audits';
import { profileDisplayName } from '../../../shared/utils/profile-label';

/** Embedded (not routed) detail view for one inventory audit — see
 *  ManageAuditsComponent's own doc comment for why this is a plain
 *  component rather than a manage/audits/:id route. Everything here is an
 *  immediate RPC call (submit a count, apply a discrepancy, complete/cancel
 *  the audit); nothing sits as an unsaved draft, so there's no
 *  hasUnsavedChanges()/confirm-before-leaving concept to wire up the way
 *  ModalTableComponent's own detail view needs.
 *
 *  Counting is open to any approved org member (submitCount() has no
 *  client-side role gate — submit_audit_count() itself is the real
 *  enforcement) — every not-yet-counted item already renders as its own
 *  fillable card (see countFormFor() below) rather than needing to be
 *  searched for and clicked first, since start_inventory_audit() already
 *  added every item in scope automatically when the audit began. Applying a
 *  discrepancy and cancelling the audit stay admin/manager-only
 *  (canCancelAudit); completing is admin/manager-only *unless* nothing's
 *  left uncounted, at which point it's purely mechanical and any approved
 *  member can (canCompleteAudit) — same trust split
 *  apply_audit_count()/complete_inventory_audit()/cancel_inventory_audit()
 *  enforce server-side. Claiming the lead/support team (see saveTeam()
 *  below) is the same open-to-any-approved-member trust level as counting —
 *  set_audit_team() has no role check either, since this is meant to be
 *  self-claimable ("I've got this one"), not an admin/manager-only
 *  assignment. set_audit_team() (and the client's own Edit button) also
 *  both refuse once the audit is no longer `in_progress`, so a
 *  completed/cancelled audit's team is permanent history.
 *
 *  Imports FormsModule alongside ReactiveFormsModule for the same reason
 *  LockUserAccountModalComponent/SuspendOrganizationModalComponent/
 *  DeleteOrganizationModalComponent all had to (see CLAUDE.md): the
 *  count-entry card's own `<form (ngSubmit)="submitCount(count)">` has no
 *  `[formGroup]` (each field binds its own `[formControl]` directly), so
 *  nothing provides Angular's `ngSubmit` output without FormsModule —
 *  `NgForm`'s selector (`form:not([ngNoForm]):not([formGroup])`) is what
 *  actually listens for the native `submit` event and calls
 *  `preventDefault()` before emitting `ngSubmit`, and it only comes from
 *  FormsModule. Missing it compiles fine (Angular's strict template
 *  checking doesn't catch a missing *event* binding the way it does a
 *  missing property one) and silently never fires — clicking "Submit
 *  count" instead falls through to a real native form submit, an actual
 *  page navigation with nothing saved. Caught live ("it refreshes the page
 *  but no data is saved"), not by a test — every existing test called
 *  submitCount() directly, which bypasses the DOM entirely; only
 *  dispatching a real `submit` event catches this (see the spec's own
 *  regression test). */
@Component({
  selector: 'app-audit-detail',
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterLink,
    EmptyStateComponent,
    RingStatComponent,
    UserAvatarComponent
  ],
  templateUrl: './audit-detail.component.html',
  styleUrl: './audit-detail.component.scss',
})
export class AuditDetailComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  protected authService = inject(AuthService);
  private notification = inject(NotificationService);
  private confetti = inject(ConfettiService);

  @Input({ required: true }) auditId!: string;
  @Output() back = new EventEmitter<void>();

  isLoading = true;
  loadError: string | null = null;

  audit: InventoryAudit | null = null;
  counts: InventoryAuditCount[] = [];
  private profiles: Profile[] = [];

  readonly profileDisplayName = profileDisplayName;

  async ngOnInit() {
    const { data } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('organization_id', this.authService.organizationId()!)
      .order('full_name');
    this.profiles = data ?? [];
    await this.loadDetail();
  }

  retryLoad() {
    void this.loadDetail();
  }

  /** Also the reload every mutation on this page runs afterward (submitting
   *  a count, applying a discrepancy, completing/cancelling, saving the
   *  team) — deliberately doesn't touch `isLoading` itself. `isLoading`
   *  starts `true` (its own field default) and is set `false` exactly once,
   *  right below, the first time this resolves; every later call is a
   *  silent background refresh of the already-rendered content, the same
   *  "isLoading only ever toggles on the very first load" shape
   *  ManageAuditsComponent's own loadAudits() already establishes for the
   *  identical reason. Re-setting it `true` here used to mean every single
   *  action — including something as light as picking a name from a
   *  dropdown — tore down and rebuilt this entire view as the loading
   *  skeleton and back, which read as the whole page resetting. */
  private async loadDetail() {
    const { audit, counts, error } = await loadAuditDetail(this.supabase, this.auditId, this.profiles);
    this.isLoading = false;

    if (error) {
      this.loadError = error;
      return;
    }
    this.loadError = null;
    this.audit = audit;
    this.counts = counts;
    this.syncTeamForm();
  }

  get isInProgress(): boolean {
    return this.audit?.status === 'in_progress';
  }

  get notYetCounted(): InventoryAuditCount[] {
    return this.counts.filter(count => count.countedQuantity === null);
  }

  /** Cancelling stays admin/manager-only outright — same trust split this
   *  component's own doc comment already draws for apply/complete/cancel. */
  get canCancelAudit(): boolean {
    return this.isInProgress && this.authService.canManage();
  }

  /** Completing is admin/manager-only *unless* nothing's left uncounted —
   *  at that point there's no judgment call left to make (see
   *  complete_inventory_audit()'s own migration comment for the server-side
   *  half of this, which is what actually enforces it), so any approved
   *  member gets the same self-service completion trust
   *  submit_audit_count() already extends to counting itself. */
  get canCompleteAudit(): boolean {
    return this.isInProgress && (this.authService.canManage() || this.notYetCounted.length === 0);
  }

  get matches(): InventoryAuditCount[] {
    return this.counts.filter(count => count.countedQuantity !== null && !isAuditDiscrepancy(count));
  }

  get discrepancies(): InventoryAuditCount[] {
    return this.counts.filter(isAuditDiscrepancy);
  }

  /** The subset of discrepancies "Apply"/"Apply all" actually act on —
   *  already-applied rows and container-tracked rows (see
   *  apply_audit_count()'s own migration comment) are excluded, matching
   *  what the RPC itself would refuse anyway. */
  get applicableDiscrepancies(): InventoryAuditCount[] {
    return this.discrepancies.filter(count => !count.isContainerTracked && !count.appliedAt);
  }

  get percentCounted(): number {
    if (this.counts.length === 0) {
      return 0;
    }
    return ((this.counts.length - this.notYetCounted.length) / this.counts.length) * 100;
  }

  // --- Audit team (lead/support claiming) ---------------------------------

  /** Approved members only — same "not a pending join request" filter
   *  ManageTasksComponent's own approvedAssignableProfiles applies to its
   *  own assignee picker, since naming someone who can't even see this
   *  audit yet wouldn't mean anything. */
  get approvedProfiles(): Profile[] {
    return this.profiles.filter(profile => profile.membership_status === 'approved');
  }

  /** The support picker's own option list — excludes whoever's currently
   *  selected as lead in the form (not just whoever's saved as lead), so
   *  switching the lead selection immediately narrows this list too, before
   *  the change is even saved. set_audit_team() enforces the same exclusion
   *  server-side regardless — see that RPC's own migration comment. */
  get availableSupportProfiles(): Profile[] {
    const leadId = this.teamForm.controls.leadId.value;
    return this.approvedProfiles.filter(profile => profile.id !== leadId);
  }

  teamForm = new FormGroup({
    leadId: new FormControl<string | null>(null),
    supportIds: new FormControl<string[]>([], { nonNullable: true })
  });
  isSavingTeam = false;
  teamError: string | null = null;

  /** Whether the Lead/Support dropdowns are showing at all — an explicit
   *  Edit/Save/Cancel gesture (same shape ModalTableComponent's own item
   *  edit flow already establishes) rather than saving on every individual
   *  selection change. While `false`, the saved team renders as read-only
   *  name+avatar chips instead (see the template) — the two views are
   *  mutually exclusive, never both on screen at once. */
  isEditingTeam = false;

  private syncTeamForm() {
    this.teamForm.setValue(
      { leadId: this.audit?.lead?.id ?? null, supportIds: this.audit?.supporters.map(member => member.id) ?? [] },
      { emitEvent: false }
    );
  }

  /** Opens the dropdowns, seeded from the audit's own current (saved) team
   *  — not whatever was left over from a previous, since-cancelled edit
   *  session. */
  startEditingTeam() {
    this.syncTeamForm();
    this.teamError = null;
    this.isEditingTeam = true;
  }

  /** Discards whatever's currently sitting in the dropdowns and goes back
   *  to the chip view — the button is disabled while a save is in flight
   *  (see the template), so this only ever fires on an untouched-by-the-
   *  server edit. */
  cancelEditingTeam() {
    this.syncTeamForm();
    this.teamError = null;
    this.isEditingTeam = false;
  }

  /** Drops the newly-picked lead out of the local support selection if
   *  they were already in it, so a lead never shows up in both lists at
   *  once — purely a local, pre-save adjustment now (see saveTeam() below
   *  for the actual write, which only happens on an explicit Save click). */
  onLeadChange() {
    const leadId = this.teamForm.controls.leadId.value;
    if (!leadId) {
      return;
    }
    const current = this.teamForm.controls.supportIds.value;
    if (current.includes(leadId)) {
      this.teamForm.controls.supportIds.setValue(current.filter(id => id !== leadId), { emitEvent: false });
    }
  }

  async saveTeam() {
    if (!this.audit || this.isSavingTeam) {
      return;
    }
    this.isSavingTeam = true;
    this.teamError = null;

    const value = this.teamForm.getRawValue();
    const { error } = await this.supabase.rpc('set_audit_team', {
      p_audit_id: this.audit.id,
      p_lead_id: value.leadId ?? undefined,
      p_support_ids: value.supportIds
    });

    this.isSavingTeam = false;

    if (error) {
      this.teamError = error.message;
      // Stay in edit mode with whatever was entered still in place, rather
      // than reverting it — Cancel is the explicit way to discard now that
      // there's one; a rejected Save should be retryable/adjustable, not
      // silently thrown away.
      return;
    }

    this.isEditingTeam = false;
    await this.loadDetail();
  }

  // --- Count entry -------------------------------------------------------

  /** Every not-yet-counted item already renders as its own fillable card
   *  (see the template) rather than requiring a click-through search+select
   *  step first — every item in the audit's own scope (whole org, or
   *  whichever physical_location it was started against) was already added
   *  automatically by start_inventory_audit() when the audit began, so
   *  there's nothing left to "pick" here; this filter is purely a
   *  convenience for narrowing a long list, not a required selection step.
   *  Matches by name only (no id search — this list is scoped to just this
   *  one audit's own remaining items, not the whole org's inventory, so
   *  there's nothing to disambiguate by id the way PlaceOrderModalComponent's
   *  own org-wide item picker needs). */
  countSearchControl = new FormControl('', { nonNullable: true });

  get filteredNotYetCounted(): InventoryAuditCount[] {
    const term = this.countSearchControl.value.trim().toLowerCase();
    if (!term) {
      return this.notYetCounted;
    }
    return this.notYetCounted.filter(count => count.itemName.toLowerCase().includes(term));
  }

  private countForms = new Map<string, FormGroup<{ quantity: FormControl<number | null>; note: FormControl<string> }>>();
  private submittingCountIds = new Set<string>();
  private countErrors = new Map<string, string>();

  /** Lazily builds (and caches) one card's own form the first time it's
   *  rendered — a Map keyed by count id rather than a single shared form,
   *  since every not-yet-counted item's card is on screen and independently
   *  fillable/submittable at once now, not just whichever one was last
   *  clicked. */
  countFormFor(count: InventoryAuditCount): FormGroup<{ quantity: FormControl<number | null>; note: FormControl<string> }> {
    let form = this.countForms.get(count.id);
    if (!form) {
      form = new FormGroup({
        quantity: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0)] }),
        note: new FormControl('', { nonNullable: true })
      });
      this.countForms.set(count.id, form);
    }
    return form;
  }

  isSubmittingCount(countId: string): boolean {
    return this.submittingCountIds.has(countId);
  }

  countErrorFor(countId: string): string | null {
    return this.countErrors.get(countId) ?? null;
  }

  async submitCount(count: InventoryAuditCount) {
    if (this.submittingCountIds.has(count.id)) {
      return;
    }
    const form = this.countFormFor(count);
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    this.submittingCountIds.add(count.id);
    this.countErrors.delete(count.id);

    const value = form.getRawValue();
    const { error } = await this.supabase.rpc('submit_audit_count', {
      audit_count_id: count.id,
      p_counted_quantity: value.quantity!,
      p_note: value.note.trim() || undefined
    });

    this.submittingCountIds.delete(count.id);

    if (error) {
      this.countErrors.set(count.id, error.message);
      return;
    }

    this.countForms.delete(count.id);
    await this.loadDetail();
    this.notification.success('Count submitted');
  }

  // --- Apply discrepancies ------------------------------------------------

  isApplying = false;
  applyError: string | null = null;

  async applyCount(count: InventoryAuditCount) {
    if (this.isApplying) {
      return;
    }
    this.isApplying = true;
    this.applyError = null;

    const { error } = await this.supabase.rpc('apply_audit_count', { audit_count_id: count.id });

    this.isApplying = false;

    if (error) {
      this.applyError = error.message;
      return;
    }

    await this.loadDetail();
    this.notification.success(`Applied count for ${count.itemName}`);
  }

  /** No RPC accepts an array of ids, so this loops apply_audit_count()
   *  client-side (Promise.all) and tallies success/failure — same "no
   *  all-or-nothing assumption" shape every other bulk action in this app
   *  already follows. */
  async applyAllDiscrepancies() {
    if (this.isApplying) {
      return;
    }
    const targets = this.applicableDiscrepancies;
    if (targets.length === 0) {
      return;
    }

    this.isApplying = true;
    this.applyError = null;

    const results = await Promise.all(
      targets.map(count => this.supabase.rpc('apply_audit_count', { audit_count_id: count.id }))
    );
    const failedCount = results.filter(result => result.error).length;
    const succeededCount = targets.length - failedCount;

    await this.loadDetail();
    this.isApplying = false;

    if (succeededCount > 0) {
      this.notification.success(`Applied ${succeededCount} count${succeededCount === 1 ? '' : 's'}`);
    }
    if (failedCount > 0) {
      this.applyError = `${failedCount} of ${targets.length} count${targets.length === 1 ? '' : 's'} couldn't be applied.`;
    }
  }

  // --- Complete / cancel ---------------------------------------------------

  isFinishing = false;
  finishError: string | null = null;

  async completeAudit() {
    if (this.isFinishing || !this.audit) {
      return;
    }
    this.isFinishing = true;
    this.finishError = null;

    // Captured before the RPC call/loadDetail() reload below — "the whole
    // audit turned up zero discrepancies, with nothing left uncounted" is a
    // fact about the audit as it stands right now, worth celebrating
    // regardless of what completing it does to these rows afterward. The
    // counts.length > 0 guard rules out the degenerate empty-audit case
    // (nothing in scope) trivially satisfying "zero discrepancies" without
    // anyone having actually counted anything.
    const isPerfectCount = this.counts.length > 0 && this.notYetCounted.length === 0 && this.discrepancies.length === 0;

    const { error } = await this.supabase.rpc('complete_inventory_audit', { audit_id: this.audit.id });

    this.isFinishing = false;

    if (error) {
      this.finishError = error.message;
      return;
    }

    await this.loadDetail();

    // A genuine "just happened, right here" moment — see ConfettiService's
    // own doc comment for why that's the bar, and HomeComponent's own
    // Getting Started card for the kind of "milestone" this deliberately
    // isn't (that one's completing step happens on a different page
    // entirely, with no on-screen moment left to animate by the time this
    // page notices). Every item in scope physically matched what the system
    // expected — worth more than the plain "Audit completed" every other
    // completion gets.
    if (isPerfectCount) {
      this.confetti.burst();
      this.notification.success('🎉 Perfect count — every item matched, zero discrepancies!');
    } else {
      this.notification.success('Audit completed');
    }
  }

  async cancelAudit() {
    if (this.isFinishing || !this.audit) {
      return;
    }
    this.isFinishing = true;
    this.finishError = null;

    const { error } = await this.supabase.rpc('cancel_inventory_audit', { audit_id: this.audit.id });

    this.isFinishing = false;

    if (error) {
      this.finishError = error.message;
      return;
    }

    await this.loadDetail();
    this.notification.success('Audit cancelled');
  }
}
