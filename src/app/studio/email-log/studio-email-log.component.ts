import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { SupabaseService } from '../../core/supabase.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { Database } from '../../shared/models/database.types';

type EmailLogRow = Database['public']['Tables']['notification_email_log']['Row'];

/** Mirrors send-notification-email's own EmailToSend.kind union — a real
 *  Postgres enum shared with `notifications.kind`
 *  (unify_notification_kind_enum), unlike activity_log.entity_type (still a
 *  plain checked text column). `'broadcast'` has no entry here on purpose —
 *  it's the one kind in the shared enum that never actually reaches this
 *  table, since broadcasts are in-app only and never emailed (see
 *  add_broadcasts' own doc comment). kindLabel()'s own `?? row.kind`
 *  fallback below is what had been silently covering for this map missing
 *  'checkout_overdue'/'impersonation_started' until now — real but purely
 *  cosmetic gaps (a raw snake_case kind shown instead of a friendly label),
 *  caught and closed alongside unify_notification_kind_enum rather than
 *  left for a future pass. */
const EMAIL_LOG_KIND_LABELS: Record<string, string> = {
  task_assigned: 'Task assigned',
  task_transfer: 'Task transfer offered',
  retirement_request: 'Retirement request',
  join_request: 'Join request',
  feedback: 'Feedback submitted',
  checkout_overdue: 'Checkout overdue',
  impersonation_started: 'Impersonation started'
};

/** Did send-notification-email's own Resend calls actually succeed? A
 *  near-identical fork of StudioErrorLogComponent (skeleton rows,
 *  MatPaginatorModule, org-name resolution via a Map) — the one real
 *  difference being the filter defaults to failures only (rather than
 *  StudioErrorLogComponent's own "exclude development" default) since a
 *  failed send is the actionable case; a page full of successful sends
 *  confirms nothing is broken but isn't what a maintainer opens this page
 *  to look for. Readable at all only because of notification_email_log's
 *  own platform-admin-only SELECT policy (add_notification_email_log) —
 *  every row is written by the Edge Function's service_role client, never
 *  by the client app itself. */
@Component({
  selector: 'app-studio-email-log',
  imports: [
    FormsModule,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatIconModule,
    MatPaginatorModule,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent
  ],
  templateUrl: './studio-email-log.component.html',
  styleUrl: './studio-email-log.component.scss',
})
export class StudioEmailLogComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  isLoading = true;
  loadError: string | null = null;
  emailLog: EmailLogRow[] = [];
  private orgNamesById = new Map<string, string>();
  /** Repeat-count for the loading-state skeleton accordion rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3, 4];

  showSuccessfulSends = false;

  readonly pageSize = 15;
  pageIndex = 0;

  get filteredEmailLog(): EmailLogRow[] {
    return this.showSuccessfulSends ? this.emailLog : this.emailLog.filter(row => !row.success);
  }

  get pagedEmailLog(): EmailLogRow[] {
    const start = this.pageIndex * this.pageSize;
    return this.filteredEmailLog.slice(start, start + this.pageSize);
  }

  onFilterChange() {
    this.pageIndex = 0;
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
  }

  retryLoad() {
    void this.loadEmailLog();
  }

  async ngOnInit() {
    await this.loadEmailLog();
  }

  private async loadEmailLog() {
    this.isLoading = true;

    const [{ data: rows, error }, { data: orgs }] = await Promise.all([
      // Same "most recent first, capped at 200" reasoning
      // StudioErrorLogComponent's own load already has — a diagnostic
      // feed, not exhaustive audit history.
      this.supabase.from('notification_email_log').select('*').order('created_at', { ascending: false }).limit(200),
      this.supabase.from('organizations').select('id, name')
    ]);

    if (error) {
      this.loadError = error.message;
      this.isLoading = false;
      return;
    }
    this.loadError = null;

    this.emailLog = rows ?? [];
    this.orgNamesById = new Map((orgs ?? []).map(org => [org.id, org.name]));
    this.isLoading = false;
  }

  kindLabel(row: EmailLogRow): string {
    return EMAIL_LOG_KIND_LABELS[row.kind] ?? row.kind;
  }

  orgName(row: EmailLogRow): string {
    if (!row.organization_id) {
      return 'Unknown organization';
    }
    return this.orgNamesById.get(row.organization_id) ?? 'Unknown organization';
  }
}
