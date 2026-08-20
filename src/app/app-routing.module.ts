import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LandingComponent } from './landing/landing.component';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { HomeComponent } from './home/home.component';
import { InventoryComponent } from './inventory/inventory.component';
import { AccountComponent } from './account/account.component';
import { TasksComponent } from './tasks/tasks.component';
import { ManageComponent } from './manage/manage.component';
import { ManageInventoryComponent } from './manage/inventory/manage-inventory.component';
import { ManageTasksComponent } from './manage/tasks/manage-tasks.component';
import { ManageTeamComponent } from './manage/team/manage-team.component';
import { ManageActivityComponent } from './manage/activity/manage-activity.component';
import { ManageDangerZoneComponent } from './manage/danger-zone/manage-danger-zone.component';
import { CustomizeComponent } from './customize/customize.component';
import { PendingApprovalComponent } from './pending-approval/pending-approval.component';
import { NotFoundComponent } from './not-found/not-found.component';
import { authGuard } from './core/guards/auth.guard';
import { approvedGuard } from './core/guards/approved.guard';
import { manageGuard } from './core/guards/manage.guard';
import { adminGuard } from './core/guards/admin.guard';

// Every route gets an explicit `title` — Angular's default TitleStrategy
// only ever writes document.title when the *active* route defines one and
// silently leaves the previous title in place otherwise, so leaving any
// route without one risks it inheriting whatever the last-visited route set
// (see LandingComponent, the first route to actually set a title).
const routes: Routes = [
  {
    path: '',
    component: LandingComponent,
    title: 'ShelfSync | Inventory management, simplified'
  },
  {
    path: 'login',
    component: LoginComponent,
    title: 'ShelfSync | Log in'
  },
  {
    path: 'register',
    component: RegisterComponent,
    title: 'ShelfSync | Sign up'
  },
  {
    path: 'home',
    component: HomeComponent,
    canActivate: [approvedGuard],
    title: 'ShelfSync | Home'
  },
  {
    path: 'pending-approval',
    component: PendingApprovalComponent,
    // Plain authGuard, not approvedGuard — that would just bounce this
    // route back to itself. This is the one place a signed-in-but-not-yet-
    // approved (or denied) session is actually allowed to land.
    canActivate: [authGuard],
    title: 'ShelfSync | Pending approval'
  },
  {
    path: 'inventory',
    component: InventoryComponent,
    canActivate: [approvedGuard],
    data: { breadcrumb: 'Inventory' },
    title: 'ShelfSync | Inventory'
  },
  {
    path: 'account',
    component: AccountComponent,
    canActivate: [approvedGuard],
    data: { breadcrumb: 'Account' },
    title: 'ShelfSync | Account'
  },
  {
    path: 'tasks',
    component: TasksComponent,
    canActivate: [approvedGuard],
    data: { breadcrumb: 'Tasks' },
    title: 'ShelfSync | Tasks'
  },
  {
    path: 'manage',
    component: ManageComponent,
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Manage' },
    title: 'ShelfSync | Manage'
  },
  {
    path: 'manage/inventory',
    component: ManageInventoryComponent,
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Manage Inventory' },
    title: 'ShelfSync | Manage Inventory'
  },
  {
    path: 'manage/tasks',
    component: ManageTasksComponent,
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Manage Tasks' },
    title: 'ShelfSync | Manage Tasks'
  },
  {
    path: 'manage/team',
    component: ManageTeamComponent,
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Manage Team' },
    title: 'ShelfSync | Manage Team'
  },
  {
    path: 'manage/activity',
    component: ManageActivityComponent,
    canActivate: [approvedGuard, manageGuard],
    data: { breadcrumb: 'Activity Log' },
    title: 'ShelfSync | Activity Log'
  },
  {
    path: 'manage/danger-zone',
    component: ManageDangerZoneComponent,
    canActivate: [approvedGuard, adminGuard],
    data: { breadcrumb: 'Danger Zone' },
    title: 'ShelfSync | Danger Zone'
  },
  {
    path: 'customize',
    component: CustomizeComponent,
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
    component: NotFoundComponent,
    title: 'ShelfSync | Page not found'
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
