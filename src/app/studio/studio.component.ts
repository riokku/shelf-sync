import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';
import { SupabaseService } from '../core/supabase.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';

/** A card hub, same shape as ManageComponent, for a genuinely different
 *  audience: the app's own maintainer, not any org's own admin/manager.
 *  Every RLS policy and every manage/* route in this schema scopes
 *  strictly to the caller's own organization_id — this is the first area
 *  that deliberately spans every org at once, gated by
 *  `platformAdminGuard`/`profiles.is_platform_admin` (see the
 *  add_platform_admin migration) rather than `role`. Reachable via a
 *  "Studio" link in HeaderComponent's nav drawer and a card on Home, both
 *  gated the same way, so nobody else ever sees either exists. */
@Component({
  selector: 'app-studio',
  imports: [RouterModule, MatBadgeModule, MatIconModule, BreadcrumbsComponent],
  templateUrl: './studio.component.html',
  styleUrl: './studio.component.scss',
})
export class StudioComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  /** Feedback nobody's looked at yet — badged on the Feedback card, same
   *  "pending queue" badge treatment ManageComponent's own cards use. */
  newFeedbackCount = 0;

  async ngOnInit() {
    const { count } = await this.supabase
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new');
    this.newFeedbackCount = count ?? 0;
  }
}
