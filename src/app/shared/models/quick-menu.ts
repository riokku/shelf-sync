/** Destinations a user can add to their own "Quick menu" (Account page),
 *  surfaced from a button in the center of HeaderComponent's top bar — see
 *  that component's own doc comment on quickMenuOptions(). Deliberately a
 *  flat list mirroring the nav drawer's own top-level links exactly (same
 *  keys/labels/icons/routes), not a broader set of app destinations —
 *  "quick access to what's already one tap away in the drawer" is the
 *  whole value proposition; letting someone build a second, deeper nav
 *  tree here would just be a worse drawer. `requiresManage` mirrors the
 *  drawer's own `@if (authService.canManage())` gate around the Manage
 *  link, so a staff member's picker never offers (and a staff member who
 *  was demoted never keeps) an option they can't actually reach. */
export interface QuickMenuOption {
  key: string;
  label: string;
  icon: string;
  routerLink: string;
  requiresManage?: boolean;
}

export const QUICK_MENU_OPTIONS: QuickMenuOption[] = [
  { key: 'home', label: 'Home', icon: 'home', routerLink: '/home' },
  { key: 'inventory', label: 'Inventory', icon: 'inventory_2', routerLink: '/inventory' },
  { key: 'tasks', label: 'Tasks', icon: 'checklist', routerLink: '/tasks' },
  { key: 'reservations', label: 'Reservations', icon: 'event', routerLink: '/manage/reservations' },
  { key: 'broadcasts', label: 'Broadcasts', icon: 'campaign', routerLink: '/broadcasts' },
  { key: 'manage', label: 'Manage', icon: 'admin_panel_settings', routerLink: '/manage', requiresManage: true },
  { key: 'help', label: 'Help', icon: 'help_outline', routerLink: '/help' },
  { key: 'account', label: 'Account', icon: 'account_circle', routerLink: '/account' }
];

/** A picker offering all 7 destinations at once would defeat "quick" —
 *  capped in AccountComponent's own picker UI (checkboxes disable once
 *  this many are selected), not enforced server-side (a stale/over-cap
 *  array from before this cap existed, or from editing the row directly,
 *  should still render — HeaderComponent's own quickMenuOptions() doesn't
 *  re-clamp, it just resolves whatever keys are actually stored). */
export const MAX_QUICK_MENU_ITEMS = 5;
