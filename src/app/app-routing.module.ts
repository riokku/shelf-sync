import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { approvedGuard } from './core/guards/approved.guard';
import { manageGuard } from './core/guards/manage.guard';
import { adminGuard } from './core/guards/admin.guard';
import { BreadcrumbParent } from './shared/components/breadcrumbs/breadcrumbs.component';

// Shared by every route nested under /manage below, so their breadcrumbs
// read Home / Manage / {page} — the Manage hub itself doesn't need this,
// it only ever sits one level under Home.
const MANAGE_BREADCRUMB_PARENT: BreadcrumbParent = { label: 'Manage', link: '/manage' };

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
    data: { breadcrumb: 'Inventory', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Manage Inventory'
  },
  {
    path: 'manage/tasks',
    loadComponent: () => import('./manage/tasks/manage-tasks.component').then(m => m.ManageTasksComponent),
    canActivate: [approvedGuard, manageGuard],
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
    path: 'manage/danger-zone',
    loadComponent: () => import('./manage/danger-zone/manage-danger-zone.component').then(m => m.ManageDangerZoneComponent),
    canActivate: [approvedGuard, adminGuard],
    data: { breadcrumb: 'Danger Zone', breadcrumbParent: MANAGE_BREADCRUMB_PARENT },
    title: 'ShelfSync | Danger Zone'
  },
  {
    path: 'customize',
    loadComponent: () => import('./customize/customize.component').then(m => m.CustomizeComponent),
    canActivate: [approvedGuard, adminGuard],
    data: { breadcrumb: 'Customize' },
    title: 'ShelfSync | Customize'
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
