import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';

/** Wildcard (`**`) route target — see app-routing.module.ts. Reachable by a
 *  signed-out visitor as easily as a signed-in one (a mistyped URL doesn't
 *  care about auth state), so this deliberately doesn't assume a session:
 *  no data loaded, just a static "Go home" link, which authGuard/
 *  approvedGuard will correctly bounce to /login (with a returnUrl) for
 *  anyone not actually signed in. */
@Component({
  selector: 'app-not-found',
  imports: [MatButtonModule, MatIconModule, RouterLink, BreadcrumbsComponent],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
})
export class NotFoundComponent {}
