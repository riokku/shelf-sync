import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { AccountComponent } from './account/account.component';
import { TasksComponent } from './tasks/tasks.component';
import { ManageComponent } from './manage/manage.component';
import { authGuard } from './core/guards/auth.guard';
import { manageGuard } from './core/guards/manage.guard';

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
    canActivate: [authGuard]
  },
  {
    path: 'account',
    component: AccountComponent,
    canActivate: [authGuard]
  },
  {
    path: 'tasks',
    component: TasksComponent,
    canActivate: [authGuard]
  },
  {
    path: 'manage',
    component: ManageComponent,
    canActivate: [authGuard, manageGuard]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
