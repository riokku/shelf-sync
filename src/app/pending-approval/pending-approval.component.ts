import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';

@Component({
  selector: 'app-pending-approval',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, BreadcrumbsComponent],
  templateUrl: './pending-approval.component.html',
  styleUrl: './pending-approval.component.scss',
})
export class PendingApprovalComponent implements OnInit {
  private authService = inject(AuthService);
  private supabase = inject(SupabaseService).client;
  private router = inject(Router);

  isLoading = true;
  /** null covers both "not fetched yet" (while isLoading) and "no profile
   *  found at all" (denied/removed) — the template tells those apart via
   *  isLoading. */
  organizationName: string | null = null;

  async ngOnInit() {
    const profile = await this.authService.getProfile();

    if (profile?.membership_status === 'approved') {
      // Stale bookmark/back-button case — nothing pending to show.
      this.router.navigate(['/home']);
      return;
    }

    if (profile) {
      const { data } = await this.supabase
        .from('organizations')
        .select('name')
        .eq('id', profile.organization_id)
        .maybeSingle();
      this.organizationName = data?.name ?? null;
    }

    this.isLoading = false;
  }

  /** Matches HeaderComponent's own logout() exactly (same destination) —
   *  duplicated rather than shared since it's two lines and pulling in a
   *  shared service for just this would be more indirection than it's
   *  worth. */
  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/']);
  }
}
