import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/** An optional extra link between Home and the current page — e.g. every
 *  page under Manage sets this to link back to the Manage hub, rendering
 *  Home / Manage / {page}. Set per-route via the `breadcrumbParent` route
 *  `data` property (see app-routing.module.ts's MANAGE_BREADCRUMB_PARENT). */
export interface BreadcrumbParent {
  label: string;
  link: string;
  /** Only needed when `link` points back at the *same* route this
   *  component is already on (e.g. TasksComponent's own tasksBreadcrumbParent,
   *  `/tasks` while already on `/tasks`) — Angular reuses the existing
   *  component instance for a same-route navigation and doesn't re-run
   *  ngOnInit, so nothing re-reads the URL to notice `?task=` is now gone;
   *  the page would otherwise keep showing whatever detail view was open
   *  even though the URL itself updated correctly. Called alongside the
   *  routerLink's own navigation (not instead of it) so the caller can
   *  reset that state directly rather than relying on the URL change
   *  alone. Unnecessary (and unset) for a parent linking to a genuinely
   *  different route — a route change destroys this component outright,
   *  which already resets everything on its own. */
  onClick?: () => void;
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

  /** An extra segment between parent and the trailing label — for a detail
   *  view nested two levels deep under a page that already uses
   *  parentOverride above (today, only TasksComponent's own related-item
   *  view: Home / Tasks / {task title} / {item name}, the "task title"
   *  piece is this). Deliberately not a second BreadcrumbParent (i.e. not a
   *  routerLink) — unlike parent, which always links to a real, separate
   *  page/route, "this task" has no route of its own to link back to; it's
   *  just a different view of the same page swapped back in. Clicking it
   *  instead fires secondaryLabelClick below, which the host page wires up
   *  to whatever actually reverses that swap (e.g.
   *  TaskDetailModalComponent.closeRelatedItem(), the same call its own
   *  page-level Back button already makes) — same reasoning
   *  labelOverride's own click-to-navigate is skipped for the trailing
   *  label too, since that one's already on screen. */
  @Input() secondaryLabel?: string | null;

  /** Fires when secondaryLabel is clicked — see its own doc comment. No-op
   *  if the host page doesn't bind it (a plain unhandled EventEmitter.emit()
   *  is always safe), though every real usage should. */
  @Output() secondaryLabelClick = new EventEmitter<void>();

  /** Every rendered crumb segment goes through this — a long task/item name
   *  next to two other segments plus the Home link risks wrapping onto a
   *  second line or overflowing a narrow toolbar, and a breadcrumb reads
   *  fine abbreviated (unlike a page's own heading, which shows the full
   *  name elsewhere already). [title] on each segment (see the template)
   *  surfaces the untruncated text on hover for whichever ones a click
   *  wouldn't have already made obvious. */
  protected truncate(text: string): string {
    const maxLength = 24;
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  }
}
