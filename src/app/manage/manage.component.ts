import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';

@Component({
  selector: 'app-manage',
  imports: [RouterModule, MatBadgeModule, MatIconModule, BreadcrumbsComponent],
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

  async ngOnInit() {
    // getProfile() rather than authService.role() — the profile signal
    // populates asynchronously (see AuthService's own note on this), and by
    // the time this component exists manageGuard has already awaited a
    // fresh getProfile() of its own, so this is no more expensive and
    // avoids reading a signal that might not have settled yet.
    const profile = await this.authService.getProfile();
    const isAdmin = profile?.role === 'admin';

    const [{ count: retirementCount }, { count: transferCount }, { count: joinCount }] = await Promise.all([
      this.supabase
        .from('inventory_items')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'retirement_pending'),
      this.supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .not('pending_transfer_to', 'is', null),
      isAdmin
        ? this.supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('membership_status', 'pending')
        : Promise.resolve({ count: 0, error: null })
    ]);

    this.pendingRetirementCount = retirementCount ?? 0;
    this.pendingTaskTransferCount = transferCount ?? 0;
    this.pendingJoinRequestCount = joinCount ?? 0;
  }
}
