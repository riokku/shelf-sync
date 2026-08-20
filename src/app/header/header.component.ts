import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { SiteSettingsService } from '../core/site-settings.service';
import { SupabaseService } from '../core/supabase.service';
import { ThemeModeService } from '../core/theme-mode.service';
import { needsRestockAttention } from '../shared/utils/inventory-stock';
import { isProfileOnline } from '../shared/utils/presence';

@Component({
    selector: 'app-header',
    imports: [A11yModule, MatBadgeModule, MatButtonModule, MatDividerModule, MatIconModule, MatTooltipModule, RouterModule],
    templateUrl: './header.component.html',
    styleUrl: './header.component.scss'
})
export class HeaderComponent {
  protected authService = inject(AuthService);
  protected siteSettings = inject(SiteSettingsService);
  protected themeMode = inject(ThemeModeService);
  private supabase = inject(SupabaseService).client;
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /** Own fixed-position slide-out panel (see header.component.scss) rather
   *  than MatMenu — a menu is a dropdown anchored to its trigger, sized to
   *  its content, which on a narrow viewport could end up wider than the
   *  remaining space next to the hamburger button and push the page into
   *  horizontal scroll. This is pinned to the right edge and capped at
   *  `min(80vw, 20rem)`, so it can never do that. */
  private readonly _isMobileMenuOpen = signal(false);
  readonly isMobileMenuOpen = this._isMobileMenuOpen.asReadonly();

  openMobileMenu() {
    this._isMobileMenuOpen.set(true);
  }

  closeMobileMenu() {
    this._isMobileMenuOpen.set(false);
  }

  /** Pending inventory retirement requests and pending task transfers (any
   *  Manager+ can act on both) plus, for admins only, pending team join
   *  requests — the three "kinds" of admin-facing approval queue this app
   *  has (same three ManageComponent's hub cards badge individually).
   *  Combined into one small notification-style count on the Manage nav
   *  link, Teams/Twitter-style, rather than a separate badge per kind. */
  private readonly _pendingManageCount = signal(0);
  readonly pendingManageCount = this._pendingManageCount.asReadonly();

  /** Items at or under their low quantity threshold, or already at zero —
   *  unlike pendingManageCount above, this isn't an approval queue gated to
   *  Manager+, it's the same "low stock" fact InventoryComponent/
   *  ModalTableComponent already badge per-item to *every* authenticated
   *  user, just surfaced here as one count so it's visible without having
   *  to go looking for it (see needsRestockAttention() for why out-of-stock
   *  isn't just a subset of low-stock). */
  private readonly _lowStockCount = signal(0);
  readonly lowStockCount = this._lowStockCount.asReadonly();

  /** How many approved org members are currently online (see
   *  shared/utils/presence.ts) — shown right below the org name next to the
   *  logo. Unlike the two counts above, this is also polled on a plain
   *  interval (see the setInterval below), not just on auth changes/
   *  navigation — who's online changes with the mere passage of time, not
   *  just user actions, the same reasoning ManageTeamComponent's own
   *  presence poll has. */
  private readonly _onlineTeamCount = signal(0);
  readonly onlineTeamCount = this._onlineTeamCount.asReadonly();

  constructor() {
    // Re-runs whenever the resolved profile changes (login, logout, role
    // change) — canManage()/role() both derive from it.
    effect(() => {
      if (this.authService.canManage()) {
        void this.loadPendingManageCount();
      } else {
        this._pendingManageCount.set(0);
      }

      if (this.authService.isAuthenticated()) {
        void this.loadLowStockCount();
        void this.loadOnlineTeamCount();
      } else {
        this._lowStockCount.set(0);
        this._onlineTeamCount.set(0);
      }
    });

    // Also refresh on navigation — e.g. after approving/declining something
    // on a Manage page and clicking elsewhere, or discarding/restocking an
    // item on Inventory. Cheap count-only queries, not worth wiring up
    // realtime for. Same event also closes the mobile drawer, so tapping a
    // link in it doesn't leave the drawer sitting open over the page it
    // just navigated to.
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.closeMobileMenu();
        if (this.authService.canManage()) {
          void this.loadPendingManageCount();
        }
        if (this.authService.isAuthenticated()) {
          void this.loadLowStockCount();
          void this.loadOnlineTeamCount();
        }
      }
    });

    const onlineTeamCountIntervalId = window.setInterval(() => {
      if (this.authService.isAuthenticated()) {
        void this.loadOnlineTeamCount();
      }
    }, 30_000);
    this.destroyRef.onDestroy(() => window.clearInterval(onlineTeamCountIntervalId));
  }

  private async loadPendingManageCount() {
    const [{ count: retirementCount }, { count: transferCount }, { count: joinRequestCount }] = await Promise.all([
      this.supabase
        .from('inventory_items')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'retirement_pending'),
      this.supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .not('pending_transfer_to', 'is', null),
      this.supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('membership_status', 'pending')
    ]);

    // Join requests are admin-only to approve — a manager sees just the
    // retirement + transfer counts, so the badge only reflects requests
    // they can act on.
    const isAdmin = this.authService.role() === 'admin';
    this._pendingManageCount.set(
      (retirementCount ?? 0) + (transferCount ?? 0) + (isAdmin ? joinRequestCount ?? 0 : 0)
    );
  }

  private async loadLowStockCount() {
    // Narrow select — this is only ever used to compute a count, not to
    // render any of these rows. RLS already scopes this to the caller's
    // own organization, same as every other unfiltered .from(...).select()
    // in this app. Retired items are excluded the same way the default
    // Inventory page filter excludes them — nothing to restock there.
    const { data } = await this.supabase
      .from('inventory_items')
      .select('quantity_remaining, low_quantity_threshold')
      .neq('status', 'retired');

    this._lowStockCount.set((data ?? []).filter(needsRestockAttention).length);
  }

  private async loadOnlineTeamCount() {
    // Narrow select, approved members only — RLS already scopes this to the
    // caller's own organization. Pending join requests aren't "team
    // members" yet, same reasoning ManageTeamComponent's assignableProfiles
    // excludes them from anywhere a role/task-standing matters.
    const { data } = await this.supabase
      .from('profiles')
      .select('last_active_at')
      .eq('membership_status', 'approved');

    this._onlineTeamCount.set((data ?? []).filter(row => isProfileOnline(row.last_active_at)).length);
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/']);
  }
}
