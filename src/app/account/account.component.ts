import { Component, OnInit, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService, Profile } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { ThemeModeService } from '../core/theme-mode.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';

@Component({
  selector: 'app-account',
  imports: [
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    BreadcrumbsComponent,
  ],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
})
export class AccountComponent implements OnInit {
  private authService = inject(AuthService);
  private supabase = inject(SupabaseService).client;
  protected themeMode = inject(ThemeModeService);

  profile: Profile | null = null;
  organizationName: string | null = null;
  isLoading = true;

  async ngOnInit() {
    this.profile = await this.authService.getProfile();

    if (this.profile) {
      const { data } = await this.supabase
        .from('organizations')
        .select('name')
        .eq('id', this.profile.organization_id)
        .single();
      this.organizationName = data?.name ?? null;
    }

    this.isLoading = false;
  }
}
