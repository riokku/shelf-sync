import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
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
import { ManageDangerZoneComponent } from './manage/danger-zone/manage-danger-zone.component';
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
    path: 'home',
    component: HomeComponent,
    canActivate: [authGuard]
  },
  {
    path: 'inventory',
    component: InventoryComponent,
    canActivate: [authGuard],
    data: { breadcrumb: 'Inventory' }
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
    path: 'manage/inventory',
    component: ManageInventoryComponent,
    canActivate: [authGuard, manageGuard],
    data: { breadcrumb: 'Manage Inventory' }
  },
  {
    path: 'manage/tasks',
    component: ManageTasksComponent,
    canActivate: [authGuard, manageGuard],
    data: { breadcrumb: 'Manage Tasks' }
  },
  {
    path: 'manage/team',
    component: ManageTeamComponent,
    canActivate: [authGuard, manageGuard],
    data: { breadcrumb: 'Manage Team' }
  },
  {
    path: 'manage/danger-zone',
    component: ManageDangerZoneComponent,
    canActivate: [authGuard, adminGuard],
    data: { breadcrumb: 'Danger Zone' }
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
