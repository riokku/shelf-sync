import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

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
}
