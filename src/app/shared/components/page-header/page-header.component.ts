import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** A compact page-level header — icon chip + title (+ optional subtitle) —
 *  giving every Manage sub-page the same "this page announces itself"
 *  identity Home's nav cards and the Manage hub's own cards already have,
 *  without the weight of a full pinned-dark hero band (that treatment is
 *  reserved for the app's own top-level destinations — see
 *  shared/styles/_page-hero.scss, used by Home/Inventory/Tasks/the Manage
 *  hub). Replaces each page's own bare `<h2>` (± a `.page-subtitle`
 *  paragraph, ± a `.page-header-row` flex wrapper for an action button) —
 *  those were duplicated near-verbatim across seven-plus component
 *  stylesheets before this existed.
 *
 *  Three content-projection slots cover the shapes that existed before this
 *  (plus one added since): `[headerTitleExtra]` renders inline right after
 *  the title text (e.g. Orders' own help tooltip, previously inline inside
 *  its `<h2>`), `[headerMeta]` renders a block below the title/subtitle,
 *  still within the text column (e.g. ModalTableComponent's own asset-id
 *  row — GUID plus its copy/lock buttons — sitting right under an item's
 *  name), and the default slot renders trailing action content (e.g.
 *  Suppliers'/Orders' "Add"/"Place order" buttons, previously a flex
 *  sibling in `.page-header-row`). All three are optional — a page using
 *  none of them still renders correctly, each slot's column/row just has
 *  nothing in it. */
@Component({
  selector: 'app-page-header',
  imports: [MatIconModule],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
})
export class PageHeaderComponent {
  /** Optional — every existing page-level usage still passes one (a fixed
   *  icon glyph is what "this page announces itself" means for those), but
   *  ModalTableComponent's own item-detail usage renders no icon chip at
   *  all, just the title/meta/actions columns. The chip itself (see the
   *  template) only renders when this or logoUrl is set. */
  @Input() icon?: string;
  /** Optional too, for the same reason as icon above — ModalTableComponent's
   *  own item-detail usage is the one real caller that can skip it (see its
   *  showTitle input's own doc comment for when/why). The `<h2>` itself only
   *  renders when this is set. */
  @Input() title?: string;
  @Input() subtitle?: string;
  /** When set, renders in place of the generic Material `icon` above — for
   *  a page whose own identity is a specific org's uploaded logo
   *  (StudioOrgDetailComponent) rather than a fixed icon glyph every visit
   *  shows the same way. Swaps the chip's own gradient background for a
   *  plain neutral one too (see this component's own .scss) — the
   *  primary/tertiary-container gradient is tuned for a white/light icon
   *  glyph on top (see HomeComponent's own doc comment on why), not an
   *  arbitrary logo image whose own colors need to render legibly instead. */
  @Input() logoUrl?: string;
  /** 'danger' swaps the icon chip for the same flat red treatment
   *  ManageComponent's own Danger Zone card uses (see that component's own
   *  `.manage-card-icon-danger` comment) rather than the shared gradient —
   *  this page is a deliberate outlier meant to read as riskier than every
   *  other page, not another destination in the same set. */
  @Input() variant: 'default' | 'danger' = 'default';
  /** Ties this page into one of the Manage hub's own four card groupings
   *  (Inventory, Team & tasks, Insights, Admin — see ManageComponent's own
   *  `.manage-section`s) so that identity carries across the threshold
   *  instead of disappearing the instant you click into the page: a faint
   *  full-bleed gradient wash behind the header (the same two-tone
   *  container-token combo that section's own hub cards cycle through,
   *  heavily diluted) plus, when `icon` is also set, an oversized watermark
   *  of that same glyph bleeding off the header's edge and a thin
   *  primary->tertiary gradient rule under the title. Unset (the default)
   *  renders exactly the plain, flat header this component always has —
   *  every dialog-content usage (ModalTableComponent, TaskDetailModalComponent)
   *  deliberately leaves this unset, since a colored wash/watermark suits a
   *  full page, not a dialog. Danger Zone also leaves it unset even though
   *  it's an Admin-section page — it keeps its own distinct flat-red
   *  `variant="danger"` treatment instead, deliberately not folded into the
   *  shared Admin wash (see that variant's own doc comment).
   *
   *  'studio' is the same idea one level up — Studio's own hub has no
   *  Manage-style sub-sections to tie into (its four cards are a flat set,
   *  each with its own single-tone icon rather than the hub's own two-tone
   *  per-section gradient), so every flat `studio/*` sub-page (Feedback,
   *  Error Log, Organizations, Users) shares this one wash instead of a
   *  section-specific one. `StudioOrgDetailComponent`/`StudioUserDetailComponent`
   *  deliberately leave it unset even though they're real pages, not
   *  dialogs — same reasoning ModalTableComponent/TaskDetailModalComponent
   *  get above: an entity-detail view drilled into from one of these list
   *  pages, not another top-level destination in its own right. */
  @Input() zone?: 'inventory' | 'team' | 'insights' | 'admin' | 'studio';
  /** 'start' (the default) top-aligns the trailing action column with the
   *  title — right for a short single-line title next to one or two
   *  buttons, and what every current usage renders with (including
   *  ModalTableComponent's own item-detail header — its actions sit inline
   *  with the item name, same as TaskDetailModalComponent's own task-title
   *  row, rather than centered against the taller GUID/status-pill block
   *  below it). 'center' instead centers the action column against the
   *  *whole* text column's height, title/subtitle/headerMeta combined — kept
   *  as an option for a future header whose own text column is tall enough
   *  that top-aligning its actions would read as misaligned, not currently
   *  used by any caller. */
  @Input() alignActions: 'start' | 'center' = 'start';
  /** 'h2' (the default) is right for every dialog-content usage
   *  (ModalTableComponent, TaskDetailModalComponent) — a dialog's title
   *  isn't the document's own top-level heading. Every real *routed* page
   *  using this component (every manage/* and studio/* sub-page) should
   *  pass 'h1' instead, since for that page this title *is* the page's own
   *  top-level heading — before this input existed, no page anywhere in the
   *  authenticated app had an `<h1>` at all.
   *
   *  The title element itself stays a real `<h2>` regardless — see the
   *  template's own comment for why duplicating it into a real `<h1>`/`<h2>`
   *  pair breaks `[headerTitleExtra]` projection. 'h1' instead overrides the
   *  *accessible* heading level via `role="heading"`/`aria-level`, the
   *  standard technique for exposing a different heading level than an
   *  element's own tag. */
  @Input() headingLevel: 'h1' | 'h2' = 'h2';
}
