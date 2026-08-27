import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService, Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { Database } from '../../shared/models/database.types';
import { resolveProfileName } from '../../shared/utils/profile-label';
import { FEEDBACK_STATUS_LABELS, FEEDBACK_TYPE_LABELS, FeedbackStatus, FeedbackType } from '../../shared/models/feedback';

type FeedbackRow = Database['public']['Tables']['feedback']['Row'];

/** A feedback row plus everything StudioFeedbackComponent's template needs
 *  to show for it, resolved once at load time rather than re-looked-up per
 *  render — same "join client-side into id->name maps, not a PostgREST
 *  embedded-resource select" convention every other multi-entity list in
 *  this app already follows (e.g. inventory-item-orders.ts's own
 *  itemNamesById). */
interface FeedbackWithContext extends FeedbackRow {
  orgName: string;
  submitterLabel: string;
  submitterEmail: string;
  reviewedByLabel: string;
}

type StatusFilter = 'all' | FeedbackStatus;

/** The cross-org counterpart to the Help page's "Send feedback" button
 *  (FeedbackModalComponent) — every organization's submissions in one
 *  place, with a review workflow (new -> reviewed/resolved) the feedback
 *  table itself didn't have until the add_feedback_status migration.
 *  Readable at all only because of the new "Platform admins can view all
 *  feedback" SELECT policy (add_platform_admin) — feedback otherwise has
 *  no SELECT policy for any role. */
@Component({
  selector: 'app-studio-feedback',
  imports: [
    FormsModule,
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent
  ],
  templateUrl: './studio-feedback.component.html',
  styleUrl: './studio-feedback.component.scss',
})
export class StudioFeedbackComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);

  readonly feedbackTypeLabels = FEEDBACK_TYPE_LABELS;
  readonly feedbackStatusLabels = FEEDBACK_STATUS_LABELS;

  isLoading = true;
  /** Same shape as InventoryComponent's own loadError — set from the
   *  query's own error.message, checked before the loading/empty branches,
   *  backs a Retry button rather than silently reading as "no feedback". */
  loadError: string | null = null;
  feedback: FeedbackWithContext[] = [];
  private profiles: Profile[] = [];

  statusFilter: StatusFilter = 'all';
  searchTerm = '';

  private updatingIds = new Set<string>();

  isUpdating(id: string): boolean {
    return this.updatingIds.has(id);
  }

  // `row.type`/`row.status` are plain `string` at the type level (the DB's
  // own check constraints aren't reflected in the generated Row type), so
  // these cast through the label maps' narrower key types rather than
  // indexing them directly in the template, which can't express a TS cast.
  typeLabel(row: FeedbackWithContext): string {
    return this.feedbackTypeLabels[row.type as FeedbackType] ?? row.type;
  }

  statusLabel(row: FeedbackWithContext): string {
    return this.feedbackStatusLabels[row.status as FeedbackStatus] ?? row.status;
  }

  get filteredFeedback(): FeedbackWithContext[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.feedback.filter(row => {
      const matchesStatus = this.statusFilter === 'all' || row.status === this.statusFilter;
      if (!matchesStatus) {
        return false;
      }
      if (!term) {
        return true;
      }
      const typeLabel = this.feedbackTypeLabels[row.type as FeedbackType] ?? row.type;
      return (
        row.message.toLowerCase().includes(term) ||
        row.orgName.toLowerCase().includes(term) ||
        row.submitterLabel.toLowerCase().includes(term) ||
        typeLabel.toLowerCase().includes(term)
      );
    });
  }

  async ngOnInit() {
    await this.loadFeedback();
  }

  /** Re-runs loadFeedback() after a failed load — the Retry button's own
   *  handler. */
  retryLoad() {
    void this.loadFeedback();
  }

  private async loadFeedback() {
    this.isLoading = true;
    this.loadError = null;

    const [{ data: rows, error }, { data: orgs }, { data: profiles }] = await Promise.all([
      this.supabase.from('feedback').select('*').order('created_at', { ascending: false }),
      this.supabase.from('organizations').select('id, name'),
      this.supabase.from('profiles').select('*')
    ]);

    if (error) {
      this.loadError = error.message;
      this.isLoading = false;
      return;
    }

    const orgNamesById = new Map((orgs ?? []).map(org => [org.id, org.name]));
    this.profiles = profiles ?? [];
    this.feedback = (rows ?? []).map(row => this.toFeedbackWithContext(row, orgNamesById));
    this.isLoading = false;
  }

  private toFeedbackWithContext(row: FeedbackRow, orgNamesById: Map<string, string>): FeedbackWithContext {
    return {
      ...row,
      orgName: orgNamesById.get(row.organization_id) ?? 'Unknown organization',
      submitterLabel: resolveProfileName(row.user_id, this.profiles) || 'Unknown user',
      submitterEmail: this.profiles.find(profile => profile.id === row.user_id)?.email ?? '',
      reviewedByLabel: resolveProfileName(row.reviewed_by, this.profiles)
    };
  }

  /** Writes directly via .update() — no RPC needed, the column-scoped grant
   *  plus the "Platform admins can update feedback status" RLS policy (both
   *  from add_feedback_status) are the whole mechanism. Mutates `row` in
   *  place afterward (same convention InventoryComponent's own edit flow
   *  already uses — the row object here is the exact instance the template
   *  is bound to) rather than reloading the whole list. */
  async markStatus(row: FeedbackWithContext, status: FeedbackStatus) {
    if (this.updatingIds.has(row.id)) {
      return;
    }
    this.updatingIds.add(row.id);

    const session = await this.authService.getSession();
    const reviewedAt = new Date().toISOString();
    const reviewerId = session?.user.id ?? null;

    const { error } = await this.supabase
      .from('feedback')
      .update({ status, reviewed_by: reviewerId, reviewed_at: reviewedAt })
      .eq('id', row.id);

    if (!error) {
      row.status = status;
      row.reviewed_by = reviewerId;
      row.reviewed_at = reviewedAt;
      row.reviewedByLabel = resolveProfileName(reviewerId, this.profiles);
    }

    this.updatingIds.delete(row.id);
  }
}
