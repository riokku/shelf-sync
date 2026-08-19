import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/** An optional extra link between Home and the current page — e.g. every
 *  page under Manage sets this to link back to the Manage hub, rendering
 *  Home / Manage / {page}. Set per-route via the `breadcrumbParent` route
 *  `data` property (see app-routing.module.ts's MANAGE_BREADCRUMB_PARENT). */
export interface BreadcrumbParent {
  label: string;
  link: string;
}

@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink, MatIconModule],
  templateUrl: './breadcrumbs.component.html',
  styleUrl: './breadcrumbs.component.scss',
})
export class BreadcrumbsComponent {
  private route = inject(ActivatedRoute);

  /** Set per-route via the `breadcrumb` route `data` property (see
   *  app-routing.module.ts), so this label updates automatically as the
   *  user navigates between top-level pages. */
  label: string = this.route.snapshot.data['breadcrumb'] ?? '';

  parent: BreadcrumbParent | null = this.route.snapshot.data['breadcrumbParent'] ?? null;
}
