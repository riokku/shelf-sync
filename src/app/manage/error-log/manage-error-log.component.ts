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
import { Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { Database } from '../../shared/models/database.types';
import { resolveProfileName } from '../../shared/utils/profile-label';

type ClientErrorLogRow = Database['public']['Tables']['client_error_log']['Row'];

/** Admin/manager-only viewer for client_error_log — every uncaught client
 *  exception GlobalErrorHandler catches (see core/global-error-handler.ts)
 *  lands here via the log_client_error() RPC, but until now the only way to
 *  see any of it was direct SQL in Supabase Studio. No new RPC/migration
 *  needed for reads: the table's own SELECT policy (from
 *  add_client_error_log) already restricts rows to an approved admin/
 *  manager viewing their own organization's errors, the same audience
 *  manageGuard enforces on this route. */
@Component({
  selector: 'app-manage-error-log',
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
  templateUrl: './manage-error-log.component.html',
  styleUrl: './manage-error-log.component.scss',
})
export class ManageErrorLogComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  isLoading = true;
  errorLog: ClientErrorLogRow[] = [];
  private profiles: Profile[] = [];
  /** Repeat-count for the loading-state skeleton accordion rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3, 4];
  /** Set when loadErrorLog()'s own query fails — see InventoryComponent's
   *  identical loadError field for the full reasoning. Particularly worth
   *  having *here*: this is the diagnostic page an admin checks *after*
   *  something's already gone wrong, so a silent "No errors logged — nice."
   *  on a genuine fetch failure would be actively misleading rather than
   *  just unhelpful. */
  loadError: string | null = null;

  /** Off by default — a dev running against the same hosted project locally
   *  (see CLAUDE.md's Supabase hosted-project workflow) logs errors here
   *  too, tagged app_env: 'development' by GlobalErrorHandler; that's noise
   *  next to what real users hit in production, so it's opt-in rather than
   *  filtered out entirely. */
  includeDevErrors = false;

  readonly pageSize = 15;
  pageIndex = 0;

  get filteredErrorLog(): ClientErrorLogRow[] {
    return this.includeDevErrors
      ? this.errorLog
      : this.errorLog.filter(row => row.app_env !== 'development');
  }

  get pagedErrorLog(): ClientErrorLogRow[] {
    const start = this.pageIndex * this.pageSize;
    return this.filteredErrorLog.slice(start, start + this.pageSize);
  }

  onFilterChange() {
    this.pageIndex = 0;
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
  }

  async ngOnInit() {
    await this.loadErrorLog();
  }

  /** Re-runs loadErrorLog() after a failed load — the Retry button's handler
   *  (see the template's own loadError branch). */
  retryLoad() {
    void this.loadErrorLog();
  }

  private async loadErrorLog() {
    this.isLoading = true;

    const [{ data: rows, error }, { data: profiles }] = await Promise.all([
      // Most recent first, capped at 200 — this is a diagnostic feed, not
      // exhaustive audit history; the table's own index (organization_id,
      // created_at desc) makes this cheap regardless of how large the log
      // grows over time.
      this.supabase.from('client_error_log').select('*').order('created_at', { ascending: false }).limit(200),
      this.supabase.from('profiles').select('*')
    ]);

    if (error) {
      this.loadError = error.message;
      this.isLoading = false;
      return;
    }
    this.loadError = null;
    this.errorLog = rows ?? [];
    this.profiles = profiles ?? [];
    this.isLoading = false;
  }

  /** Errors logged before sign-in (a crash on the landing/login/register
   *  page) have no user_id at all — distinct from a user_id that no longer
   *  resolves to a profile (e.g. the reporter has since been removed from
   *  the org), which is worth surfacing differently. */
  reportedBy(row: ClientErrorLogRow): string {
    if (!row.user_id) {
      return 'Signed-out visitor';
    }
    return resolveProfileName(row.user_id, this.profiles) || 'Former team member';
  }
}
