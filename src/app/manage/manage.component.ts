import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { PageIntroComponent } from '../shared/components/page-intro/page-intro.component';
import { getUnseenChangelogCount } from '../shared/utils/changelog';

@Component({
  selector: 'app-manage',
  imports: [RouterModule, MatBadgeModule, MatButtonModule, MatIconModule, BreadcrumbsComponent, PageIntroComponent],
  templateUrl: './manage.component.html',
  styleUrl: './manage.component.scss',
})
export class ManageComponent implements OnInit {
  protected authService = inject(AuthService);
  private supabase = inject(SupabaseService).client;

  /** Items awaiting admin/manager approval to retire — same shape as the
   *  other two counts below, badged here on the Inventory card *and* again
   *  on Manage > Inventory's own "Requests" toggle. Visible to any
   *  Manager+, same audience as the Inventory card itself. Was missing
   *  entirely from this hub until it was noticed the header nav's combined
   *  badge (HeaderComponent.pendingManageCount, which sums all three of
   *  these) could show a higher count than anything visibly added up to on
   *  this page — this card was the silent gap. */
  pendingRetirementCount = 0;
  /** Tasks currently offered to someone and awaiting their accept/decline —
   *  the only "pending request" concept tasks have, same shape as inventory
   *  retirement requests above and team join requests below. Visible to any
   *  Manager+, same audience as the Tasks card itself. */
  pendingTaskTransferCount = 0;
  /** Awaiting admin approval to join the org — admin-only, matching the
   *  pending section on the Team page itself, so this stays 0 (and the
   *  badge stays hidden) for a manager. */
  pendingJoinRequestCount = 0;
  /** How many Release Notes entries this user hasn't seen yet (see
   *  shared/utils/changelog.ts) — badged on this hub's own Release Notes
   *  card, same treatment as the three approval-queue counts above even
   *  though this isn't an approval queue itself; it's still "something new
   *  worth a look" the same way those are. Purely local/static (no
   *  Supabase query), so it's set directly rather than through the
   *  Promise.all below. */
  unseenReleaseNotesCount = 0;
  /** Audits still being counted/reconciled — badged on this hub's own
   *  Audits card. Visible to any approved member (same reach the Audits
   *  card/route itself has), not just Manager+ the way the three approval-
   *  queue counts above are, since any approved member can act on an
   *  in-progress audit by submitting a count. */
  inProgressAuditCount = 0;

  async ngOnInit() {
    // getProfile() rather than authService.role() — the profile signal
    // populates asynchronously (see AuthService's own note on this), and by
    // the time this component exists manageGuard has already awaited a
    // fresh getProfile() of its own, so this is no more expensive and
    // avoids reading a signal that might not have settled yet.
    const profile = await this.authService.getProfile();
    const isAdmin = profile?.role === 'admin';

    const [{ count: retirementCount }, { count: transferCount }, { count: joinCount }, { count: auditCount }] = await Promise.all([
      this.supabase
        .from('inventory_items')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'retirement_pending'),
      this.supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .not('pending_transfer_to', 'is', null),
      // isAdmin can only be true when profile is non-null (it's derived from
      // profile?.role above), so profile!.organization_id is always a real
      // value on this branch.
      isAdmin
        ? this.supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', profile!.organization_id)
            .eq('membership_status', 'pending')
        : Promise.resolve({ count: 0, error: null }),
      this.supabase
        .from('inventory_audits')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'in_progress')
    ]);

    this.pendingRetirementCount = retirementCount ?? 0;
    this.pendingTaskTransferCount = transferCount ?? 0;
    this.pendingJoinRequestCount = joinCount ?? 0;
    this.inProgressAuditCount = auditCount ?? 0;

    if (profile) {
      this.unseenReleaseNotesCount = getUnseenChangelogCount(profile.id);
    }
  }
}
