import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { approvedGuard } from './core/guards/approved.guard';
import { manageGuard } from './core/guards/manage.guard';
import { adminGuard } from './core/guards/admin.guard';
import { platformAdminGuard } from './core/guards/platform-admin.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';
import { BreadcrumbParent } from './shared/components/breadcrumbs/breadcrumbs.component';

// Shared by every route nested under /manage below, so their breadcrumbs
// read Home / Manage / {page} — the Manage hub itself doesn't need this,
// it only ever sits one level under Home.
const MANAGE_BREADCRUMB_PARENT: BreadcrumbParent = { label: 'Manage', link: '/manage' };

// Same idea, one level under /studio instead — deliberately a separate
// constant rather than reusing MANAGE_BREADCRUMB_PARENT, since /studio is a
// genuinely different, non-nested area (see StudioComponent's own doc
// comment): an org's own admin should never see a "Manage" crumb leading
// there, and vice versa.
const STUDIO_BREADCRUMB_PARENT: BreadcrumbParent = { label: 'Studio', link: '/studio' };

// Every route gets an explicit `title` — Angular's default TitleStrategy
// only ever writes document.title when the *active* route defines one and
// silently leaves the previous title in place otherwise, so leaving any
// route without one risks it inheriting whatever the last-visited route set
// (see LandingComponent, the first route to actually set a title).
//
// Every route below is lazy (loadComponent, not component) rather than a
// top-level import — previously every routed component (and everything it
// eagerly imported in turn) shipped in the one initial bundle regardless
// of whether a given visit ever touched it, which is most of why that
// bundle had grown past its own budget (see angular.json's initial budget,
// raised more than once purely to accommodate this). Each route now only
// loads once actually navigated to; only the always-on shell
// (HeaderComponent/FooterComponent, imported directly into AppModule) and
// route-independent singletons (services, guards) stay eager.
const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./landing/landing.component').then(m => m.LandingComponent),
    title: 'ShelfSync | Inventory management, simplified'
  },
  {
    path: 'pricing',
    loadComponent: () => import('./pricing/pricing.component').then(m => m.PricingComponent),
    title: 'ShelfSync | Pricing'
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then(m => m.LoginComponent),
    title: 'ShelfSync | Log in'
  },
  {
    path: 'register',
    loadComponent: () => import('./register/register.component').then(m => m.RegisterComponent),
    title: 'ShelfSync | Sign up'
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent),
    title: 'ShelfSync | Reset your password'
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./reset-password/reset-password.component').then(m => m.ResetPasswordComponent),
    title: 'ShelfSync | Choose a new password'
  },
  {
    path: 'privacy',
    loadComponent: () => import('./privacy/privacy.component').then(m => m.PrivacyComponent),
    title: 'ShelfSync | Privacy Policy'
  },
  {
    path: 'terms',
    loadComponent: () => import('./terms/terms.component').then(m => m.TermsComponent),
    title: 'ShelfSync | Terms of Service'
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.component').then(m => m.HomeComponent),
    canActivate: [approvedGuard],
    title: 'ShelfSync | Home'
  },
  {
    path: 'pending-approval',
    loadComponent: () => import('./pending-approval/pending-approval.component').then(m => m.PendingApprovalComponent),
    // Plain authGuard, not approvedGuard — that would just bounce this
    // route back to itself. This is the one place a signed-in-but-not-yet-
    // approved (or denied) session is actually allowed to land.
    canActivate: [authGuard],
    title: 'ShelfSync | Pending approval'
  },
  {
    path: 'inventory',
    loadComponent: () => import('./inventory/inventory.component').then(m => m.InventoryComponent),
    canActivate: [approvedGuard],
    data: { breadcrumb: 'Inventory' },
    title: 'ShelfSync | Inventory'
  },
  {
    path: 'account',
    loadComponent: () => import('./account/account.component').then(m => m.AccountComponent),
    canActivate: [approvedGuard],
    data: { breadcrumb: 'Account' },
    title: 'ShelfSync | Account'
  },
  {
    path: 'help',
    loadComponent: () => import('./help/help.component').then(m => m.HelpComponent),
    canActivate: [approvedGuard],
    data: { breadcrumb: 'Help' },
    title: 'ShelfSync | Help'
  },
  {
    path: 'tasks',
    loadComponent: () => import('./tasks/tasks.component').then(m => m.TasksComponent),
    canActivate: [approvedGuard],
    data: { breadcrumb: 'Tasks' },
    title: 'ShelfSync | Tasks'
  },
  {
    path: 'manage',
    loadComponent: () => import('./manage/manage.component').then(m => m.ManageComponent),
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Manage' },
    title: 'ShelfSync | Manage'
  },
  {
    path: 'manage/inventory',
    loadComponent: () => import('./manage/inventory/manage-inventory.component').then(m => m.ManageInventoryComponent),
    canActivate: [approvedGuard, manageGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { breadcrumb: 'Inventory', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Manage Inventory'
  },
  {
    path: 'manage/tasks',
    loadComponent: () => import('./manage/tasks/manage-tasks.component').then(m => m.ManageTasksComponent),
    canActivate: [approvedGuard, manageGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { breadcrumb: 'Tasks', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Manage Tasks'
  },
  {
    path: 'manage/team',
    loadComponent: () => import('./manage/team/manage-team.component').then(m => m.ManageTeamComponent),
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Team', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Manage Team'
  },
  {
    path: 'manage/activity',
    loadComponent: () => import('./manage/activity/manage-activity.component').then(m => m.ManageActivityComponent),
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Activity Log', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Activity Log'
  },
  {
    path: 'manage/release-notes',
    loadComponent: () => import('./manage/release-notes/manage-release-notes.component').then(m => m.ManageReleaseNotesComponent),
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Release Notes', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Release Notes'
  },
  {
    path: 'manage/error-log',
    loadComponent: () => import('./manage/error-log/manage-error-log.component').then(m => m.ManageErrorLogComponent),
    // manageGuard (admin OR manager), not adminGuard — matches
    // client_error_log's own SELECT policy exactly (see add_client_error_log).
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Error Log', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Error Log'
  },
  {
    path: 'manage/suppliers',
    loadComponent: () => import('./manage/suppliers/manage-suppliers.component').then(m => m.ManageSuppliersComponent),
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Suppliers', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Suppliers'
  },
  {
    path: 'manage/orders',
    loadComponent: () => import('./manage/orders/manage-orders.component').then(m => m.ManageOrdersComponent),
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Orders', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Orders'
  },
  {
    path: 'manage/reservations',
    loadComponent: () => import('./manage/reservations/manage-reservations.component').then(m => m.ManageReservationsComponent),
    // approvedGuard only, not manageGuard — every approved org member can
    // place/action reservations now (RLS/RPC-scoped: staff only see and act
    // on their own, admin/manager see the whole org's — see
    // 20260904120000_widen_reservation_access_to_staff.sql), so this is the
    // one manage/* route reachable without admin/manager. No
    // breadcrumbParent for the same reason — MANAGE_BREADCRUMB_PARENT links
    // to /manage, which manageGuard would bounce a staff viewer straight
    // back out of.
    canActivate: [approvedGuard],
    data: { breadcrumb: 'Reservations' },
    title: 'ShelfSync | Reservations'
  },
  {
    path: 'manage/reports',
    loadComponent: () => import('./manage/reports/manage-reports.component').then(m => m.ManageReportsComponent),
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Reports', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Reports'
  },
  {
    path: 'manage/billing',
    loadComponent: () => import('./manage/billing/manage-billing.component').then(m => m.ManageBillingComponent),
    // adminGuard, not manageGuard — billing is financial information, same
    // audience as Danger Zone, not the broader admin-or-manager audience
    // the rest of Manage's sub-pages use.
    canActivate: [approvedGuard, adminGuard],
    data: { breadcrumb: 'Billing', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Billing'
  },
  {
    path: 'manage/danger-zone',
    loadComponent: () => import('./manage/danger-zone/manage-danger-zone.component').then(m => m.ManageDangerZoneComponent),
    canActivate: [approvedGuard, adminGuard],
    data: { breadcrumb: 'Danger Zone', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Danger Zone'
  },
  {
    path: 'manage/settings',
    loadComponent: () => import('./manage/settings/settings.component').then(m => m.SettingsComponent),
    canActivate: [approvedGuard, adminGuard],
    data: { breadcrumb: 'Settings', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Settings'
  },
  {
    path: 'studio',
    loadComponent: () => import('./studio/studio.component').then(m => m.StudioComponent),
    canActivate: [approvedGuard, platformAdminGuard],
    data: { breadcrumb: 'Studio' },
    title: 'ShelfSync | Studio'
  },
  {
    path: 'studio/feedback',
    loadComponent: () => import('./studio/feedback/studio-feedback.component').then(m => m.StudioFeedbackComponent),
    canActivate: [approvedGuard, platformAdminGuard],
    data: { breadcrumb: 'Feedback', breadcrumbParent: STUDIO_BREADCRUMB_PARENT },
    title: 'ShelfSync | Studio Feedback'
  },
  {
    path: 'studio/error-log',
    loadComponent: () => import('./studio/error-log/studio-error-log.component').then(m => m.StudioErrorLogComponent),
    canActivate: [approvedGuard, platformAdminGuard],
    data: { breadcrumb: 'Error Log', breadcrumbParent: STUDIO_BREADCRUMB_PARENT },
    title: 'ShelfSync | Studio Error Log'
  },
  {
    path: 'studio/organizations',
    loadComponent: () =>
      import('./studio/organizations/studio-organizations.component').then(m => m.StudioOrganizationsComponent),
    canActivate: [approvedGuard, platformAdminGuard],
    data: { breadcrumb: 'Organizations', breadcrumbParent: STUDIO_BREADCRUMB_PARENT },
    title: 'ShelfSync | Studio Organizations'
  },
  // Catches any URL that doesn't match a route above — must stay last.
  // Unguarded (reachable by a signed-out visitor too, see
  // NotFoundComponent's own doc comment). Gets an explicit `title` like
  // every other route above, precisely because Angular's TitleStrategy
  // would otherwise leave the previously-visited page's title in place —
  // confusing paired with a "page not found" body.
  {
    path: '**',
    loadComponent: () => import('./not-found/not-found.component').then(m => m.NotFoundComponent),
    title: 'ShelfSync | Page not found'
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      // Angular's default ('disabled') leaves the window at whatever scroll
      // offset the previous page happened to be at — e.g. clicking "Privacy
      // Policy" in the footer partway down the landing page would land on
      // /privacy already scrolled down, since routing swaps the component
      // in place without touching document scroll. 'enabled' resets to the
      // top on every forward navigation, and still restores the previous
      // position on browser back/forward (unlike 'top', which would do that
      // unconditionally too).
      scrollPositionRestoration: 'enabled'
    })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
