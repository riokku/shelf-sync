import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ThemeModeService } from '../core/theme-mode.service';

/** Reachable without a session (see app-routing.module.ts) and excluded
 *  from the normal header/footer chrome (see app.component.ts's
 *  showChrome() allowlist) — same reasoning as PrivacyComponent, which
 *  this mirrors. */
@Component({
  selector: 'app-terms',
  imports: [MatIconModule, RouterLink],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.scss'
})
export class TermsComponent {
  protected themeMode = inject(ThemeModeService);
}
