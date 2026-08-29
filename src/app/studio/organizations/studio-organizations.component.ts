import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SupabaseService } from '../../core/supabase.service';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { Database } from '../../shared/models/database.types';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];

interface OrganizationSummary extends OrganizationRow {
  memberCount: number;
  lastActiveAt: string | null;
}

/** Every organization using ShelfSync, at a glance — organizations' own
 *  SELECT policy is already `using (true)` for authenticated (see
 *  create_organizations.sql), so no new policy was needed for that part;
 *  memberCount/lastActiveAt come from a single cross-org profiles query
 *  (readable here only because of the new "Platform admins can view all
 *  profiles" policy from add_platform_admin), reduced client-side into one
 *  map rather than a per-org query loop. */
@Component({
  selector: 'app-studio-organizations',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, BreadcrumbsComponent, PageHeaderComponent, EmptyStateComponent],
  templateUrl: './studio-organizations.component.html',
  styleUrl: './studio-organizations.component.scss',
})
export class StudioOrganizationsComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private router = inject(Router);

  isLoading = true;
  loadError: string | null = null;
  organizations: OrganizationSummary[] = [];
  /** Repeat-count for the loading-state skeleton table rows — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3, 4];

  async ngOnInit() {
    await this.loadOrganizations();
  }

  retryLoad() {
    void this.loadOrganizations();
  }

  /** Navigates to this org's own dedicated page — see
   *  StudioOrgDetailComponent's own doc comment for what it shows and why
   *  it's scoped the way it is. Was a popup (OrgDetailModalComponent)
   *  before the first "convert Studio's info drill-downs to real pages"
   *  pass. */
  openOrgDetail(org: OrganizationSummary) {
    this.router.navigate(['/studio/organizations', org.id]);
  }

  private async loadOrganizations() {
    this.isLoading = true;
    this.loadError = null;

    const [{ data: orgs, error }, { data: profiles }] = await Promise.all([
      this.supabase.from('organizations').select('*').order('created_at', { ascending: false }),
      this.supabase.from('profiles').select('organization_id, last_active_at')
    ]);

    if (error) {
      this.loadError = error.message;
      this.isLoading = false;
      return;
    }

    // One pass building { count, lastActive } per org, rather than a query
    // per row — see this component's own doc comment above.
    const statsByOrgId = new Map<string, { count: number; lastActive: string | null }>();
    for (const profile of profiles ?? []) {
      const existing = statsByOrgId.get(profile.organization_id) ?? { count: 0, lastActive: null };
      existing.count += 1;
      if (profile.last_active_at && (!existing.lastActive || profile.last_active_at > existing.lastActive)) {
        existing.lastActive = profile.last_active_at;
      }
      statsByOrgId.set(profile.organization_id, existing);
    }

    this.organizations = (orgs ?? []).map(org => {
      const stats = statsByOrgId.get(org.id) ?? { count: 0, lastActive: null };
      return { ...org, memberCount: stats.count, lastActiveAt: stats.lastActive };
    });
    this.isLoading = false;
  }
}
