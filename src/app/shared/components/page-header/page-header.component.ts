import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** A compact page-level header — icon chip + title (+ optional subtitle) —
 *  giving every Manage sub-page the same "this page announces itself"
 *  identity Home's nav cards and the Manage hub's own cards already have,
 *  without the weight of a full pinned-dark hero band (that treatment is
 *  reserved for Home's own entry-point hero — see HomeComponent's own
 *  `.home-hero`). Replaces each page's own bare `<h2>` (± a `.page-subtitle`
 *  paragraph, ± a `.page-header-row` flex wrapper for an action button) —
 *  those were duplicated near-verbatim across seven-plus component
 *  stylesheets before this existed.
 *
 *  Two content-projection slots cover the two shapes that existed before
 *  this: `[headerTitleExtra]` renders inline right after the title text
 *  (e.g. Orders' own help tooltip, previously inline inside its `<h2>`),
 *  and the default slot renders trailing action content (e.g. Suppliers'/
 *  Orders' "Add"/"Place order" buttons, previously a flex sibling in
 *  `.page-header-row`). Both are optional — a page with neither still
 *  renders correctly, the actions column just has nothing in it. */
@Component({
  selector: 'app-page-header',
  imports: [MatIconModule],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
})
export class PageHeaderComponent {
  @Input({ required: true }) icon!: string;
  @Input({ required: true }) title!: string;
  @Input() subtitle?: string;
  /** 'danger' swaps the icon chip for the same flat red treatment
   *  ManageComponent's own Danger Zone card uses (see that component's own
   *  `.manage-card-icon-danger` comment) rather than the shared gradient —
   *  this page is a deliberate outlier meant to read as riskier than every
   *  other page, not another destination in the same set. */
  @Input() variant: 'default' | 'danger' = 'default';
}
