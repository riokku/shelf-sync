import { Component, effect, inject, signal } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { SiteSettingsService } from '../core/site-settings.service';
import { SupabaseService } from '../core/supabase.service';
import { ThemeModeService } from '../core/theme-mode.service';

@Component({
    selector: 'app-header',
    imports: [MatBadgeModule, MatButtonModule, MatIconModule, RouterModule],
    templateUrl: './header.component.html',
    styleUrl: './header.component.scss'
})
export class HeaderComponent {
  protected authService = inject(AuthService);
  protected siteSettings = inject(SiteSettingsService);
  protected themeMode = inject(ThemeModeService);
  private supabase = inject(SupabaseService).client;
  private router = inject(Router);

  /** Pending inventory retirement requests (any Manager+ can act on these)
   *  plus, for admins only, pending team join requests — the two "kinds" of
   *  admin-facing approval queue this app has. Combined into one small
   *  notification-style count on the Manage nav link, Teams/Twitter-style,
   *  rather than a separate badge per kind. */
  private readonly _pendingManageCount = signal(0);
  readonly pendingManageCount = this._pendingManageCount.asReadonly();

  constructor() {
    // Re-runs whenever the resolved profile changes (login, logout, role
    // change) — canManage()/role() both derive from it.
    effect(() => {
      if (this.authService.canManage()) {
        void this.loadPendingManageCount();
      } else {
        this._pendingManageCount.set(0);
      }
    });

    // Also refresh on navigation — e.g. after approving/declining something
    // on a Manage page and clicking elsewhere. Cheap count-only queries, not
    // worth wiring up realtime for.
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd && this.authService.canManage()) {
        void this.loadPendingManageCount();
      }
    });
  }

  private async loadPendingManageCount() {
    const [{ count: retirementCount }, { count: joinRequestCount }] = await Promise.all([
      this.supabase
        .from('inventory_items')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'retirement_pending'),
      this.supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('membership_status', 'pending')
    ]);

    // Join requests are admin-only to approve — a manager sees just the
    // retirement count, so the badge only reflects requests they can act on.
    const isAdmin = this.authService.role() === 'admin';
    this._pendingManageCount.set((retirementCount ?? 0) + (isAdmin ? joinRequestCount ?? 0 : 0));
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/']);
  }
}
