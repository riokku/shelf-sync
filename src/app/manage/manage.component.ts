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

  /** Tasks currently offered to someone and awaiting their accept/decline —
   *  the only "pending request" concept tasks have, same shape as inventory
   *  retirement requests (badged elsewhere, on Manage > Inventory itself)
   *  and team join requests below. Visible to any Manager+, same audience
   *  as the Tasks card itself. */
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

    const [{ count: transferCount }, { count: joinCount }] = await Promise.all([
      this.supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .not('pending_transfer_to', 'is', null),
      isAdmin
        ? this.supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('membership_status', 'pending')
        : Promise.resolve({ count: 0, error: null })
    ]);

    this.pendingTaskTransferCount = transferCount ?? 0;
    this.pendingJoinRequestCount = joinCount ?? 0;
  }
}
