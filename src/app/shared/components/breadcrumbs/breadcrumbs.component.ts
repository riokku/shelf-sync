import { Component, Input, inject } from '@angular/core';
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

  /** Overrides the trailing "current page" label for an entity-detail page
   *  whose real label (e.g. an org's name) isn't known from static route
   *  config the way every other page's title is — it only resolves once
   *  that page's own async load finishes. Falls back to the static
   *  `breadcrumb` route data below whenever unset or still empty (e.g.
   *  while the entity is still loading), so a page like
   *  StudioOrgDetailComponent that binds `[labelOverride]="organization?.name"`
   *  reads correctly at every stage: the route's own placeholder label
   *  before load, then the real name once it resolves. */
  @Input() labelOverride?: string;

  private readonly routeLabel: string = this.route.snapshot.data['breadcrumb'] ?? '';

  get label(): string {
    return this.labelOverride || this.routeLabel;
  }

  parent: BreadcrumbParent | null = this.route.snapshot.data['breadcrumbParent'] ?? null;
}
