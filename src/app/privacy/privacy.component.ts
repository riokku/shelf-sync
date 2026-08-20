import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ThemeModeService } from '../core/theme-mode.service';

/** Reachable without a session (see app-routing.module.ts) and excluded
 *  from the normal header/footer chrome (see app.component.ts's
 *  showChrome() allowlist) — a signed-out visitor following this link from
 *  the landing/register pages shouldn't land on a header full of nav links
 *  that just bounce them via guards. Provides its own minimal top bar
 *  instead; see shared/styles/_legal-page.scss. */
@Component({
  selector: 'app-privacy',
  imports: [MatIconModule, RouterLink],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.scss'
})
export class PrivacyComponent {
  protected themeMode = inject(ThemeModeService);
}
