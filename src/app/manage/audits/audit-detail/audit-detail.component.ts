import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/supabase.service';
import { AuthService, Profile } from '../../../core/auth.service';
import { NotificationService } from '../../../core/notification.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { RingStatComponent } from '../../../shared/components/ring-stat/ring-stat.component';
import { InventoryAudit, InventoryAuditCount, isAuditDiscrepancy } from '../../../shared/models/inventory-audit.model';
import { loadAuditDetail } from '../../../shared/utils/inventory-audits';

/** Embedded (not routed) detail view for one inventory audit — see
 *  ManageAuditsComponent's own doc comment for why this is a plain
 *  component rather than a manage/audits/:id route. Everything here is an
 *  immediate RPC call (submit a count, apply a discrepancy, complete/cancel
 *  the audit); nothing sits as an unsaved draft, so there's no
 *  hasUnsavedChanges()/confirm-before-leaving concept to wire up the way
 *  ModalTableComponent's own detail view needs.
 *
 *  Counting is open to any approved org member (submitAuditCount() has no
 *  client-side role gate — submit_audit_count() itself is the real
 *  enforcement); applying a discrepancy and completing/cancelling the audit
 *  are both restricted to authService.canManage() in the template, same
 *  trust split apply_audit_count()/complete_inventory_audit()/
 *  cancel_inventory_audit() enforce server-side. */
@Component({
  selector: 'app-audit-detail',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterLink,
    EmptyStateComponent,
    RingStatComponent
  ],
  templateUrl: './audit-detail.component.html',
  styleUrl: './audit-detail.component.scss',
})
export class AuditDetailComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  protected authService = inject(AuthService);
  private notification = inject(NotificationService);

  @Input({ required: true }) auditId!: string;
  @Output() back = new EventEmitter<void>();

  isLoading = true;
  loadError: string | null = null;

  audit: InventoryAudit | null = null;
  counts: InventoryAuditCount[] = [];
  private profiles: Profile[] = [];

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

  private async loadDetail() {
    this.isLoading = true;
    const { audit, counts, error } = await loadAuditDetail(this.supabase, this.auditId, this.profiles);
    this.isLoading = false;

    if (error) {
      this.loadError = error;
      return;
    }
    this.loadError = null;
    this.audit = audit;
    this.counts = counts;
  }

  get isInProgress(): boolean {
    return this.audit?.status === 'in_progress';
  }

  get notYetCounted(): InventoryAuditCount[] {
    return this.counts.filter(count => count.countedQuantity === null);
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

  // --- Count entry -------------------------------------------------------

  countSearchControl = new FormControl('', { nonNullable: true });
  selectedCount: InventoryAuditCount | null = null;
  countForm = new FormGroup({
    quantity: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0)] }),
    note: new FormControl('', { nonNullable: true })
  });
  isSubmittingCount = false;
  countError: string | null = null;

  // Matches by name only (no id search — the not-yet-counted list is
  // scoped to just this one audit's own remaining items, not the whole
  // org's inventory, so there's nothing to disambiguate by id the way
  // PlaceOrderModalComponent's own org-wide item picker needs).
  get filteredNotYetCounted(): InventoryAuditCount[] {
    const term = this.countSearchControl.value.trim().toLowerCase();
    if (!term) {
      return this.notYetCounted;
    }
    return this.notYetCounted.filter(count => count.itemName.toLowerCase().includes(term));
  }

  onCountItemSelected(event: MatAutocompleteSelectedEvent) {
    const countId = event.option.value as string;
    this.selectedCount = this.notYetCounted.find(count => count.id === countId) ?? null;
    this.countSearchControl.setValue(this.selectedCount?.itemName ?? '', { emitEvent: false });
    this.countForm.reset({ quantity: null, note: '' });
    this.countError = null;
  }

  async submitCount() {
    if (this.isSubmittingCount) {
      return;
    }
    if (!this.selectedCount) {
      this.countError = 'Pick an item to count.';
      return;
    }
    if (this.countForm.invalid) {
      this.countForm.markAllAsTouched();
      return;
    }

    this.isSubmittingCount = true;
    this.countError = null;

    const value = this.countForm.getRawValue();
    const { error } = await this.supabase.rpc('submit_audit_count', {
      audit_count_id: this.selectedCount.id,
      p_counted_quantity: value.quantity!,
      p_note: value.note.trim() || undefined
    });

    this.isSubmittingCount = false;

    if (error) {
      this.countError = error.message;
      return;
    }

    this.selectedCount = null;
    this.countSearchControl.setValue('');
    this.countForm.reset({ quantity: null, note: '' });
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

    const { error } = await this.supabase.rpc('complete_inventory_audit', { audit_id: this.audit.id });

    this.isFinishing = false;

    if (error) {
      this.finishError = error.message;
      return;
    }

    await this.loadDetail();
    this.notification.success('Audit completed');
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
