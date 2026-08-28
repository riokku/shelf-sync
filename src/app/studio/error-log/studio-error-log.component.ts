import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { SupabaseService } from '../../core/supabase.service';
import { Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { Database } from '../../shared/models/database.types';
import { resolveProfileName } from '../../shared/utils/profile-label';

type ClientErrorLogRow = Database['public']['Tables']['client_error_log']['Row'];

/** The cross-org counterpart to ManageErrorLogComponent — same shape almost
 *  entirely (dev-error toggle, client-side pagination, per-row profile-name
 *  resolution), the one real difference being no organization_id filter, so
 *  the same bug hitting several customers shows up as several rows here
 *  rather than needing to check each org's own manage/error-log separately.
 *  Readable at all only because of the new "Platform admins can view all
 *  client errors" SELECT policy (add_platform_admin) — client_error_log's
 *  own original policy scopes strictly to the caller's org. */
@Component({
  selector: 'app-studio-error-log',
  imports: [
    FormsModule,
    DatePipe,
    MatCheckboxModule,
    MatExpansionModule,
    MatPaginatorModule,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent
  ],
  templateUrl: './studio-error-log.component.html',
  styleUrl: './studio-error-log.component.scss',
})
export class StudioErrorLogComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  isLoading = true;
  errorLog: ClientErrorLogRow[] = [];
  private profiles: Profile[] = [];
  private orgNamesById = new Map<string, string>();
  /** Repeat-count for the loading-state skeleton accordion rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3, 4];

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

  private async loadErrorLog() {
    this.isLoading = true;

    const [{ data: rows }, { data: profiles }, { data: orgs }] = await Promise.all([
      // Same "most recent first, capped at 200" reasoning
      // ManageErrorLogComponent's own load already has — a diagnostic feed,
      // not exhaustive audit history.
      this.supabase.from('client_error_log').select('*').order('created_at', { ascending: false }).limit(200),
      this.supabase.from('profiles').select('*'),
      this.supabase.from('organizations').select('id, name')
    ]);

    this.errorLog = rows ?? [];
    this.profiles = profiles ?? [];
    this.orgNamesById = new Map((orgs ?? []).map(org => [org.id, org.name]));
    this.isLoading = false;
  }

  reportedBy(row: ClientErrorLogRow): string {
    if (!row.user_id) {
      return 'Signed-out visitor';
    }
    return resolveProfileName(row.user_id, this.profiles) || 'Former team member';
  }

  /** A pre-auth error (a crash on landing/login/register — see
   *  GlobalErrorHandler/log_client_error()'s own doc comments) has no
   *  organization_id at all, distinct from one that fails to resolve to a
   *  name for some other reason. */
  orgName(row: ClientErrorLogRow): string {
    if (!row.organization_id) {
      return 'No organization (pre-login)';
    }
    return this.orgNamesById.get(row.organization_id) ?? 'Unknown organization';
  }
}
