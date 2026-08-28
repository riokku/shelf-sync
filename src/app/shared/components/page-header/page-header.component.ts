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
  /** Optional too, for the same reason as icon above — ModalTableComponent
   *  skips both when its caller already shows the item's name elsewhere
   *  (InventoryComponent's own page heading — see its showTitle input's own
   *  doc comment), so there's no second, redundant heading right above the
   *  GUID/status pills. The `<h2>` itself only renders when this is set. */
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
  /** 'start' (the default, every existing page-level usage) top-aligns the
   *  trailing action column with the title — right for a short single-line
   *  title next to one or two buttons. 'center' instead centers it against
   *  the *whole* text column's height, title/subtitle/headerMeta combined —
   *  ModalTableComponent's own usage wants this, since its own actions
   *  group would otherwise sit pinned to the top of the row while the
   *  title+GUID+status-pill block below it takes up real height of its
   *  own, reading as misaligned rather than as one cohesive header row. */
  @Input() alignActions: 'start' | 'center' = 'start';
}
