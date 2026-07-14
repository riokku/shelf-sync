import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { AccountComponent } from './account/account.component';
import { TasksComponent } from './tasks/tasks.component';
import { ManageComponent } from './manage/manage.component';
import { CustomizeComponent } from './customize/customize.component';
import { authGuard } from './core/guards/auth.guard';
import { manageGuard } from './core/guards/manage.guard';
import { adminGuard } from './core/guards/admin.guard';

const routes: Routes = [
  {
    path: '',
    component: LoginComponent
  },
  {
    path: 'register',
    component: RegisterComponent
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    data: { breadcrumb: 'Dashboard' }
  },
  {
    path: 'account',
    component: AccountComponent,
    canActivate: [authGuard],
    data: { breadcrumb: 'Account' }
  },
  {
    path: 'tasks',
    component: TasksComponent,
    canActivate: [authGuard],
    data: { breadcrumb: 'Tasks' }
  },
  {
    path: 'manage',
    component: ManageComponent,
    canActivate: [authGuard, manageGuard],
    data: { breadcrumb: 'Manage' }
  },
  {
    path: 'customize',
    component: CustomizeComponent,
    canActivate: [authGuard, adminGuard],
    data: { breadcrumb: 'Customize' }
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
