import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { SiteSettingsService } from '../core/site-settings.service';

@Component({
    selector: 'app-header',
    imports: [MatButtonModule, MatIconModule, RouterModule],
    templateUrl: './header.component.html',
    styleUrl: './header.component.scss'
})
export class HeaderComponent {
  protected authService = inject(AuthService);
  protected siteSettings = inject(SiteSettingsService);
  private router = inject(Router);

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/']);
  }
}
