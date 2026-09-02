import { Component, DestroyRef, ElementRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { NotificationCenterService } from '../core/notification-center.service';
import { CommandPaletteService } from '../core/command-palette.service';
import { ConfettiService } from '../core/confetti.service';
import { NotificationService } from '../core/notification.service';
import { EmptyStateComponent } from '../shared/components/empty-state/empty-state.component';
import { UserAvatarComponent } from '../shared/components/user-avatar/user-avatar.component';
import { notificationIcon, UserNotification } from '../shared/models/notification.model';
import { QUICK_MENU_OPTIONS } from '../shared/models/quick-menu';
import { CommandPaletteResult } from '../shared/models/command-palette';
import { needsRestockAttention } from '../shared/utils/inventory-stock';
import { isProfileOnline } from '../shared/utils/presence';

@Component({
    selector: 'app-header',
    imports: [
      A11yModule, DatePipe, FormsModule, MatBadgeModule, MatButtonModule, MatDividerModule, MatIconModule, MatTooltipModule,
      RouterModule, EmptyStateComponent, UserAvatarComponent
    ],
    templateUrl: './header.component.html',
    styleUrl: './header.component.scss'
})
export class HeaderComponent {
  protected authService = inject(AuthService);
  protected siteSettings = inject(SiteSettingsService);
  protected themeMode = inject(ThemeModeService);
  protected notificationCenter = inject(NotificationCenterService);
  protected commandPalette = inject(CommandPaletteService);
  protected readonly notificationIcon = notificationIcon;
  private supabase = inject(SupabaseService).client;
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private confetti = inject(ConfettiService);
  private notification = inject(NotificationService);

  /** The 3 trigger buttons that open the panels below — grabbed so each
   *  close method can hand focus back to whichever one opened it. Needed
   *  because all 3 panels stay permanently in the DOM ([attr.inert]-toggled,
   *  not @if — see each panel's own doc comment), so CdkTrapFocus's own
   *  restore-previously-focused-element behavior (which only runs from its
   *  ngOnDestroy) never fires on a close; without this, focus is simply
   *  dropped to document.body every time one of these panels closes. */
  // { read: ElementRef } is required here — all 3 triggers are
  // mat-icon-button, and modern (MDC-based) Angular Material buttons are
  // real Components, not plain directives, so an unqualified
  // @ViewChild('name') on one of these resolves to the MatIconButton
  // component instance (which has no .nativeElement of its own) rather than
  // the native <button> ElementRef this needs to call .focus() on.
  @ViewChild('navMenuTrigger', { read: ElementRef }) private navMenuTrigger?: ElementRef<HTMLElement>;
  @ViewChild('notificationsTrigger', { read: ElementRef }) private notificationsTrigger?: ElementRef<HTMLElement>;
  @ViewChild('paletteTrigger', { read: ElementRef }) private paletteTrigger?: ElementRef<HTMLElement>;
  /** The palette's own search input — see handlePaletteShortcut()'s own doc
   *  comment for why this needs to be distinguished from "typing elsewhere". */
  @ViewChild('paletteQueryInput') private paletteQueryInput?: ElementRef<HTMLInputElement>;

  /** Own fixed-position slide-out panel (see header.component.scss) rather
   *  than MatMenu — a menu is a dropdown anchored to its trigger, sized to
   *  its content, which on a narrow viewport could end up wider than the
   *  remaining space next to the hamburger button and push the page into
   *  horizontal scroll. This is pinned to the right edge and capped at
   *  `min(80vw, 20rem)`, so it can never do that. The only nav in this app
   *  at any screen width (see .nav-drawer in header.component.scss) —
   *  not a narrow-viewport fallback for a row of links. */
  private readonly _isNavMenuOpen = signal(false);
  readonly isNavMenuOpen = this._isNavMenuOpen.asReadonly();

  openNavMenu() {
    this._isNavMenuOpen.set(true);
  }

  closeNavMenu() {
    this._isNavMenuOpen.set(false);
    this.navMenuTrigger?.nativeElement.focus();
  }

  /** Same "own fixed-position panel rather than MatMenu" shape as the nav
   *  drawer above, for the same width-overflow-risk reasoning — but
   *  positioned as a small top-right dropdown near the bell rather than a
   *  full-height edge-to-edge drawer, since a short notification list
   *  doesn't need that much room. Always in the DOM (see the template's own
   *  [attr.inert]) so both open and close get the panel's transition. The
   *  bell itself is a persistent top-bar icon (unlike every other nav
   *  control, which lives only in the drawer) — its own panel is unrelated
   *  to nav and doesn't belong buried a click deeper. */
  private readonly _isNotificationsOpen = signal(false);
  readonly isNotificationsOpen = this._isNotificationsOpen.asReadonly();

  toggleNotifications() {
    this._isNotificationsOpen.update(open => !open);
  }

  closeNotifications() {
    this._isNotificationsOpen.set(false);
    this.notificationsTrigger?.nativeElement.focus();
  }

  /** Marks the clicked row read and closes the panel — navigation itself is
   *  handled by the row's own [routerLink], not here, so ctrl/cmd-click
   *  (open in new tab) still works normally. */
  onNotificationRowClick(notification: UserNotification) {
    void this.notificationCenter.markAsRead(notification.id);
    this.closeNotifications();
  }

  /** Same "own fixed-position panel rather than MatMenu" shape as the two
   *  panels above, but centered near the top of the viewport rather than
   *  right-anchored — the conventional command-palette placement. Opens via
   *  its own trigger button or the global Ctrl/Cmd+K shortcut below, from
   *  any authenticated page (HeaderComponent is the one component always
   *  mounted for all of them — see AppComponent.showChrome()). */
  private readonly _isPaletteOpen = signal(false);
  readonly isPaletteOpen = this._isPaletteOpen.asReadonly();
  paletteQuery = '';
  paletteActiveIndex = 0;

  /** No existing global keydown listener anywhere in this app before this —
   *  and, as it turns out, at most one is ever safe to declare: two separate
   *  `@HostListener('window:keydown', ...)`-decorated methods on the same
   *  class silently collide (the second one's compiled host binding
   *  replaces the first's rather than both being registered), so
   *  handlePaletteShortcut()/handleKonamiCode() below are deliberately
   *  plain methods, both invoked from this one real listener — caught by
   *  the Ctrl+K/Cmd+K spec's own tests going red the moment a second
   *  `@HostListener` for the identical event was added here, worth
   *  remembering the same way this schema's other "diff against the
   *  previous version"/double-apply lessons are. */
  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent) {
    this.handlePaletteShortcut(event);
    this.handleKonamiCode(event);
  }

  /** Matches either modifier key regardless of platform (the tooltip label
   *  below is what actually differs by platform). preventDefault() stops
   *  the browser's own Ctrl/Cmd+K address-bar-search binding from firing
   *  alongside it.
   *
   *  Skips entirely while focus is already inside a text field elsewhere in
   *  the app (an inventory item's name, a task note, a settings field,
   *  etc.) — without this, the shortcut hijacked the keystroke out of
   *  whatever the user was typing and toggled the palette instead, since
   *  this is a genuine global `window:keydown` listener with no target
   *  check. The one exception is the palette's own search input — Ctrl/Cmd+K
   *  toggling it closed again from inside itself is expected, not a bug. */
  handlePaletteShortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') {
      return;
    }
    const target = event.target as HTMLElement | null;
    const isTypingElsewhere =
      !!target &&
      target !== this.paletteQueryInput?.nativeElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    if (isTypingElsewhere) {
      return;
    }
    event.preventDefault();
    this.togglePalette();
  }

  /** The classic Konami code — a small, deliberately pointless easter egg
   *  that changes nothing about the app beyond a confetti burst and a toast.
   *  Tracked as a plain index into the sequence rather than a rolling
   *  keystroke buffer diffed on every keydown — simpler, and a wrong key
   *  just resets the index (to 1 if that wrong key happens to also be the
   *  sequence's own first key, so immediately restarting the code after a
   *  slip doesn't require an extra keypress to "prime" it again, otherwise
   *  back to 0) rather than needing to re-scan history for a possible
   *  restart partway through. event.key rather than .code so this reads the
   *  same regardless of keyboard layout, lowercased only for the two single-
   *  character letter keys at the end (arrow key names have no case to
   *  normalize) — same key-reading approach handlePaletteShortcut above
   *  already uses. */
  private static readonly KONAMI_SEQUENCE = [
    'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
    'b', 'a'
  ];
  private konamiIndex = 0;

  handleKonamiCode(event: KeyboardEvent) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const expected = HeaderComponent.KONAMI_SEQUENCE[this.konamiIndex];

    if (key !== expected) {
      this.konamiIndex = key === HeaderComponent.KONAMI_SEQUENCE[0] ? 1 : 0;
      return;
    }

    this.konamiIndex++;
    if (this.konamiIndex === HeaderComponent.KONAMI_SEQUENCE.length) {
      this.konamiIndex = 0;
      this.confetti.burst();
      this.notification.success('🕹️ Konami code! You found the easter egg.');
    }
  }

  togglePalette() {
    if (this._isPaletteOpen()) {
      this.closePalette();
    } else {
      this.openPalette();
    }
  }

  openPalette() {
    this._isPaletteOpen.set(true);
    this.paletteQuery = '';
    this.paletteActiveIndex = 0;
    void this.commandPalette.ensureDataLoaded();
  }

  closePalette() {
    this._isPaletteOpen.set(false);
    this.paletteTrigger?.nativeElement.focus();
  }

  /** A plain getter, not a computed() — paletteQuery is a plain two-way-
   *  bound field (ngModel), not a signal. CommandPaletteService.results()
   *  is itself a pure, instant, local filter (see its own doc comment for
   *  why no network call happens per keystroke), so recomputing on every
   *  template read here is cheap. */
  get paletteResults(): CommandPaletteResult[] {
    return this.commandPalette.results(this.paletteQuery);
  }

  onPaletteQueryChange() {
    this.paletteActiveIndex = 0;
  }

  movePaletteSelection(delta: number) {
    const results = this.paletteResults;
    if (results.length === 0) {
      return;
    }
    this.paletteActiveIndex = (this.paletteActiveIndex + delta + results.length) % results.length;
  }

  /** Enter-key activation of whichever result is currently highlighted —
   *  mouse/tap selection instead goes through each result's own
   *  [routerLink] directly (see the template), which already handles
   *  ctrl/cmd-click to open in a new tab the same way a notification row
   *  does. */
  activatePaletteSelection() {
    const result = this.paletteResults[this.paletteActiveIndex];
    if (result) {
      this.selectPaletteResult(result);
    }
  }

  selectPaletteResult(result: CommandPaletteResult) {
    this.router.navigate(result.routerLink, { queryParams: result.queryParams });
    this.closePalette();
  }

  /** Purely the trigger button's own tooltip text — the shortcut handler
   *  above matches either modifier key regardless of platform. */
  get paletteShortcutLabel(): string {
    return navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl+K';
  }

  /** Resolves the signed-in user's own Account-page selection
   *  (profile.quick_menu_items, a plain array of QuickMenuOption keys) back
   *  into full options, in QUICK_MENU_OPTIONS' own fixed order rather than
   *  whatever order they were originally checked in — simpler than
   *  supporting drag-to-reorder for a first pass, and means unchecking then
   *  rechecking an item can't scramble the menu. requiresManage options are
   *  filtered out here (not just hidden by AccountComponent's own picker)
   *  so a manager who added "Manage" and was later demoted to staff simply
   *  stops seeing it, the same fail-closed shape the nav drawer's own
   *  @if (canManage()) already has around that same link. */
  readonly quickMenuItems = computed(() => {
    const profile = this.authService.profile();
    if (!profile?.quick_menu_enabled) {
      return [];
    }
    const canManage = this.authService.canManage();
    const selected = new Set(profile.quick_menu_items ?? []);
    return QUICK_MENU_OPTIONS.filter(option => selected.has(option.key) && (!option.requiresManage || canManage));
  });

  /** Hides the row of links entirely rather than reserving an empty patch
   *  of header — true when enabled *and* at least one still-reachable item
   *  resolved above. */
  readonly showQuickMenu = computed(() => this.quickMenuItems().length > 0);

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
    // realtime for. Same event also closes the nav drawer, so tapping a
    // link in it doesn't leave the drawer sitting open over the page it
    // just navigated to.
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.closeNavMenu();
        this.closeNotifications();
        this.closePalette();
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
        .eq('organization_id', this.authService.organizationId()!)
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
    // Narrow select, approved members only, explicitly org-scoped rather
    // than trusting RLS alone the way every other unfiltered .from(...)
    // .select() in this app can — profiles is the one table where that
    // trust breaks down for a caller who's also a platform admin (see
    // add_platform_admin's own "view everything" SELECT policy, OR'd onto
    // the org-scoped one), so this and the pending-count query above both
    // carry an explicit .eq('organization_id', ...) as a result. Pending
    // join requests aren't "team members" yet, same reasoning
    // ManageTeamComponent's assignableProfiles excludes them from anywhere
    // a role/task-standing matters.
    const { data } = await this.supabase
      .from('profiles')
      .select('last_active_at')
      .eq('organization_id', this.authService.organizationId()!)
      .eq('membership_status', 'approved');

    this._onlineTeamCount.set((data ?? []).filter(row => isProfileOnline(row.last_active_at)).length);
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/']);
  }
}
