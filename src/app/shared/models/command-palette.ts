/** Backs HeaderComponent's global Ctrl/Cmd+K command palette. Every result
 *  the palette can show — a page destination, or a matched inventory item/
 *  task/person — collapses to this one shape so the template can render a
 *  single flat, keyboard-navigable list regardless of which group a result
 *  came from. `id` exists purely as a stable @for track value (results are
 *  rebuilt fresh on every keystroke, so object identity can't be relied on
 *  the way a component's own persisted list elements sometimes can be
 *  elsewhere in this app). */
export type CommandPaletteResultGroup =
  | 'Pages'
  | 'Inventory'
  | 'Tasks'
  | 'Reservations'
  | 'Audits'
  | 'Broadcasts'
  | 'Suppliers'
  | 'Orders'
  | 'People'
  | 'Organizations'
  | 'Users';

export interface CommandPaletteResult {
  id: string;
  group: CommandPaletteResultGroup;
  icon: string;
  label: string;
  sublabel?: string;
  routerLink: string[];
  queryParams?: Record<string, string>;
}

/** One entry per real page in the app (see app-routing.module.ts) — a
 *  broader list than shared/models/quick-menu.ts's own QUICK_MENU_OPTIONS,
 *  which is deliberately curated down to 8 destinations for the Account
 *  page's opt-in picker. This list exists to make *every* reachable page
 *  jumpable from the palette, so it mirrors the routing module's own
 *  breadcrumb labels/guards instead. `requiresManage`/`requiresAdmin`/
 *  `requiresPlatformAdmin` mirror each route's own `canActivate` guard
 *  (manageGuard/adminGuard/platformAdminGuard) — same fail-closed shape
 *  QUICK_MENU_OPTIONS' own `requiresManage` already established, so a
 *  demoted/never-privileged viewer never sees (or can navigate to, and get
 *  bounced from) a destination they can't actually reach. */
export interface CommandPaletteDestination {
  label: string;
  icon: string;
  routerLink: string;
  requiresManage?: boolean;
  requiresAdmin?: boolean;
  requiresPlatformAdmin?: boolean;
}

export const COMMAND_PALETTE_DESTINATIONS: CommandPaletteDestination[] = [
  { label: 'Home', icon: 'home', routerLink: '/home' },
  { label: 'Inventory', icon: 'inventory_2', routerLink: '/inventory' },
  { label: 'Tasks', icon: 'checklist', routerLink: '/tasks' },
  { label: 'Reservations', icon: 'event', routerLink: '/manage/reservations' },
  { label: 'Inventory Audits', icon: 'fact_check', routerLink: '/manage/audits' },
  { label: 'Broadcasts', icon: 'campaign', routerLink: '/broadcasts' },
  { label: 'Account', icon: 'account_circle', routerLink: '/account' },
  { label: 'Help', icon: 'help_outline', routerLink: '/help' },
  { label: 'Manage', icon: 'admin_panel_settings', routerLink: '/manage', requiresManage: true },
  { label: 'Manage Inventory', icon: 'inventory_2', routerLink: '/manage/inventory', requiresManage: true },
  { label: 'Manage Tasks', icon: 'checklist', routerLink: '/manage/tasks', requiresManage: true },
  { label: 'Manage Team', icon: 'group', routerLink: '/manage/team', requiresManage: true },
  { label: 'Activity Log', icon: 'history', routerLink: '/manage/activity', requiresManage: true },
  { label: 'Release Notes', icon: 'new_releases', routerLink: '/manage/release-notes', requiresManage: true },
  { label: 'Error Log', icon: 'bug_report', routerLink: '/manage/error-log', requiresManage: true },
  { label: 'Suppliers', icon: 'local_shipping', routerLink: '/manage/suppliers', requiresManage: true },
  { label: 'Orders', icon: 'shopping_cart', routerLink: '/manage/orders', requiresManage: true },
  { label: 'Reports', icon: 'bar_chart', routerLink: '/manage/reports', requiresManage: true },
  { label: 'Billing', icon: 'payments', routerLink: '/manage/billing', requiresAdmin: true },
  { label: 'Danger Zone', icon: 'warning', routerLink: '/manage/danger-zone', requiresAdmin: true },
  { label: 'Settings', icon: 'palette', routerLink: '/manage/settings', requiresAdmin: true },
  { label: 'Studio', icon: 'dashboard', routerLink: '/studio', requiresPlatformAdmin: true },
  { label: 'Studio Feedback', icon: 'feedback', routerLink: '/studio/feedback', requiresPlatformAdmin: true },
  { label: 'Studio Error Log', icon: 'bug_report', routerLink: '/studio/error-log', requiresPlatformAdmin: true },
  { label: 'Studio Organizations', icon: 'apartment', routerLink: '/studio/organizations', requiresPlatformAdmin: true },
  { label: 'Studio Users', icon: 'people', routerLink: '/studio/users', requiresPlatformAdmin: true },
  { label: 'Studio Usage', icon: 'insights', routerLink: '/studio/usage', requiresPlatformAdmin: true },
  { label: 'Studio Email Log', icon: 'mail', routerLink: '/studio/email-log', requiresPlatformAdmin: true },
  { label: 'Studio Audit Log', icon: 'receipt_long', routerLink: '/studio/audit-log', requiresPlatformAdmin: true }
];

/** Capped per group (Pages/Inventory/Tasks/People) so the palette's result
 *  list stays short and scannable rather than growing unbounded off a broad
 *  search term — same "a handful, not everything" instinct
 *  StudioUsersComponent's own RESULT_LIMIT already applies to its cross-org
 *  search, just per-group here since the palette mixes several kinds of
 *  result in one list. */
export const COMMAND_PALETTE_MAX_RESULTS_PER_GROUP = 5;
