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

  /** Same idea as labelOverride above, but for the parent segment — a page
   *  that's both a top-level destination in its own right (its route's own
   *  static breadcrumb label, read below, already renders a plain "Home /
   *  X" on its own) and an entity-detail view layered on top of that same
   *  route rather than a separate one (e.g. InventoryComponent swapping its
   *  own item detail in over the browsing UI, no route change involved) sets
   *  this once a specific entity is showing, so the trailing label
   *  (labelOverride, e.g. the item's name) reads as a child of the page's
   *  own normal label instead of replacing it outright the way
   *  labelOverride alone would on a genuinely separate detail route (e.g.
   *  StudioOrgDetailComponent, which has no need for this — its own parent
   *  is fixed, set once via the static route data below). Pass `null`
   *  explicitly (not just leave unset) once nothing is selected, to fall
   *  back to the route's own default. */
  @Input() parentOverride?: BreadcrumbParent | null;

  private readonly routeParent: BreadcrumbParent | null = this.route.snapshot.data['breadcrumbParent'] ?? null;

  get parent(): BreadcrumbParent | null {
    return this.parentOverride ?? this.routeParent;
  }
}
