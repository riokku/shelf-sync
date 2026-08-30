import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SupabaseService } from '../../core/supabase.service';
import { Profile } from '../../core/auth.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { Database } from '../../shared/models/database.types';
import { resolveProfileName } from '../../shared/utils/profile-label';

type ActionLogRow = Database['public']['Tables']['platform_action_log']['Row'];

const ACTION_LABELS: Record<string, string> = {
  suspend: 'Suspended',
  unsuspend: 'Unsuspended',
  retire: 'Retired',
  restore: 'Restored',
  lock: 'Locked',
  unlock: 'Unlocked'
};

/** Every suspend/unsuspend/retire/restore/lock/unlock a platform admin has
 *  ever made, across every org — the record that never existed until
 *  add_platform_action_log, when those six RPCs
 *  (add_platform_org_suspension_and_retirement/add_platform_account_lock)
 *  had no audit trail of their own at all. Flat, newest-first, capped at
 *  200 — same "diagnostic feed, not exhaustive history" scope
 *  StudioErrorLogComponent's own load already has — rendered as a plain
 *  table (StudioOrganizationsComponent's own shape) rather than an
 *  accordion, since a row here is a short one-liner with no long message
 *  that needs expanding the way an error/email log entry can. Readable at
 *  all only because of platform_action_log's own platform-admin-only
 *  SELECT policy — every row is written by the RPCs themselves (SECURITY
 *  DEFINER, bypasses RLS), never directly by the client. */
@Component({
  selector: 'app-studio-audit-log',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, BreadcrumbsComponent, PageHeaderComponent, EmptyStateComponent],
  templateUrl: './studio-audit-log.component.html',
  styleUrl: './studio-audit-log.component.scss',
})
export class StudioAuditLogComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  isLoading = true;
  loadError: string | null = null;
  actionLog: ActionLogRow[] = [];
  private profiles: Profile[] = [];
  /** Repeat-count for the loading-state skeleton table rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3, 4];

  retryLoad() {
    void this.loadActionLog();
  }

  async ngOnInit() {
    await this.loadActionLog();
  }

  private async loadActionLog() {
    this.isLoading = true;

    const [{ data: rows, error }, { data: profiles }] = await Promise.all([
      this.supabase.from('platform_action_log').select('*').order('created_at', { ascending: false }).limit(200),
      this.supabase.from('profiles').select('*')
    ]);

    if (error) {
      this.loadError = error.message;
      this.isLoading = false;
      return;
    }
    this.loadError = null;

    this.actionLog = rows ?? [];
    this.profiles = profiles ?? [];
    this.isLoading = false;
  }

  actorName(row: ActionLogRow): string {
    if (!row.actor_id) {
      return 'Former platform admin';
    }
    return resolveProfileName(row.actor_id, this.profiles) || 'Former platform admin';
  }

  actionLabel(row: ActionLogRow): string {
    return ACTION_LABELS[row.action] ?? row.action;
  }

  /** The route to this action's own target detail page — the same two
   *  Studio drill-down pages StudioOrganizationsComponent's/
   *  StudioUsersComponent's own rows already link to. */
  targetLink(row: ActionLogRow): string[] {
    return row.target_type === 'organization' ? ['/studio/organizations', row.target_id] : ['/studio/users', row.target_id];
  }
}
