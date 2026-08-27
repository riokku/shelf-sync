import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../core/supabase.service';
import { Profile } from '../../core/auth.service';
import { Database } from '../../shared/models/database.types';
import { profileDisplayName } from '../../shared/utils/profile-label';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { OrgDetailModalComponent } from '../organizations/org-detail-modal/org-detail-modal.component';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];

/** Cross-org "who is this person and what org are they in" lookup — the
 *  counterpart to StudioOrganizationsComponent's own org-first browse, for
 *  the opposite direction a support conversation usually starts from (a
 *  name or an email, not an org). Search-first rather than browse-first
 *  (unlike Organizations, which lists everything by default): nothing
 *  renders until a search term narrows it, both because "browse every
 *  user" is already Organizations' own job (via its member counts) and
 *  because a platform-wide profile list only grows as the product does.
 *  A matched row opens the exact same OrgDetailModalComponent a click on
 *  Organizations' own table opens, so finding someone and then seeing
 *  their org's full context (members/feedback/errors) is one click, not a
 *  second lookup. Everything here comes from the same cross-org
 *  profiles/organizations reads StudioOrganizationsComponent already
 *  relies on (see add_platform_admin) — no new policy needed. Matching is
 *  a plain client-side substring filter over a profiles list loaded once
 *  on init, the same "load once, filter in memory" shape ManageTeamComponent's
 *  own search already uses, rather than a server-side ilike search this
 *  app has no other precedent for — the platform's total user count is
 *  still small enough for this to stay cheap. */
@Component({
  selector: 'app-studio-users',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  templateUrl: './studio-users.component.html',
  styleUrl: './studio-users.component.scss',
})
export class StudioUsersComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private dialog = inject(MatDialog);

  isLoading = true;
  loadError: string | null = null;
  searchTerm = '';

  /** Capped at RESULT_LIMIT for display — matchedProfiles below is the
   *  uncapped count, shown in a hint when it exceeds this. */
  private static readonly RESULT_LIMIT = 25;

  private profiles: Profile[] = [];
  private organizationsById = new Map<string, OrganizationRow>();

  async ngOnInit() {
    await this.loadDirectory();
  }

  retryLoad() {
    void this.loadDirectory();
  }

  get matchedProfiles(): Profile[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      return [];
    }
    return this.profiles.filter(
      profile => profileDisplayName(profile).toLowerCase().includes(term) || profile.email.toLowerCase().includes(term)
    );
  }

  get filteredResults(): Profile[] {
    return this.matchedProfiles.slice(0, StudioUsersComponent.RESULT_LIMIT);
  }

  get totalMatchCount(): number {
    return this.matchedProfiles.length;
  }

  displayName(profile: Profile): string {
    return profileDisplayName(profile);
  }

  organizationName(profile: Profile): string {
    return this.organizationsById.get(profile.organization_id)?.name ?? 'Unknown organization';
  }

  /** Opens the same OrgDetailModalComponent Organizations' own table rows
   *  open, for the org this profile belongs to. */
  openOrganization(profile: Profile) {
    const organization = this.organizationsById.get(profile.organization_id);
    if (!organization) {
      return;
    }
    this.dialog.open(OrgDetailModalComponent, {
      data: { organization },
      width: 'clamp(32rem, 60vw, 48rem)',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }

  private async loadDirectory() {
    this.isLoading = true;
    this.loadError = null;

    const [{ data: profiles, error }, { data: organizations }] = await Promise.all([
      this.supabase.from('profiles').select('*'),
      this.supabase.from('organizations').select('*')
    ]);

    if (error) {
      this.loadError = error.message;
      this.isLoading = false;
      return;
    }

    this.profiles = profiles ?? [];
    this.organizationsById = new Map((organizations ?? []).map(org => [org.id, org]));
    this.isLoading = false;
  }
}
