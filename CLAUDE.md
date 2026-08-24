# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShelfSync (npm package name `inventory-app`) is an early-stage Angular inventory management app.
Auth is wired end-to-end against a hosted Supabase project: `LoginComponent` calls real
`signInWithPassword`, `RegisterComponent` calls real `signUp`, the `inventory` route is protected
by an `authGuard`, and the header has a working logout button. The Inventory page, Manage's Inventory
page, and Manage's Tasks page all query real Supabase tables (`inventory_items`, `tasks`,
`profiles`) — there is no hardcoded/local inventory or task data left in the app. `InventoryComponent`
and `ManageInventoryComponent` both convert `inventory_items` rows into the client-side `InventoryItem`
shape via the shared `toInventoryItem()` mapper in `shared/utils/inventory-item.mapper.ts`
(paired with `resolveProfileName()` in `shared/utils/profile-label.ts` for `checked_out_to`
labels). Item photos live in the `inventory_item_images` table (up to 10 per item, enforced both
client-side and by a DB trigger) plus the public `inventory-images` Storage bucket; the shared
`loadInventoryImagesByItemId()` helper in `shared/utils/inventory-item-images.ts` batch-loads and
resolves them to public URLs, and `toInventoryItem()` falls back to the legacy single `image`
text column only for older rows that predate the gallery table. Structured activity history now
lives in `inventory_item_activity` (`item_id`, `user_id`, `message`, `created_at`), loaded via
`loadInventoryActivityByItemId()` in `shared/utils/inventory-item-activity.ts` — the original
`inventory_items.activity_log` free-text column predates this and is unused. Any authenticated
user (not just admin/manager) can edit an inventory item's fields directly from `ModalTableComponent`
(the item detail popup opened from both the Inventory page and Manage's inventory list) via an
Edit/Save/Cancel flow; saving writes the changes to `inventory_items` and logs a diffed,
human-readable summary ("Updated Quantity remaining (80 → 25), ...") to `inventory_item_activity`.
The two callers refresh differently once the popup closes, because of what they hand it as
`data`: `InventoryComponent.showDetails()` passes the exact `InventoryItem` instance still sitting
in its own list (filtering/sorting/paging that list never clones its elements), so every
`ModalTableComponent` write path already mutates that shared object in place — no refetch needed
at all, the list is already current. `ManageInventoryComponent.openInventoryDetail()` instead
builds `ModalTableComponent` a fresh, disconnected `InventoryItem` via `toInventoryItem()` (its own
list holds raw DB rows, not `InventoryItem`s), so closing there re-fetches just that one row (plus
its images/activity) and patches it into `allInventoryItems`/the image/activity maps —
`refreshInventoryItem()` — rather than reloading the whole inventory list on every close the way
both used to. `ManageInventoryComponent.viewMode` is `'create' | 'retirements'` — it previously also
had a third `'all'` tab browsing every inventory item as a row list (mirroring Manage Tasks' own
"All tasks" tab), removed as low-value once the Inventory page itself already covers browsing/
filtering/searching every item, card or table view, with far more depth (this tab was a plain,
unfiltered-beyond-status-toggle name/category/quantity/price row list). `allInventoryItems` itself
is unaffected — still the full org inventory list, still loaded on `ngOnInit()`, since
`pendingRetirementItems`/`pendingRetirementCount` (the "Requests" tab), `refreshInventoryItem()`,
and the create form's barcode-scan duplicate check all still need every item, not just the ones
with a pending retirement request.
Editing also covers photos (add/remove against `inventory_item_images`, same 10-photo cap as
creation) via shared helpers in `shared/utils/inventory-item-images.ts`, and checkout state
(`is_checked_out`/`checked_out_to`, editable via a "Checked out to" selector in the same
Edit/Save/Cancel flow) — both are part of the same widened, any-authenticated-user UPDATE access as
every other field. `status`/`retirement_*`/`retired_*` are the exception: excluded from that column
grant and writable only through the retirement RPCs (see the Supabase Schema section below), so
editing never lets someone bypass the approval workflow.

An item's remaining stock can also be broken into individually-editable containers/boxes (e.g.
100 units in 5 boxes of 20) rather than tracked only as the single `quantity_remaining` aggregate —
`inventory_item_containers` (`item_id`, `quantity`, `location`), a child table in the same shape as
`inventory_item_images` (no `organization_id` of its own; org isolation comes from `item_id`
pointing at an already org-scoped `inventory_items` row), loaded via
`loadInventoryItemContainers()` in `shared/utils/inventory-item-containers.ts`. `ModalTableComponent`
shows them in a "Container breakdown" section (below Quantity information, in both view and edit
mode) — each box auto-numbered "Box N" by its position in the list (no stored position column;
display order is just `created_at asc`) plus an optional location — a dropdown drawing from the
same admin-curated `inventory_field_options` physical-location list the item's own Physical
location field uses (`InventoryFieldOptionsService`), not free text, so a box's location stays
consistent with the rest of the org's location vocabulary. Editing is full
add/remove/edit, same Edit/Save/Cancel flow and any-authenticated-user access as every other field;
an emptied (0-quantity) box stays listed rather than disappearing. Once an item has at least one
container, `quantity_remaining`/`quantity_total` stop being freely editable and are instead always
derived (`quantity_remaining` = sum of container quantities, `quantity_total` = that sum +
`quantity_allocated`) — items with zero containers keep the old flat, freely-editable behavior
unchanged. Reducing stock by directly editing Quantity remaining (or a container's own quantity)
this way never captures *why* — for that, `ModalTableComponent`'s "Discard" button
(`DiscardModalComponent`) covers both tracking modes with one mandatory-reason flow: a flat item
decrements `quantity_remaining`/`quantity_total` directly, a container-tracked item instead prompts
which box to pull from and decrements (then re-derives from) that container, same formula as a normal
container edit — either way logging a reason-carrying line ("Discarded 3 units from Box 1. Reason:
Water damage"). This reinstates (in a unified shape) an original `DiscardInventoryModalComponent`
that only ever worked the flat-item way and was removed once container editing shipped as the
(reason-less) way to reduce a container item's stock — leaving flat items with no reason-capturing
path at all, the gap this closes. Same any-authenticated-user reach as every other edit on this item
(not admin/manager-only) — discarding is just a reason-carrying variant of a quantity edit anyone can
already make directly, not a stricter action — gated only the same way the Edit button itself is
(`!is_locked || canManage()`) plus nothing left to reduce (`status = 'active'` and
`quantity_remaining > 0`, mirroring `canRequestRetirement`'s own gate). `ManageInventoryComponent`'s create-item
form offers the same choice up front, via a `trackingMode` ("Single quantity" / "By container/box")
`mat-button-toggle-group` above the Quantity total field — picking container mode hides Quantity
total (it becomes the sum of whatever containers are added, same derivation) and shows the same
box-list editor (add/remove, quantity + optional location) `ModalTableComponent` uses; on submit the
containers are inserted right after the new `inventory_items` row, in the same best-effort-after-
the-main-insert style image upload already used there. Choosing container mode with zero containers
added is blocked client-side (picking that mode implies at least one box) rather than silently
falling back to a zero-quantity item.

Admins and managers get a `manage/activity` route (`ManageActivityComponent`) — a single
cross-entity feed of everything that changed in the org: inventory item create/edit/retirement,
task create/status-change (including completion)/transfer, and member join/approval/removal. It
reads from `activity_log`, a new org-scoped table separate from the per-item
`inventory_item_activity` above — client-side actions log to it via `logActivity()` in
`shared/utils/activity-log.ts` (mirroring `logInventoryItemActivity()`'s shape), while anything
that already goes through a SECURITY DEFINER RPC (retirement, task transfers, `update_task_status`,
`handle_new_user`, `admin_approve_member`) logs server-side inside that same function instead, so
the event and the change it describes commit atomically. The page defaults to today and steps
one day at a time via `loadActivityLog()`'s `{ from, to }` range rather than infinite scroll.

Admins get a `manage/settings` route (guarded by a dedicated `adminGuard`, stricter than the
admin-or-manager `manageGuard` most of `manage`'s other sub-pages use, same stricter pairing
Billing/Danger Zone already have) for site-wide branding: a color theme picker and a logo upload,
both backed by the `site_settings` singleton table. Because Angular Material's `mat.theme()` is a
compile-time SCSS mixin, runtime theme switching works by precompiling a handful of named palettes
as `[data-theme='x']` blocks in `styles.scss` and toggling that attribute on `<html>` — see
`THEME_PRESETS` in `shared/models/theme-preset.ts` for the option list and `core/site-settings.service.ts`
for the load/preview/persist logic. `AppComponent` loads settings once on startup (readable by
`anon` too, so branding applies pre-login) and `HeaderComponent` swaps in the custom logo when set,
falling back to the default SS mark. `HeaderComponent` also shows the signed-in user's organization
name next to that logo (a vertical divider between them, not just a gap, so it reads as "this logo
belongs to this org" rather than two unrelated pieces of text) — `AuthService.organizationName`, a
new signal loaded alongside `profile` inside `loadProfile()` (same lifecycle: populated once the
profile's own `organization_id` is known, cleared together on sign-out) rather than each page
querying `organizations` for itself the way `AccountComponent`/`ManageTeamComponent`'s invite-link
section/etc. already independently do — this is core identity info tied to the signed-in profile,
the same category `role`/`organizationId` on that same service already are, not a per-page concern.
Right below the org name, `HeaderComponent` also shows how many approved org members are currently
online, next to the same small pulsing dot `ManageTeamComponent`'s own per-member indicator uses
(shared visual language, not a shared component/stylesheet — each defines its own `.online-dot`).
Unlike `lowStockCount`/`pendingManageCount` (this component's other two small counts, refreshed only
on auth changes and navigation), `onlineTeamCount` is *also* polled on a plain 30s `setInterval` —
who's online changes with the mere passage of time, not just user actions, the same reasoning
`ManageTeamComponent`'s own presence poll already has.
The same `settings` route's Data tab holds three sections,
each its own full-width card stacked top to bottom rather than side-by-side columns (an earlier
two-column layout made whichever card held two sections force the page to the height of its
*tallest* column, wasting the other column's width without actually shortening the page — full
width instead lets every section's checkbox groups spread across more columns, which is what
actually cuts down scrolling): "Filter data" (the field-options editors — approved category/
physical-location *values*) and "Inventory data" (which optional fields appear on the "Create item"
form) share one `.settings-card` (a divider between them, same pattern `.settings-section +
.settings-section` uses on the Style tab), then "Table presentation" (which optional columns
appear in the Inventory page's table view) gets its own. Both grouped-checkbox sections
("Inventory data"/"Table presentation") share `.table-column-groups`' CSS multi-column layout,
sized by `column-width` rather than a fixed column count so it adapts to whatever width is actually
available instead of a breakpoint tuned for the old narrower layout.

"Table presentation" lets an admin choose which columns appear in the Inventory page's table view.
Every practical `InventoryItem` field is selectable (Barcode, Description, Category, Physical
location, Digital location, Applicable year, Expiration date, Supplier name/lead time, Order link,
all five quantity fields, both price fields, Checked out to, and Stock status), grouped into
checkbox sections that mirror `InventoryItem`'s own constructor comment groupings (Item/Supplier/
Quantity/Price/Other information) — deliberately excluding `id`, `image(s)`, `activityLog`, the
`checkedOutTo*` internal keys, and the retirement audit trail (`retirementRequestedByLabel`/etc.,
already summarized by the Stock status pill). Name and the actions column are always shown
regardless. Selections are `site_settings.inventory_table_columns`, a plain text array with no
column-scoped grant needed (the existing admin-only, flat-row UPDATE policy already covers it) —
new orgs default to the original four (Category, Physical location, Quantity remaining, Stock
status) rather than every column at once. `shared/models/inventory-table-column.ts` defines the
grouped option list/labels and canonical display order, shared by `SettingsComponent` (grouped
checkboxes) and `InventoryComponent` (the `tableColumns` getter that filters that canonical order
down to whatever's enabled, so the table's column order stays stable regardless of the order
columns were toggled in; sorting reads whichever `InventoryItem` field matches the clicked column
key generically, rather than a per-column switch statement).

"Inventory data" is the same idea applied to item *creation* rather than the table view: which
optional fields `ManageInventoryComponent`'s "Create item" form shows, so an org only captures the
data it actually cares about. Name and the item's core quantity tracking (Quantity total / the
single-vs-container `trackingMode` toggle) are never optional — same "always shown" reasoning
Table presentation's Name/actions columns get — but everything else (Barcode, Description,
Category, both location fields, Applicable year, Expiration date, Photos, all three supplier
fields, Quantity per container, Low quantity threshold, both price fields) can be turned off, hiding
that field (and, for Supplier information, the whole section header if all three of its fields are
off) from the create form entirely. `shared/models/inventory-form-field.ts` defines the grouped
option list (same Item/Supplier/Quantity/Price/Other grouping style as the table-column model, plus
a "Photos" entry with no `InventoryItem` field of its own — it gates the image-upload section) and
`DEFAULT_INVENTORY_FORM_FIELDS`, which — unlike the table columns' intentionally-narrow default —
is *every* field, matching `site_settings.inventory_form_fields`'s own DB default, so this is
non-breaking: an org that never visits this new section keeps seeing the exact same create form the
app always had. `ManageInventoryComponent.fieldEnabled()` is what the create form's template
actually checks.

Password recovery (`/forgot-password`, `/reset-password`), Supabase-native client error logging
(`GlobalErrorHandler`), and requiring approved org membership before a task can be transferred or
assigned to someone (both `TaskDetailModalComponent` and task-creation) are all covered in detail
in the Supabase Schema section below, next to the migrations that back them.

`tasks.created_by` has been set on every task since creation (see `add_organization_deletion`'s FK
note above) but was never actually surfaced anywhere — every task list/detail view now shows who
created it (`createdByLabel()`, resolved from the same already-loaded org profiles list each of
these already had on hand for assignee/transfer labels): `TaskCardComponent`'s own `.task-row` grid
gets a 4th column for it (an optional `@Input()`, same pattern as its transfer labels, wired from
both `TasksComponent`'s "My Tasks" and `ManageTeamComponent`'s per-member task lists — a 4th column
pushed the row's real minimum width close enough to typical narrow-viewport widths to need the same
flex-wrap breakpoint fallback `ManageTasksComponent`'s row already had), `ManageTasksComponent`'s
"All tasks" table, and
`TaskDetailModalComponent`'s own `dl.task-meta` block.

`/privacy` and `/terms` (`PrivacyComponent`/`TermsComponent`) are static Privacy Policy/Terms of
Service pages — reachable without a session and excluded from the normal header/footer chrome (see
`AppComponent.showChrome()`'s allowlist), same as landing/login/register, since a signed-out
visitor following a link to either from the landing page or the register form shouldn't land on a
header full of nav links that just bounce them via guards. Both provide their own minimal top bar
(shared layout in `shared/styles/_legal-page.scss`) with a theme-aware logo (same
`assets/logo-light.svg`/`logo-dark.svg` swap `HeaderComponent` uses) rather than reusing
`BrandLogoComponent`, which hardcodes white/always-dark styling meant for login/register's video
backdrop and would be unreadable in light mode here. `FooterComponent` links to both, plus
`/pricing`, via its `showLegalLinks` input (default `true`) — but only on the pre-login pages that
embed it directly (landing, `/pricing` itself); `AppComponent`'s own `<app-footer>` (the one wrapping
every authenticated page) explicitly passes `[showLegalLinks]="false"`, since a signed-in user has no
reason to click through to marketing/legal pages from inside the app, and showing them there was just
noise. `.footer-content` switches from `justify-content: space-between` to `flex-end` when the links
are hidden, keeping the Studio Rio mark (and its credit text — see below) in its usual bottom-right
corner rather than stranded at the flex-start edge with nothing on the other side to push it there
anymore. `.footer-content` sits directly under `.footer-wrapper` with no Bootstrap grid wrapper
around it — same plain-flex-block treatment as `HeaderComponent`'s own `.header-wrapper` — rather
than the `.row`/`.col-12` pair this used to have, whose negative margin only partially canceled
`.footer-wrapper`'s own padding and left the column's own gutter padding stacked on top: an uneven
double-inset rather than the single, predictable one this padding alone now provides on its own,
edge-to-edge full width.
A "Created by / Studio Rio" two-line credit sits next to the mark itself, via
`.footer-brand` — the same logo-plus-text-with-a-vertical-divider pairing `HeaderComponent`'s own
`.brand` uses for the signed-in org's logo/name, mirrored (text leads, divider, then the logo,
rather than logo-then-divider-then-text) since this is credit *for* the mark beside it rather than
identity info the mark belongs to. Deliberately subtle (small, muted; both lines share one plain,
explicit light gray — `#c4c4c4`, not a Material system token or `color: inherit` — with only
size/weight, not color, differentiating "Studio Rio" as the more prominent line) — a footer credit,
not a nav element or status the way the header's own two-line block is. The explicit (rather than
themed) color choice matters here specifically because `FooterComponent` is also embedded on the
landing page's `.footer-on-dark` region, a permanently-dark background regardless of the site's
light/dark theme — a token like `--mat-sys-on-surface-variant`, or `color: inherit` from the
ambient (theme-following) text color, would resolve to a light-mode-appropriate color there and go
illegible, the same trap the mark's own `img` filter rule already has to work around (see its own
comment for the mirror-image case: forcing the logo to *stay* white there rather than inverting it,
since `[data-mode='light']` alone isn't a reliable signal for that region) — the divider alongside
the text still uses `currentColor` for this same reason.
The register form's submit button carries a "you agree to our
Terms/Privacy" notice linking the same routes regardless. The policy text itself is a starting draft
(attributed to Studio Rio, contact `chris@studiorioconsulting.com`) — **not reviewed by an
attorney**, and the Terms' governing-law section still has a literal `[Insert governing
state/country]` placeholder — have both reviewed before relying on them for real signups.

The landing page's own nav (`LandingComponent`, distinct from the app shell's `HeaderComponent` —
see `AppComponent.showChrome()`) is session-aware: a visitor with no session sees the normal
Pricing/Log in/Sign up links, but one who already has a session (landed on `/` directly, e.g. via
the brand link) sees just Dashboard (→ `/home`) and Logout instead — none of Pricing/Log in/Sign up
make sense once already signed in, and nothing previously redirected an already-authenticated
visitor away from this page. Scoped to the nav only, via `authService.isAuthenticated()`; the
hero/bottom CTAs further down the page still always point at `/register` regardless of session —
this page's job for a signed-in visitor is just getting them out to their dashboard, not becoming a
second one itself.

The landing page's `.features` section plays the same background video login/register use
(`assets/login-video.mp4`) behind a dark scrim, sandwiched between two gradient regions
(`.hero-backdrop` above, `.bottom-backdrop` below) that both share one "bridging" dark tone
(`color-mix(in srgb, var(--mat-sys-tertiary) 40%, #14141a)` — hero's gradient ends on it,
bottom's starts on it). The video itself starts at `opacity: 0` and only fades in once
`(canplay)` fires (`videoReady` signal, `LandingComponent`) — every major browser renders an
unloaded `<video>` with no `poster` as flat black regardless of any CSS `background-color` on it
or its parent, so without this, visitors briefly saw that flat black (a third, unrelated dark
tone) hard up against both gradients' tinted tone while the video loaded. `.features-backdrop`
(the video's parent) now carries that same bridging tone as its own `background-color`, so the
loading window shows a continuation of the surrounding gradients instead.

`/pricing` (`PricingComponent`) is a public three-tier pricing page (Free/Basic/Pro, Basic marked
"Most popular"), same unguarded/chrome-hidden/own-nav-and-footer treatment as landing — linked from
both the landing page's nav and `FooterComponent`. **No billing is wired up yet** — every tier's
call to action goes to the same real `/register` flow (a page footnote says so explicitly), since
signing up today gives full access regardless of which card was clicked; Stripe integration is
separate, later work. The three tiers' caps and feature splits are a first pass at what *should*
differentiate them once enforcement exists, chosen around what actually drives Supabase hosting
cost for this app: item photos are by far the biggest lever (both storage *and* the repeated
bandwidth/egress cost of browsing them, since Supabase bills egress separately from storage),
team size is a moderate, predictable lever (Auth bills by monthly active users), and inventory/task
row counts are minor unless an org reaches tens of thousands of items. Core inventory/task
functionality is deliberately available on every tier rather than paywalled — differentiation is
by *scale* (item/team/photo-storage caps) and *admin polish* (custom branding, data export, error
log access — all Pro-only), not gating the product's basic value proposition this early on. See
`PricingComponent`'s own doc comment for the full per-tier breakdown. The three tiers themselves
live in `shared/models/pricing-tier.ts` (`PRICING_TIERS`, each with a `limits` object —
`maxTeamMembers`/`maxInventoryItems`/`storageLimitMb`, `null` meaning unlimited) rather than being
inlined in `PricingComponent`, so the numbers a prospective customer sees on `/pricing` and the caps
`manage/billing` measures an existing org against can't drift apart.

`manage/billing` (`ManageBillingComponent`) is an admin-only (`adminGuard` — billing is financial
information, same audience as Danger Zone, not the broader admin-or-manager audience the rest of
Manage's sub-pages use) preview of what this page will show once Stripe billing exists. Every org is
hardcoded onto the Free tier (`pricingTierByKey('free')`) since there's no `subscriptions` table
yet; a banner at the top says the page isn't connected to real billing. Account creation date, team
member count, inventory item count, and photo storage usage are all real, queried numbers — storage
usage comes from `get_inventory_photo_storage_usage()`, an admin-only `SECURITY DEFINER` RPC that
sums `storage.objects` sizes for the org's inventory photos (joined via `inventory_item_images` ->
`inventory_items` for org scoping, not by parsing storage paths), since `storage.objects` (Supabase
Storage's own backing table) isn't exposed to PostgREST directly. Only the billing-cycle date is
still a plausible-looking placeholder, pending real Stripe billing.

The Inventory page has a card/table view toggle (`InventoryComponent.viewMode`, a
`mat-button-toggle-group` above the item list) — card view is the original gallery layout; table
view is a `mat-table`/`matSort` grid, sortable by clicking any column header (`sortedInventoryList`
sits between the existing `filteredInventoryList` and `pagedInventoryList` getters, so sorting
composes with the existing filter/search/paging pipeline rather than replacing any of it). Table
rows collapse card view's simultaneous badges (retired, checked-out, low/out-of-stock, pending
retirement can all show at once there) into a single higher-priority status pill per row
(`statusLabel()`/`statusSlug()`, also what "sort by status" sorts on) since a dense row has no room
for more than one. Which optional columns the table shows (Category, Physical location, Quantity
remaining, Stock status) is admin-configurable from `settings`'s Data tab, per the paragraph above.

Low/out-of-stock items were previously only a per-item badge you'd notice while already browsing
Inventory — `HeaderComponent`'s Inventory nav link and `HomeComponent`'s Inventory card now also
carry an aggregate "needs restocking" count (`shared/utils/inventory-stock.ts`'s
`needsRestockAttention()`, combining low-stock and out-of-stock since the latter isn't strictly a
subset of the former when no threshold is configured), visible to any authenticated user rather
than gated to Manager+ the way the nearby pending-approvals badge is — restocking is everyone's
concern, not an approval queue. Each loads its own count independently rather than sharing one
service, matching how this app's other small badges already do the same. `HomeComponent`'s own
field is `restockCount` (not `lowStockCount`, unlike `HeaderComponent`'s still-so-named one) and its
card label reads "X low or out of stock" rather than "X low stock" — `needsRestockAttention()`
counts out-of-stock items too (and, incidentally, any pending-retirement item, since retirement can
only be requested at zero remaining), so a narrower-sounding "low stock" label undercounted what the
number actually represented.

Inventory items can carry a `barcode` (manufacturer UPC/EAN scanned off a retail product, or a
ShelfSync-generated QR label for an internal asset that never had one — see
`shared/utils/barcode.ts`'s `buildItemQrValue()`/`parseItemQrValue()` for the encoding). The shared
`BarcodeScannerModalComponent` (camera scan via `@zxing/browser`, with an always-available
manual-entry fallback for devices/situations where the camera isn't an option) is used from two
places: `ManageInventoryComponent`'s create form scans first and checks the result against the
already-loaded inventory list — a match opens that item's existing detail instead of prefilling a
new one, so scanning something already in inventory can't create an accidental duplicate; a
non-match prefills the new item's barcode field. `ModalTableComponent`'s edit flow can (re)scan an
existing item's barcode the same way. The shared `QrLabelModalComponent` (QR rendered client-side
via the `qrcode` package) generates a printable/downloadable label encoding an item's id for
assets with no manufacturer barcode — scanning that label later resolves straight back to the item.
**Currently hidden from the UI** via `shared/utils/barcode.ts`'s `BARCODE_FEATURE_ENABLED` (`false`)
— the feature isn't fully set up to function yet, so every entry point checks this flag and renders
nothing while it's off: `ManageInventoryComponent`'s create-form field/scan button,
`ModalTableComponent`'s QR label button/barcode display row/edit field/scan button, and the
"Barcode" checkbox in both of Settings > Data's grouped-field sections (excluded from
`INVENTORY_FORM_FIELD_GROUPS`/`INVENTORY_TABLE_COLUMN_GROUPS` while the flag is false, so an admin
can't toggle on a field that would render as nothing anyway). Deliberately a UI-only kill switch,
not a removal — the column, migration, models, and both modal components stay fully in place so
this can be re-enabled later by flipping the one flag back to `true`; nothing else should need to
change. Checked directly in each rendering site rather than folded into `fieldEnabled()`/
`tableColumns`, since an org whose stored `site_settings.inventory_form_fields`/
`inventory_table_columns` already included `'barcode'` (the default before this flag existed) still
needs it hidden regardless of what's stored.

Retirement requests can either always need a second approver (today's original behavior) or
retire immediately, an admin's choice via a per-org `site_settings.require_retirement_approval`
toggle (default `true`, so every existing org keeps the original behavior unchanged) surfaced on a
third `settings` tab, **Workflow** (`SettingsComponent.viewMode` is now
`'style' | 'data' | 'workflow'`), the intended home for future org-behavior toggles alongside this
first one — a `mat-slide-toggle` (this app's first use of that Material module), same local-
selection/save-button/error/saved-flag pattern the Data tab's other settings already use. Every
section's Save button across the whole Settings page (Theme, Table presentation, Inventory data,
Retirement approval, Bulk edit) is wrapped in `@if` on that section's own `xChanged` getter — hidden
outright when the local selection matches what's persisted, rather than rendered-but-disabled, since
a button with nothing to do doesn't serve a purpose just sitting there. `isSavingX` alone still gates
the `[disabled]` binding on the ones that render, since `xChanged` stays true for the whole save
round-trip (the persisted signal only catches up once the save resolves) — so the button doesn't
disappear mid-save, only once the save actually lands.
The toggle is read inside `request_item_retirement()` itself (`coalesce(..., true)` if no
`site_settings` row exists yet, matching every other site-settings default-when-missing read): when
true, unchanged existing behavior (item enters `retirement_pending`, still needs
`approve_item_retirement`/`decline_item_retirement`); when false, the item is retired immediately
in the same call — `status` goes straight to `retired`, with `retirement_requested_by/at/note` set
for the audit trail same as before *and* `retired_by`/`retired_at` set immediately — logging
"Retired (approval not required)" instead of "Requested retirement". `approve_item_retirement`/
`decline_item_retirement`/`cancel_item_retirement_request` are unchanged; they're simply never
reached on this path. `ModalTableComponent.openRequestRetirement()`'s local-state update branches
on `siteSettings.requireRetirementApproval()` the same way, so the popup reflects whichever status
the RPC actually landed on rather than always assuming `retirement_pending`.

Admins and managers can lock an individual inventory item to stop anyone else from editing it —
`ModalTableComponent` gets a lock/unlock icon button (next to the existing copy-id/copy-link/QR-
label icons, visible only to `authService.canManage()`) calling the `set_inventory_item_lock(item_id,
locked)` RPC, and a "Locked by \<name\> — only admins and managers can edit it" banner in the same
priority slot as the existing retired/low-stock notices. The Edit button itself is wrapped in
`@if (!data.isLocked || authService.canManage())`, so a locked item simply has no visible edit entry
point for anyone else, rather than letting them open the form and fail to save. Backed by
`inventory_items.is_locked`/`locked_by`/`locked_at`, all three deliberately excluded from the
existing any-authenticated column grant (same reasoning `status`/`retirement_*` already use) —
`set_inventory_item_lock` (admin/manager only, checked via `current_user_role()`) is the only way
they change. The lock is actually *enforced* via a `with check` clause added to the existing broad
"Authenticated users can update inventory items" UPDATE policy —
`is_locked = false or current_user_role() in ('admin','manager')` — rather than a grant, since a
flat `authenticated` Postgres role can't otherwise express "managers can write, staff can't" (see
the Important RLS constraint note below); this only works safely because `is_locked` is RPC-only,
so a staff member can never bypass the check by simply resubmitting `is_locked: false` themselves.
`inventory_item_containers`' three CRUD policies (previously fully any-authenticated with no join
back to the parent item at all — a real lock-bypass vector, since a locked item's effective
`quantity_remaining` could still change via its container boxes) got the same
`is_locked = false or current_user_role() in (...)` check, joined via `item_id`, matching how
`inventory_item_images`' policies already join through to the parent item for their own checks
(which, on inspection, turned out to already be admin/manager-only and needed no change here).

Every brief "it worked" confirmation across the app (task/item created, a Settings page setting
saved) is a toast via `NotificationService.success()` (`core/notification.service.ts`, thin
wrapper around `MatSnackBar` rendering `SuccessToastComponent`) rather than a `<p>` left sitting
under the form — a handful of "Create task"/"Create item"/Settings save flows still used inline
`@if (xSaved) { <p class="success-message">...</p> }` text (each gated by its own now-removed
`xSaved` boolean, reset on every edit and every save attempt) until this was swept and converted
for consistency with how every other success feedback in the app already worked (delete/approve/
lock/transfer, etc. — see `ModalTableComponent`/`ManageTeamComponent`/`TaskDetailModalComponent`).
**Errors are deliberately exempt** — `NotificationService`'s own doc comment explains why: a
failure needs to stay visible/persistent (still an inline `<p class="error-message">`), where a
toast's few-second lifetime would risk it disappearing before it's read. Pre-login/full-page
confirmations that replace the form outright rather than sitting alongside it (register's "check
your email", forgot-password, reset-password's post-submit state) are a different case and were
deliberately left alone — those aren't brief feedback next to a form still in use, they're the
entire remaining page content, which a toast is the wrong shape for.

Manage > Team shows each member as either online now (a small pulsing green dot on their avatar)
or, when they aren't, "Last seen \<relative time\>" text in the same spot — both driven by
`profiles.last_active_at`, touched by a client-side heartbeat rather than anything live/socket-based
(no Realtime channel in this app yet, and a heartbeat also gets "last seen" for the offline case for
free, which presence alone wouldn't). `AuthService` starts a 60s `setInterval` heartbeat
(`touchLastActive()`, a plain self-service column update — same non-privileged reasoning `full_name`/
`nickname`/`avatar_key` already have, no RPC needed) whenever a session exists — on load if one's
already there, or from `onAuthStateChange` when one starts — touching immediately on start rather
than waiting a full interval, and stops it the same way when the session ends; `signOut()` also does
one last touch before actually signing out, so "last seen" reads as fresh as possible rather than up
to 60s stale. `shared/utils/presence.ts` owns the read side: `isProfileOnline()` (within
`ONLINE_THRESHOLD_MS`, 3 minutes — comfortably wider than the 60s heartbeat to absorb a missed tick
without a false-negative flicker) and `formatLastSeen()` (`Intl.RelativeTimeFormat`-based). This is
inherently an approximation, same as any heartbeat-inferred presence (Slack, GitHub, etc.) — "online"
means "was active recently," not "has a connection open right now," and a backgrounded/throttled
browser tab can slow its own timers enough to under-report. `ManageTeamComponent` polls a narrow
`profiles.select('id, last_active_at')` every 30s while the page is open and patches it onto the
already-loaded `teamMembers`/`pendingMembers` profile objects in place, rather than re-running the
full `loadProfiles()`/`loadTeamTasks()` pair (which together toggle `isLoadingTeam`, swapping the
whole accordion for a spinner) — keeps the indicator current without any visible flicker or losing
the search term/expanded panels/in-flight edits a full reload would disturb. A "Show online only"
`mat-slide-toggle` next to the name/nickname search field (`showOnlineOnly`, ANDed into
`filteredTeamMembers` alongside the existing search-term match, same `isOnline()` helper the per-
member indicator itself uses) narrows the list down to just who's currently online.
`emptyTeamMessage` picks between three phrasings (search mismatch / nobody online / both) so the
empty state names which filter(s) actually produced it, and `clearTeamFilters()` (the empty state's
own button) resets both rather than just the search term the way it used to.

Inventory item and task changes now show up live across users/tabs instead of needing a manual
refresh, via Supabase Realtime (`postgres_changes`) — `shared/utils/realtime.ts`'s
`subscribeToTableChanges()`, a thin wrapper opening one `supabase.channel(...)` per component
(this is a single-router-outlet SPA, so at most one of the five subscribing components is ever
mounted at a time — no app-wide channel-manager service needed), torn down via `DestroyRef.
onDestroy(() => supabase.removeChannel(channel))`, the same cleanup pattern this app's `setInterval`
usages already established. Deliberately **no client-side `organization_id` filter** on the
subscription — matches every other query in this app, which trusts RLS alone for org scoping; a
Realtime `postgres_changes` event is itself gated per-subscriber by the table's own RLS SELECT
policy, no separate "Realtime Authorization" setup needed for this event type. Each of the five
subscribing components reuses its own page's existing reload precedent rather than a new merge
strategy: `ManageInventoryComponent`/`InventoryComponent` patch a single row in place
(`refreshInventoryItem()`/`refreshInventoryListItem()`, the latter promoting `loadInventory()`'s
local `profiles` var to a field so it can re-resolve labels for just the one changed item);
`TasksComponent`/`ManageTasksComponent`/`ManageTeamComponent` instead reuse their existing full-
reload methods (`loadTasks()`/`loadTeamTasks()`), debounced 300ms via a new plain-`setTimeout`
`shared/utils/debounce.ts` utility (matching this app's no-RxJS-operators convention) so a burst of
WAL events collapses into one reload rather than one per event — these three pages already
deliberately do a full reload after any local mutation, since a transfer can move a task between
lists. `ManageTeamComponent`'s subscription is added alongside, not merged into, its existing 30s
presence-poll `setInterval`/cleanup — a separate, already-settled concern (see the presence
paragraph above) this feature has no reason to disturb. Scope is deliberately narrow: only
`inventory_items`/`tasks` rows go live — child tables (`inventory_item_images`,
`inventory_item_containers`, `inventory_item_activity`, `activity_log`) aren't subscribed, so a
pure photo-only edit won't push live (container edits are covered indirectly, since they write
derived quantity fields back onto the parent row). No toast fires for a background change from
another user — `NotificationService` stays scoped to the acting user's own action, same as
everywhere else in the app; data just updates silently — instead, the specific row/card that
changed briefly pulses via a shared `.realtime-flash` treatment (`shared/styles/_realtime-flash.scss`,
a background-color fade reusing the same visual language as `LandingComponent`'s own decorative
`.mock-row.flash` mockup) so a live update is noticeable without needing a toast. `shared/utils/
flash-tracker.ts`'s `FlashTracker` (a plain `Set<string>` of currently-flashing ids with its own
auto-expiry, matching this app's existing convention of plain class fields over a signals-based
state layer) is what each of the five components adds/reads from — `isFlashing(id)` in the
template — rather than a signal-per-row. Only ever triggered from the realtime handler itself, not
from a component's own local-edit reload paths (e.g. `ManageInventoryComponent.openInventoryDetail()`'s
`afterClosed()`), since flashing your own just-made edit would be pointless — you already see it
change. `InventoryComponent`/`ManageInventoryComponent` flash the single patched row directly, once
the patch itself lands (never on a DELETE, since there's no row left to flash). `TasksComponent`/
`ManageTasksComponent`/`ManageTeamComponent` collect changed ids into a `pendingFlashIds` set as raw
(pre-debounce) `postgres_changes` events arrive, then flash all of them together right after their
existing debounced reload actually completes — flashing before the reload would highlight a row
that's still showing stale data.

Three pages support bulk (multi-select) actions: the Inventory page (bulk category/physical-location
reassignment), Manage > Tasks' "All tasks" list (bulk status change and bulk delete), and Manage >
Team's "Pending join requests" list (bulk approve/deny) — deliberately not the "Current team"
accordion (removing multiple active members in bulk is far more sensitive, and its expansion-panel
layout doesn't fit a row-checkbox UX anyway) nor Manage > Inventory's retirement-requests tab (out
of scope for this pass, a natural future extension of the same shared toolbar). No RPC accepts an
array of ids anywhere in this schema, so every bulk action loops the existing single-item write path
client-side (`Promise.all`) and tallies per-item success/failure rather than assuming all-or-nothing
— a success toast reports how many went through, and only if at least one failed, an inline
`error-message` (matching every other error in this app) reports the failure count, e.g. "1 of 2
items couldn't be updated." Two new shared components back all three:
`shared/components/bulk-action-toolbar` (the "N selected / select all / clear" chrome, common to
all three pages, with each page's own action buttons passed in via content projection — it owns no
bulk-action behavior itself) and `shared/components/bulk-reassign-modal` (Inventory's own
category/physical-location picker, each field independently toggleable so an admin can bulk-set
just one without touching the other, with an explicit "(None)" option to bulk-*clear* a field).
On the Inventory page specifically, bulk selection sits behind its own `bulkEditEnabled` toggle
(a `mat-slide-toggle` in its own row above the search bar, right-aligned via `.bulk-edit-toggle-row`
— off by default) — the toolbar and every row/card's checkbox only render once it's on, so ordinary
browsing isn't cluttered with a control most visits never use; turning it off clears whatever was
selected rather than leaving a stale selection sitting around unseen. Table view's checkbox is a
leading `matColumnDef="select"` column (present in `tableColumns` only while the toggle is on); card
view's sits absolutely positioned in the bottom-right corner of the whole card (not the image — that
corner's already claimed by `.quantity-badge`, which is confined to the image area above it).
`.bulk-edit-toggle-row` also holds a compact "Select all" `mat-checkbox` immediately to the left of
the `mat-slide-toggle` (same row, shown only while the toggle is on), sized down from Material's
default via `--mat-checkbox-touch-target-display: none` (shrinking the oversized invisible touch
target, the same token `.option-list` already used elsewhere in this file rather than reaching into
MDC's internal DOM) plus a smaller font-size — it's meant as a quick header-row affordance, not a
focal control. It reads/drives the same state `BulkActionToolbarComponent`'s own built-in checkbox
would (`allSelectableItemsSelected`/`someSelectableItemsSelected` getters →
`toggleSelectAll()`), so having both visible at once would be a redundant second "select all"
control for the same selection — `BulkActionToolbarComponent` takes a `hideSelectAllCheckbox` input
(set `true` only from `InventoryComponent`'s usage) that suppresses its own checkbox entirely:
nothing renders until something's selected, at which point it shows plain "N selected" text in the
checkbox's place instead (the actions row/content-projected buttons still appear as normal).
`ManageTasksComponent`/`ManageTeamComponent` don't set this input and keep the toolbar's original
built-in checkbox, since neither has a separate header-row control of its own to be redundant with.
The feature itself (not just this session's own toggle state) can be turned off org-wide from
Settings > Workflow's "Bulk edit" section — a second `.settings-section` alongside
`require_retirement_approval` in that same card, following its exact pattern (`site_settings.
bulk_edit_enabled`, default `true`, local-selection/save-button/error pattern). When off,
`InventoryComponent` hides the "Bulk edit" toggle control entirely (`@if (siteSettings.
bulkEditFeatureEnabled())`), same "hidden, not disabled" treatment `BARCODE_FEATURE_ENABLED` already
established — distinct from (and named to avoid confusion with) `InventoryComponent.bulkEditEnabled`,
which is just this visit's own on/off state of the feature, not whether it exists for the org at all.
Selection scope differs by page's own pagination/filtering shape: `InventoryComponent`'s
`selectedItemIds` is scoped to the *filtered* set, not the current page — "Select all"
(`toggleSelectAll()`) selects every matching item across every page, not just the 12 shown at once,
and paging/sorting through a selection made this way doesn't lose it, since neither changes *which*
items are in scope (only reordering/paginating them). Only an actual filter/search change clears it
(via `selectableFilteredItems`, everything `filteredInventoryList` contains that
`canSelectItem()` allows), since that's the one thing that changes what's actually in scope.
`ManageTasksComponent`'s
`selectedTaskIds` is never explicitly cleared on filter change (this page has no pagination, and its
filters are plain `[(ngModel)]` bindings with no handler method to hook into) — instead a
`selectedVisibleTaskIds` getter intersects it with `filteredAllTasks`, so a filtered-out task simply
drops out of the visible count/acted-on set and reappears correctly if the filter is later cleared;
`ManageTeamComponent`'s `selectedPendingMemberIds` needs neither, since pending join requests have no
search/filter of their own. A locked inventory item's checkbox is disabled (not hidden — hiding would
shift row layout) for anyone who isn't `authService.canManage()`, mirroring
`ModalTableComponent`'s own Edit-button gating, so nobody can select an item a bulk reassign would
just fail on anyway. `InventoryComponent`'s bulk reassign needs no manual list reload afterward —
its existing realtime subscription already patches (and flashes) every row it touches, including the
acting user's own writes; the two task pages' bulk actions call their existing reload method
directly for immediate feedback, same as their single-action counterparts already do.

Admins and managers get a `manage/suppliers` route (`ManageSuppliersComponent`, `manageGuard`) — a
CRUD directory of who the org orders inventory from (name, contact name, email, phone, website,
notes), replacing what used to be a free-text "Supplier name" typed independently on every item.
`inventory_items.supplier_id` is a real foreign key into this new `suppliers` table now (see the
`add_supplier_directory` migration below for the backfill/RLS details); the create form
(`ManageInventoryComponent`) and the item edit form (`ModalTableComponent`) both offer it as a
dropdown rather than a text field, the same "pick from an admin-curated list" pattern
`inventory_field_options`-backed category/physical-location fields already use. Per-item lead
time/order link deliberately stay item-level fields, not directory ones — a custom order vs. a
stocked item, or a specific product page vs. a general storefront, can legitimately differ between
two items from the same supplier. `InventoryItem.supplierName` keeps its existing shape (a plain
resolved display string, read everywhere the table columns/CSV export/etc. already expected it) —
only where it's sourced from changed, via a new `supplierLabel` param on `toInventoryItem()` and
`resolveSupplierName()` in `shared/utils/supplier-label.ts`, mirroring `checked_out_to`'s own
"real FK, label resolved client-side" shape exactly.

`manage/inventory` also gets an "Export" button (`ManageInventoryComponent.exportInventoryCsv()`) —
a single friendly CSV of every item in the org (active/pending/retired alike, not scoped to any
filter), one row per item with every field plus a final "Activity log" column folding that item's
complete history into one newline-joined cell, rather than a second file to correlate by item id
(`shared/utils/inventory-export.ts`'s `buildInventoryExportCsv()`/`downloadCsv()` — plain
`Blob`/`<a download>`, no new dependency). Reuses data this page already has loaded (`allInventoryItems`
plus its images/activity maps, mapped through the same `toInventoryItem()` every other consumer of
this page's data uses) rather than issuing a fresh query.

Admins and managers get a `manage/orders` route (`ManageOrdersComponent`, `manageGuard`) — one
org-wide place to place, review, and action restock orders against any item's linked supplier,
rather than the item-detail popup this started as (an earlier "Orders" tab on `ModalTableComponent`
was removed once this page existed, since browsing/creating orders one item's popup at a time added
nothing this page doesn't already do with far more reach — same "a dedicated page already covers
this with more depth" reasoning `ManageInventoryComponent`'s old "All Inventory" tab was removed for).
A "Place order" button opens `PlaceOrderModalComponent`, which now owns the whole creation flow
itself (item picker included, not just quantity/note) — a `mat-autocomplete` search-as-you-type field
(mirroring `ManageTasksComponent`'s own related-item autocomplete) restricted to items that actually
have a supplier linked (`OrderableItem[]`, built by `ManageOrdersComponent.orderableItems` from every
org item + `SupplierService`), since an order needs to know who it's from. One order is one item +
one quantity (not a multi-line purchase order) — the simpler shape matches this app's other per-item
action patterns (retirement requests, containers) rather than a cart-style PO. The modal is fully
self-contained (matching `SupplierFormModalComponent`'s own shape): it does the actual
`inventory_item_orders` insert itself (admin/manager RLS-gated, same trust level as inventory item
creation) plus the usual dual `inventory_item_activity`/`activity_log` writes — so **every order still
shows up in its own item's activity log** even though the workflow that creates/actions it now lives
on a separate page. An order's `supplierName` is a point-in-time text snapshot (captured from the
picked item's current supplier at order time) alongside a nullable `supplierId` FK, so an order still
reads correctly even if that supplier is later renamed or removed from the directory — same "outlive
the thing it references" shape `checked_out_to` already has, just with an extra snapshot since the
name itself (not just the row's existence) matters here. Every order then moves `ordered` ->
`received`/`cancelled` through two `SECURITY DEFINER` RPCs
(`receive_inventory_item_order()`/`cancel_inventory_item_order()`, called from `ManageOrdersComponent`
now) rather than a raw table update — `inventory_item_orders` has no UPDATE grant for `authenticated`
at all, since receiving an order has to atomically bump `inventory_items.quantity_remaining`/
`quantity_total` too, which a plain RLS policy can't do. That auto-restock only happens for a
flat-tracked item (no containers) — a container-tracked item's new stock needs a location assigned to
a specific box, which the RPC can't safely guess, so those items just get the order marked received
and a prompt in the item's activity log to add a container instead. `loadAllInventoryItemOrders()` in
`shared/utils/inventory-item-orders.ts` loads every order across the org (not scoped to one item the
way it originally was) with each order's item name resolved via a plain client-side id->name map, not
a PostgREST embedded-resource select — this app doesn't use those anywhere, every other multi-entity
list here correlates separately-queried rows by id instead (e.g. `ManageInventoryComponent`'s images/
activity maps), and this follows the same convention rather than introducing a new one.

Four in-app events now also send an email, via a new `send-notification-email` Edge Function
(`supabase/functions/send-notification-email/`) backed by Resend: a task directly assigned to you on
creation, a task transfer offered to you, an inventory item's retirement request needing admin/manager
approval, and a new member's join request needing admin approval. Everything before this only ever
showed up as an in-app badge/toast — see `NotificationService`'s own doc comment for why *those*
in-app toasts are success-only; this is a separate, complementary channel for "you should know about
this even if you're not looking at the app right now," not a replacement for them.

Rather than the client calling the Edge Function after each action (which the app's activity-log
writes already do, and which would've meant duplicating that call at every task-creation/transfer/
retirement/signup site, *and* silently missing the case entirely for events like a new member's own
signup — a **pending** member can't read org-scoped data at all under this schema's RLS, so *they*
have no way to look up which admins to notify even if the client tried), this instead runs entirely
server-side: four Postgres triggers (`add_notification_email_webhooks` migration), each scoped by its
own `when (...)` clause to exactly the transition worth emailing about (e.g. `new.status =
'retirement_pending' and old.status is distinct from 'retirement_pending'`, not "any inventory_items
update"), call a shared `call_notification_webhook()` function that posts the changed row to the Edge
Function via `pg_net` (`net.http_post` — async/queued, so it can't slow down or fail the write that
triggered it). The Edge Function then queries for the right recipient(s) (the assignee/transfer
target, or every approved admin/manager in the item's org, or every approved admin for a join
request) using the `service_role` key Supabase injects into every Edge Function automatically, and
calls Resend's API to actually send.

The trigger's own call authenticates to the Edge Function with a purpose-built shared secret — not
the far more powerful `service_role` key — checked by the function itself (`verify_jwt = false` in
`config.toml`'s new `[functions.send-notification-email]` block, since there's no signed-in user's
JWT to verify in this context anyway). That secret lives in Supabase Vault (`vault.decrypted_secrets`,
read via `security definer` inside `call_notification_webhook()`) rather than the migration file
itself — a trigger's arguments are always static literals, so embedding it directly in the `CREATE
TRIGGER` call would mean committing it to the repo; the actual value was set once, directly against
the hosted project (`vault.create_secret(...)`, run ad hoc — not a migration, same convention this
app's other real/sensitive one-off values already follow) and mirrored as an Edge Function secret
(`supabase secrets set WEBHOOK_SECRET=...`) so the function can check it matches. `RESEND_API_KEY` is
a second Edge Function secret, set the same way. Neither is committed anywhere.

No verified sending domain yet — emails go out from Resend's own shared `onboarding@resend.dev`
address (works immediately, no DNS setup, but more likely to land in spam than a verified domain
would); swap `FROM_ADDRESS` in the Edge Function once a real domain is verified with Resend. `APP_URL`
is hardcoded to the Cloudflare Workers default (`https://shelf-sync.chrisistinson.workers.dev`) for
the same reason `wrangler.jsonc` has no custom domain configured yet.

Each of the four notification kinds above has its own org-wide on/off switch — Settings > Workflow's
"Email notifications" section (`site_settings.notify_task_assigned`/`notify_task_transfer`/
`notify_retirement_request`/`notify_join_request`, all default `true`, preserving the
unconditionally-on behavior every existing org already had before these switches existed), one
`mat-slide-toggle` per kind under a single shared Save button
(`SiteSettingsService.updateEmailNotifications()` bundles all four into one upsert — same "one
conceptual group, one save" shape `updateInventoryTableColumns()`/`updateInventoryFormFields()`
already use for their own multi-item selections, distinct from `requireRetirementApproval`/
`bulkEditFeatureEnabled`'s own one-setting-one-save shape in that same tab's other card). Checked
inside the Edge Function itself (`isNotificationEnabled()`, one `site_settings` lookup per
notification kind right before it would otherwise send) rather than on the Postgres trigger side —
the triggers always fire regardless (`net.http_post` is async and cheap either way), so keeping "should
this actually send" as Edge Function logic means `call_notification_webhook()` stays one dumb
dispatcher no matter how many notification kinds/settings get added later, rather than growing a
per-trigger branch to know which `site_settings` column to check.
An "Enable all"/"Disable all" button pair sits above the four toggles
(`SettingsComponent.enableAllEmailNotifications()`/`disableAllEmailNotifications()`, both just
setting all four `selectedNotifyX` fields at once via a shared private `setAllEmailNotifications()`)
so turning every kind on or off doesn't mean clicking each switch individually — each button
disables itself once redundant (`allEmailNotificationsEnabled`/`allEmailNotificationsDisabled`
getters checked directly against the *local* selection, same "reflects the in-progress edit, not
what's persisted" reasoning `emailNotificationsChanged` already uses one level up), leaving both
enabled for a mixed selection. Neither button saves by itself — same as ticking an individual
toggle, the shared Save button below only appears once `emailNotificationsChanged` is true, and the
change isn't persisted until that's clicked.
The Workflow tab's two cards (Retirement approval + Bulk edit sharing one card, Email
notifications in its own) sit side by side (`.settings-workflow-columns`, a `flex-wrap` row rather
than a fixed two-column grid, so the second card drops to its own row once a narrow viewport can't
fit both) rather than stacked top to bottom the way the Data tab's cards deliberately are — unlike
Data's cards, neither of these holds a wide checkbox grid that benefits from the full row width, so
there's no reason to waste the horizontal space a wide viewport already has. `align-items: stretch`
keeps both cards the same height regardless of which one's content happens to run longer.

## Tech Stack

- **Framework:** Angular 21 (see `package.json` for exact versions)
- **UI:** Angular Material + Angular CDK (migrated from PrimeNG — see git history) for every actual
  component; Bootstrap is scoped to just its grid system (`container`/`row`/`col-*`) plus a handful
  of hand-written utility classes (`d-flex`, `gap-3`, `mb-0`/`mb-4`/`mb-5`, `me-2`, `pe-2`) in
  `styles.scss` — `@import 'bootstrap/scss/bootstrap'` (the whole framework: every component's CSS)
  was ~240KB of production `styles.css` for CSS nothing on the page ever selected, since Material
  already covers every real component. Adding a new Bootstrap utility class to a template means
  hand-writing its rule in `styles.scss` (matching Bootstrap's own definition) rather than
  reintroducing `bootstrap/scss/utilities/api`. This dropped the initial bundle from ~1.25MB to
  ~1.05MB raw; `angular.json`'s `initial` budget (`maximumWarning`) was right-sized to `1.1mb` to
  match — `@angular/core`/Material/CDK/Router plus `@supabase/supabase-js` (not very
  tree-shakeable; `createClient()` eagerly wires up auth/storage/realtime/postgrest regardless of
  what's used) make up effectively all of what's left, and aren't safely reducible further without
  a much riskier SDK-level refactor.
- **Backend:** Supabase (Postgres, Auth, RLS), hosted project (ref `ailqjqjrzhzspofoslpa`),
  linked via the Supabase CLI. Auth, `inventory_items`, and `tasks` are all live and queried
  directly from the inventory/tasks/manage UI — no hardcoded local data remains.
- **Language:** TypeScript in strict mode (`tsconfig.json`: `strict`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `strictTemplates`, etc.). `tsconfig.app.json` and
  `tsconfig.spec.json` both include `"node"` in `types` — required by `@supabase/supabase-js`'s
  own type declarations (`NodeJS.Timeout`, `Buffer`), not because this is a Node app.
- **Tests:** Karma + Jasmine

## Commands

- Install: `npm install`
- Dev server: `npm start` (or `ng serve`) — serves at `http://localhost:4200/`
- Build: `npm run build` (or `ng build`) — output goes to `dist/inventory-app`
- Watch build: `npm run watch`
- Unit tests: `npm test` (or `ng test`) — runs Karma/Jasmine in Chrome
- Run a single test file: `ng test --include='**/inventory.component.spec.ts'`
- Lint: `npm run lint` (or `ng lint`) — ESLint via `@angular-eslint`, config in `eslint.config.js`
- Generate a component: `ng generate component <name>` (project schematic defaults to `scss`
  styles; components are standalone by default in this Angular version except where noted below)
- Supabase, hosted project workflow (no Docker — this is the primary workflow for this repo):
  - `npm run supabase:link` — link this repo to a hosted Supabase project (one-time; prompts for
    project ref and DB password)
  - `npm run supabase:push` — push local `supabase/migrations/` to the linked hosted project
  - `npm run supabase:migration:new <name>` — scaffold a new timestamped migration file
  - `npm run supabase:gen:types` — regenerate `src/app/shared/models/database.types.ts` from the
    linked project's schema
  - `npx supabase functions deploy <name>` — deploy an Edge Function under `supabase/functions/`
    (currently just `send-notification-email`, see Project Overview above) to the linked project; no
    `npm run` wrapper for this one yet since it's only been needed once so far. Function secrets
    (`RESEND_API_KEY`, `WEBHOOK_SECRET`) are set via `npx supabase secrets set NAME=value` — not
    committed anywhere, and not visible again afterward (`supabase secrets list` shows a digest, not
    the value).
- Supabase, local Docker workflow (optional, only if Docker Desktop is available):
  - `npm run supabase:start` / `npm run supabase:stop` — start/stop local Postgres, Studio, Auth
  - `npm run supabase:reset` — reapply all migrations + `supabase/seed.sql` from scratch locally

## CI/CD

`.github/workflows/ci.yml` runs on every push/PR against `main`: `npm ci`, `npm run lint`,
`npm run build`, then the full Karma/Jasmine suite headless. Node version comes from
`.node-version` (currently `22`) via `actions/setup-node`'s `node-version-file`, rather than a
hardcoded version in the workflow — one source of truth shared with whatever else reads it (e.g.
a deploy host's own Node-version detection).

Production hosting is Cloudflare Workers' static-assets product (not classic Cloudflare Pages,
despite how similar the two look/sound — the dashboard's Build configuration runs `npx wrangler
deploy`, the Workers deploy command, not a Pages one), connected directly to this GitHub repo —
pushes to `main` auto-deploy, no GitHub Actions deploy step involved. `wrangler.jsonc` at the repo
root is what makes this work: no Worker script/entry point, just `assets.directory:
"dist/inventory-app"` plus `assets.not_found_handling: "single-page-application"`, the latter
being what makes a hard refresh on e.g. `/inventory` resolve correctly instead of 404ing at the
host (this is a client-side SPA with `PathLocationStrategy` routing, no hash-based URLs). A
`src/_redirects` file (the classic-Pages convention: `/* /index.html 200`) was tried here first
and rejected outright at deploy time — "Invalid _redirects configuration: Infinite loop detected
in this rule" — this product's loop-detection validator treats a catch-all redirect as suspect in
a way classic Pages never did, so `not_found_handling` is the only SPA-fallback mechanism to use
here; don't reintroduce a `_redirects` file. `environment.prod.ts`'s Supabase URL/anon key stay
build-time constants (see Architecture below) — no host-side environment variable injection
needed for the current single-production-project setup.

## Architecture

The app mixes two Angular module styles, which is important to know before adding components:

- **Root shell (`app.module.ts`, `app.component.ts`, `app-routing.module.ts`) is `NgModule`-based.**
  `AppComponent` is explicitly `standalone: false` and is declared in `AppModule`, which imports
  the standalone `HeaderComponent`/`FooterComponent` directly into its `imports` array.
- **Everything else is a standalone component** (`LoginComponent`, `InventoryComponent`,
  `ModalTableComponent`, etc.), each declaring its own Material module imports in the
  `@Component({ imports: [...] })` array rather than through a shared `NgModule`.
- Routing (`app-routing.module.ts`) is flat — `''` → `LandingComponent`, `'login'` →
  `LoginComponent`, `'register'` → `RegisterComponent`, `'inventory'` → `InventoryComponent`
  guarded by `approvedGuard` (plus `home`, `tasks`, `account` — all similarly guarded). `manage` is
  a card hub (`ManageComponent`) linking to nine flat sibling routes — `manage/inventory`,
  `manage/tasks`, `manage/team`, `manage/activity`, `manage/error-log`, `manage/suppliers`,
  `manage/orders` (all `manageGuard`: admin OR manager) and `manage/billing`/`manage/danger-zone`/
  `manage/settings` (`adminGuard`, stricter — financial info, org export/delete, and site-wide
  branding respectively) — rather than nested child routes, matching the rest of the app's flat
  routing. `manage/settings` lives under `manage` (not its own top-level `settings` route) for
  the same reason as every other admin/manager tool here — it's reachable only via the Manage hub's
  own Settings card, not a direct header nav link or Home card, matching Billing/Danger Zone's own
  precedent of being Manage-hub-only rather than duplicated elsewhere. Every route uses
  `loadComponent` rather than a top-level `component` import, so each page (and whatever it
  imports) only ships once actually navigated to instead of all bundling into one initial chunk;
  no resolvers exist yet.
- `AppComponent.showChrome()` hides the shared `<app-header>`/`<app-footer>` chrome on an explicit
  path allowlist (landing, login, register, forgot-password, reset-password), not on a guard/data
  flag. **Any new unauthenticated/full-bleed page must be added to that allowlist too**, or it'll
  render with the main app header (including the Logout button) around it.

Directory layout under `src/app/`:
```
app.module.ts / app.component.* / app-routing.module.ts   # NgModule root shell
core/
  supabase.service.ts   # createClient<Database>() wrapper, providedIn: 'root'
  auth.service.ts        # session signal (isAuthenticated), signIn/signUp/signOut/getSession
  site-settings.service.ts # theme/logo signals; load() on app start, updateTheme()/uploadLogo()/removeLogo()
  supplier.service.ts     # SupplierService — org's supplier directory; load()/create()/update()/remove()
  guards/auth.guard.ts    # CanActivateFn — awaits authService.getSession() directly
  guards/manage.guard.ts  # admin OR manager
  guards/admin.guard.ts   # admin only (manage/settings, manage/billing, manage/danger-zone)
header/, footer/                                           # standalone layout components; header has the logout button
login/                                                      # standalone login screen, real Supabase auth
register/                                                   # standalone signup screen, real Supabase auth
pricing/                                                    # standalone public pricing page, no billing wired up yet (see Project Overview above)
privacy/, terms/                                            # standalone legal pages, no session required (see Project Overview above)
home/                                                        # post-login landing hub: cards linking to the pages below
inventory/                                                  # standalone inventory page: filters, item table, opens modal
tasks/                                                      # standalone personal "My Tasks" list (row-styled task-card)
manage/                                                     # card hub (ManageComponent) linking to the pages below
  inventory/, tasks/, team/, activity/, suppliers/, orders/ # admin/manager only: inventory (+ CSV export), tasks, team administration, the cross-entity activity feed, the supplier directory, and restock orders
  error-log/                                                # admin/manager only: client_error_log viewer, see Supabase Schema section
  billing/                                                  # admin only: pre-Stripe preview of the org's plan/usage, see Project Overview above
  danger-zone/                                              # admin only: org data export + soft-delete (organizations.deleted_at)
  settings/                                                # admin-only: theme picker + logo upload (site_settings) — see Project Overview above
account/                                                    # profile info, avatar picker, light/dark mode toggle
shared/
  components/modal-table/    # standalone Material dialog showing InventoryItem details
  components/bulk-action-toolbar/ # shared "N selected / select all / clear" chrome for every page with bulk actions
  components/bulk-reassign-modal/ # Inventory's bulk category/physical-location reassignment dialog
  components/supplier-form-modal/ # add/edit dialog backing manage/suppliers' directory CRUD
  components/place-order-modal/ # self-contained item picker + quantity/note dialog backing manage/orders' "Place order"
  components/discard-modal/ # quantity + mandatory-reason dialog backing ModalTableComponent's "Discard" button
  models/inventory-item.model.ts   # InventoryItem class (constructor-based, no defaults)
  models/supplier.model.ts   # Supplier — a directory entry inventory_items.supplier_id can point at
  models/inventory-item-order.model.ts # InventoryItemOrder — one restock order against an item's linked supplier
  models/theme-preset.ts     # THEME_PRESETS — key must match a [data-theme] block in styles.scss
  models/inventory-table-column.ts # optional Inventory table-view columns admin can show/hide (Settings > Data)
  models/pricing-tier.ts     # PRICING_TIERS — shared by PricingComponent (/pricing) and ManageBillingComponent
  models/database.types.ts   # generated via `npm run supabase:gen:types` — regenerate, don't hand-edit
  utils/inventory-item.mapper.ts   # toInventoryItem(row, images, checkedOutToLabel, activityLog?, ..., supplierLabel?) — DB row -> InventoryItem
  utils/inventory-item-images.ts   # loadInventoryImagesByItemId() / uploadInventoryItemImages() / deleteInventoryItemImage()
  utils/inventory-item-activity.ts # loadInventoryActivityByItemId() / logInventoryItemActivity() — inventory_item_activity
  utils/inventory-item-orders.ts # loadAllInventoryItemOrders() — every org order, backs manage/orders
  utils/inventory-export.ts  # buildInventoryExportCsv() / downloadCsv() — backs manage/inventory's "Export" button
  utils/activity-log.ts      # loadActivityLog() / logActivity() — org-wide activity_log, backs Manage > Activity Log
  utils/profile-label.ts     # profileDisplayName()/resolveProfileName() — shared profiles-array lookup
  utils/supplier-label.ts    # resolveSupplierName() — mirrors profile-label.ts for inventory_items.supplier_id
  utils/barcode.ts           # buildItemQrValue()/parseItemQrValue() — ShelfSync's own QR-label encoding
  utils/presence.ts          # isProfileOnline()/formatLastSeen() — reads profiles.last_active_at, backs Manage > Team's presence indicator
  utils/realtime.ts          # subscribeToTableChanges() — Supabase Realtime postgres_changes wrapper, see Project Overview above
  utils/debounce.ts          # debounce() — plain setTimeout debounce with .cancel(), backs the task pages' realtime reload handlers
  utils/flash-tracker.ts     # FlashTracker — tracks which ids show the .realtime-flash "someone else just changed this" pulse
  styles/_realtime-flash.scss # shared .realtime-flash keyframes, backing FlashTracker above
  styles/_legal-page.scss   # shared top-bar + prose layout for privacy/ and terms/ (see Project Overview above);
                             # login/register no longer share a partial like this — each owns its own layout now
```
`src/environments/environment.ts` and `environment.prod.ts` hold `supabaseUrl` and
`supabaseAnonKey` (the publishable key — safe to commit, it's constrained by RLS).
`angular.json`'s `production` build config has a `fileReplacements` entry swapping in
`environment.prod.ts`.

There are no `features/` directories yet and no state management layer beyond `AuthService`'s
session signal — other component state is still plain class fields, not signals or RxJS streams.

**`AuthService.session` vs `AuthService.getSession()`:** the `session` signal is populated
asynchronously in the constructor (via `getSession().then(...)` plus `onAuthStateChange`), so it
can lag on first render. `authGuard` therefore calls `getSession()` directly and awaits it,
rather than reading the signal, to avoid a race where a valid session hasn't populated the signal
yet on a hard refresh of `/inventory`.

## Supabase Schema

`supabase/migrations/` (applied in filename/timestamp order):
- `create_profiles` — `profiles` table (`id` = `auth.users.id`, `role` enum: `admin`/`manager`/
  `staff`), an `on_auth_user_created` trigger that inserts a profile row for every new signup, a
  reusable `set_updated_at()` trigger function, `current_user_role()` (SECURITY DEFINER helper
  used by RLS policies to avoid recursive lookups on `profiles`), and `admin_set_user_role()`
  (SECURITY DEFINER RPC — the *only* way to change a user's role; see note below).
- `create_inventory_items` — `inventory_items`, field-for-field mirror of
  `InventoryItem` (snake_case columns). Readable by any authenticated user; writable only by
  `admin`/`manager`.
- `create_tasks` — `tasks` (`status` enum: `todo`/`in_progress`/`done`). Admins/managers see and
  manage everything; other users see/update only tasks they created or are assigned to.
- `add_inventory_item_images` — `inventory_item_images` (`item_id` FK to `inventory_items`,
  `storage_path`, `position`), readable by any authenticated user and writable only by
  `admin`/`manager`, same as `inventory_items` itself. A `before insert` trigger
  (`enforce_inventory_item_image_limit`) rejects a row once an item already has 10 images —
  server-side backstop behind the client-side cap in `ManageInventoryComponent`. This migration also
  creates the public `inventory-images` Storage bucket and matching `storage.objects` policies
  (public read; `admin`/`manager`-only insert/delete).
- `add_inventory_item_activity_and_edit_access` — widens `inventory_items` UPDATE from
  admin/manager-only to any authenticated user (insert/delete are unchanged, still
  admin/manager-only), and adds `inventory_item_activity` (`item_id`, `user_id`, `message`,
  `created_at`) — readable by any authenticated user, insertable by any authenticated user but
  only ever attributed to themselves (`with check (user_id = auth.uid())`).
- `add_site_settings` — `site_settings`, a singleton row (`id` fixed to `1` via a check constraint)
  holding `theme` and `logo_storage_path`. Readable by `anon` and `authenticated` (so branding
  applies on the pre-login pages too), writable only by `admin`. Also creates the public
  `site-assets` Storage bucket (public read; `admin`-only insert/update/delete) for the logo file.
- `create_organizations` — `organizations` (the tenant boundary; every profile belongs to exactly
  one via `profiles.organization_id`), `current_user_org_id()` (SECURITY DEFINER helper, same
  recursive-lookup-avoidance reasoning as `current_user_role()`), and a rewritten
  `handle_new_user()` that creates-or-joins an org at signup from `signUp()`'s metadata
  (`organization_name` → new org, caller becomes `admin`; `invite_organization_id` → join existing
  org, caller becomes `staff`). Paired same-day with `scope_inventory_and_tasks_by_organization`
  and `scope_site_settings_by_organization`, which AND `organization_id = current_user_org_id()`
  into every existing policy on `inventory_items`/`tasks`/`site_settings`.
- `create_inventory_field_options` — `inventory_field_options`, admin-curated dropdown values for
  `inventory_items.category`/`physical_location`/`digital_location` (those columns stay plain
  text; this table only constrains what the create/edit UI offers, so older values that predate or
  fall off the list still display fine). Org-scoped select for any authenticated user,
  insert/delete admin-only. Backs `InventoryFieldOptionsService`.
- `add_organization_deletion` — org-level soft delete (`organizations.deleted_at`, settable only
  by an admin on their own org) backing the `manage/danger-zone` route, with a `pg_cron`-scheduled
  `purge_expired_organizations()` hard-deleting anything past a 30-day grace period. Also folds the
  deleted-org check into `current_user_org_id()` (so a soft-deleted org's members fail every RLS
  check schema-wide, no per-policy changes needed) and fixes two FK behaviors: `tasks.created_by`
  no longer cascades a delete (removing a team member used to silently destroy every task they'd
  *created*, not just unassign them), and the three tenant-scoped tables' `organization_id` FKs
  now cascade so the scheduled purge can run a plain `delete from organizations`.
- `add_task_transfers` — lets any assignee (not just admin/manager) hand a task off to someone
  else without it leaving their queue until accepted. Adds `tasks.pending_transfer_to` and four
  SECURITY DEFINER RPCs (`request_task_transfer`/`cancel_task_transfer`/`accept_task_transfer`/
  `decline_task_transfer`) as the only way `assigned_to`/`pending_transfer_to` ever change —
  `assigned_to`/`pending_transfer_to` are pulled out of the ordinary column grant for exactly that
  reason. This is also the migration that establishes the request/cancel/accept-or-decline RPC
  shape `add_inventory_item_retirement` and `add_member_approval` below both reuse.
- `add_inventory_item_retirement` — retirement workflow for out-of-stock items: any org member can
  request retiring an item once `quantity_remaining` hits 0, admin/manager approves or declines.
  Adds `inventory_items.status` (`active`/`retirement_pending`/`retired`) plus
  `retirement_requested_by/at`/`retirement_request_note`/`retired_by/at`, and four SECURITY
  DEFINER RPCs (`request_item_retirement`/`cancel_item_retirement_request`/
  `approve_item_retirement`/`decline_item_retirement`) as the only way those columns change. Also
  the migration that first gives `inventory_items` a column-scoped `revoke`/`grant` (it never had
  one before, unlike `tasks`) — everything `ModalTableComponent`'s edit flow actually touches
  (including `is_checked_out`/`checked_out_to`) stays grantable to any authenticated user; the new
  retirement columns become RPC-only.
- `add_member_approval` — admin approval for org join requests: joining via an invite link used to
  grant full staff access the instant signup succeeded; now it creates a pending request instead.
  Adds `profiles.membership_status` (`pending`/`approved`, excluded from the ordinary column grant
  for the same reason `role` is — otherwise a pending user could just approve themselves) and
  `admin_approve_member()`. `current_user_org_id()` returns `null` for a pending caller, so — same
  mechanism as the soft-delete fail-closed behavior above — every org-scoped policy schema-wide
  rejects them automatically. Denying a request reuses `ManageTeamComponent`'s existing
  delete-the-profile mechanism; there's no separate "denied" status.
- `fix_org_isolation_bugs` — security-review fixes: restores the deleted-org join
  `add_organization_deletion` added to `current_user_org_id()`, which `add_member_approval`
  had accidentally dropped when it rewrote the same function; makes the org-ownership check in all
  eight task-transfer/retirement RPCs above null-safe (`current_user_org_id() is null` was
  previously compared with `!=` directly, which is NULL in PL/pgSQL and so silently failed *open*
  for exactly the pending/deleted-org callers it most needed to reject); and adds org-scoped
  INSERT/DELETE policies to the `inventory-images` Storage bucket, which had none before (any
  admin/manager of *any* org could write or delete another org's item photos).
- `close_task_assignee_column_gap` — the last piece of `tasks`' column-scoping story: the
  "Assignees can update their own tasks" policy still let a plain assignee (not admin/manager)
  write `title`/`description`/`due_date`/`related_item_name` directly, even though the only UI
  touching this (`TaskDetailModalComponent.saveStatus()`) ever sends `status`. Drops that policy
  and adds `update_task_status()`, a SECURITY DEFINER RPC mirroring `request_task_transfer()`'s
  shape, as the only way a plain assignee can change a task now.
- `require_approved_task_transfer_target` / `require_approved_task_assignee` — close a pair of
  matching gaps: `request_task_transfer()` and the "Admins and managers can create tasks for
  anyone" INSERT policy both checked that a target/assignee profile belonged to the caller's
  organization, but never that they were an *approved* member of it — a pending join request is a
  real `profiles` row with `organization_id` set, so it passed. Both are now enforced (RPC check /
  RLS `exists` subquery, respectively), with matching client-side dropdown filters
  (`transferablePeople` in `TaskDetailModalComponent`, `approvedAssignableProfiles` in
  `ManageTasksComponent`, the filtered list in `CreateTaskModalComponent`) so the UI doesn't offer
  someone who'd just get rejected server-side anyway.
- `fix_task_transfer_org_null_check` — a same-day follow-up: adding the target-approval check
  above required a full `create or replace function` on `request_task_transfer()`, which silently
  dropped the `current_user_org_id() is null or` null-safety guard `fix_org_isolation_bugs` had
  added to this exact function days earlier (see that entry above for why the guard exists).
  Caught by a follow-up `/security-review` pass; restored to match the still-correct
  `cancel`/`accept`/`decline_task_transfer` siblings, which the regressing migration never
  touched. Worth remembering as a pattern: any migration that does `create or replace function` on
  an existing SECURITY DEFINER RPC needs to be diffed against the *previous* version of that
  function, not just reviewed for the change being added — it's easy to silently drop an
  unrelated safety check that was already there.
- `add_client_error_log` — Supabase-native error tracking (no third-party service): adds
  `client_error_log` (readable only by an approved admin/manager for their own org) and
  `log_client_error()`, a SECURITY DEFINER RPC granted to `anon` and `authenticated` alike (a
  crash can happen before sign-in) that derives `user_id`/`organization_id` server-side from
  `auth.uid()` rather than trusting them from the client. `GlobalErrorHandler`
  (`core/global-error-handler.ts`, registered as the app's `ErrorHandler` in `AppModule`)
  fire-and-forgets every uncaught client exception here. `manage/error-log`
  (`ManageErrorLogComponent`) is the in-app viewer — `manageGuard`-gated (admin OR manager),
  matching the table's own SELECT policy exactly, so no new RPC/migration was needed for reads;
  it just queries `client_error_log` directly and lets RLS do the scoping. Errors logged pre-auth
  land with `organization_id` null and still aren't exposed in-app — there's no cross-org "platform
  admin" role in this schema — so those remain Studio-only.
- `add_inventory_item_barcode` — adds `inventory_items.barcode` (nullable, unique per organization
  via a partial index on `(organization_id, barcode) where barcode is not null`), plus an
  additive `grant update (barcode)` since `add_inventory_item_retirement` gave `inventory_items` a
  column-scoped UPDATE grant rather than a flat one — any new writable column needs its own grant
  or it silently fails to save despite passing RLS. Backs the barcode/QR scanning feature (see
  Project Overview above): a manufacturer barcode scanned off a retail product, or a
  ShelfSync-generated QR label for an item that never had one, both resolve to this one column.
- `add_site_settings_inventory_table_columns` — adds `site_settings.inventory_table_columns` (`text[]`,
  `not null default` all four options), backing the admin-configurable Inventory table-view columns
  described in Project Overview above. No RLS/grant changes needed: unlike `inventory_items`/`tasks`,
  `site_settings`' UPDATE policy (from `scope_site_settings_by_organization`) is already a flat,
  non-column-scoped "admin of own org" check covering the whole row, and its SELECT policy already
  lets any org member read it — a new plain column rides along under both existing policies.
- `add_more_avatar_presets` — widens `profiles.avatar_key`'s check constraint (originally 8 "shape"
  presets from `add_avatar_to_profiles`) with 4 "people" and 3 "animal" options — same
  purely-cosmetic, self-service column, no RLS/grant changes. A check constraint can't be altered
  in place, so this drops and recreates it with the expanded key list; `shared/models/avatar-preset.ts`'s
  `AVATAR_PRESETS` array is the client-side counterpart that must stay in sync with it — the Account
  page's avatar picker (and everywhere else `UserAvatarComponent` resolves an `avatar_key`) just
  iterates that array, so a new preset needs no other code changes once both are updated together.
- `add_activity_log` / `fix_activity_log_status_label_casing` — `activity_log`
  (`organization_id` defaulting to `current_user_org_id()`, `actor_id`, `entity_type` — one of
  `inventory_item`/`task`/`member` —, `entity_id`, `message`, `created_at`), backing
  `manage/activity` (see the Project Overview section above). Readable/insertable by any
  authenticated user for their own org, self-attributed only (`actor_id = auth.uid()`), same
  shape as `inventory_item_activity`. RPC-driven events (retirement, task transfers/status,
  `handle_new_user`, `admin_approve_member`) log inline as part of the same `create or replace`
  that already existed for each function — `handle_new_user` in particular sets
  `organization_id`/`actor_id` explicitly rather than relying on the column default, since it runs
  as an `auth.users` trigger outside a normal authenticated call where `auth.uid()` isn't set. Also
  adds `profile_display_name()`, a small SECURITY DEFINER helper mirroring
  `profileDisplayName()`'s nickname → full_name → email fallback, reused by every RPC that needs to
  name a *different* profile than the caller (e.g. a task transfer's target) in its log message.
  `request_task_transfer()`'s `create or replace` here was diffed against
  `fix_task_transfer_org_null_check` (its immediately-preceding version, including the
  target-approval check and null-safety guard) before adding the log insert, per that entry's own
  "diff against the previous version" warning.
- `add_inventory_item_containers` — `inventory_item_containers` (`item_id` FK to `inventory_items`,
  `quantity`, `location`), backing per-container quantity tracking (see Project Overview above).
  Same shape as `add_inventory_item_images`: a child table with no `organization_id` of its own,
  org isolation coming from `item_id`. Unlike images (admin/manager-only insert/delete), all four
  policies here are any-authenticated-user — matching the widened `inventory_items` UPDATE grant
  this same item-detail-popup edit flow already rides on.
- `add_site_settings_inventory_form_fields` — adds `site_settings.inventory_form_fields` (`text[]`,
  `not null default` every field), backing Settings > Data's "Inventory data" section (see Project
  Overview above) — which optional fields show on the "Create item" form. Same reasoning as
  `add_site_settings_inventory_table_columns` for needing no RLS/grant changes; unlike that
  migration's intentionally-narrow four-column default, this one defaults to *every* field so an
  org that's never visited the new section sees no change to their create form.
- `add_site_settings_require_retirement_approval` — adds `site_settings.require_retirement_approval`
  (`boolean not null default true`, preserving today's always-needs-approval behavior for every
  existing org) and a `create or replace` on `request_item_retirement()` (diffed against its
  `add_activity_log` version above, the latest at the time) that reads it and, when false, retires
  the item immediately instead of setting `retirement_pending` — see Project Overview above for the
  full behavior and the new Settings > Workflow tab that surfaces it.
- `add_inventory_item_locking` — adds `inventory_items.is_locked`/`locked_by`/`locked_at` (all three
  excluded from the existing column grant, RPC-only) and `set_inventory_item_lock(item_id, locked)`
  (admin/manager only), plus a `with check` addition to the existing broad inventory-items UPDATE
  policy and matching `is_locked`-aware rewrites of all three `inventory_item_containers` policies —
  see Project Overview above for the full mechanism and why `is_locked` has to stay out of the
  column grant for the RLS check to be safe.
- `add_last_active_at_to_profiles` — adds `profiles.last_active_at`, backing Manage > Team's
  "online now"/"last seen" indicator (see Project Overview above). Purely cosmetic/self-service,
  same reasoning `full_name`/`nickname`/`avatar_key` already have — no RLS/RPC changes needed
  beyond widening the existing column grant, since "Users can update their own profile" already
  scopes it to `auth.uid() = id` and there's no privilege distinction to protect the way
  `role`/`membership_status` need.
- `enable_realtime_for_inventory_and_tasks` — adds `inventory_items` and `tasks` to the
  `supabase_realtime` publication (idempotent existence-check wrapper — Postgres has no
  `ADD TABLE IF NOT EXISTS` for publications) and sets `REPLICA IDENTITY FULL` on both, backing the
  live-update feature described in Project Overview above. No RLS/grant changes — delivery of each
  `postgres_changes` event is already gated by the tables' existing org-scoped SELECT policies.
  `REPLICA IDENTITY FULL` is what makes a DELETE event's "old row" payload carry every column
  (including `organization_id`) rather than just the primary key — without it, RLS can't evaluate
  the org-scoping predicate against a DELETE's old row at all, which fails the check *closed* for
  every subscriber, not just a leak-prevention gap.
- `add_site_settings_bulk_edit_enabled` — adds `site_settings.bulk_edit_enabled` (`boolean not null
  default true`, preserving the Inventory page's Bulk edit feature as shipped for every existing org),
  surfaced on Settings > Workflow's new "Bulk edit" section alongside `require_retirement_approval`.
  Purely a client-side UI gate (`InventoryComponent` hides the toggle/checkboxes/toolbar outright when
  off, same treatment `BARCODE_FEATURE_ENABLED` already established) — no RPC/function changes needed,
  unlike `require_retirement_approval`'s own migration. No RLS/grant changes either: same reasoning as
  every other `site_settings` column added this way — its UPDATE policy is already a flat,
  non-column-scoped "admin of own org" check, so a new plain column rides along under it.
- `add_inventory_photo_storage_usage` — adds `get_inventory_photo_storage_usage()`, backing
  `manage/billing`'s real photo storage usage number (see that page's own paragraph above). Admin-only
  `SECURITY DEFINER` function (checked via `current_user_role()` inside the function itself, same
  pattern as `admin_set_user_role()`) since `storage.objects` isn't exposed to PostgREST — reads
  bypass RLS entirely, joined back through `inventory_item_images` -> `inventory_items` for org
  scoping rather than parsing `storage_path` prefixes.
- `add_supplier_directory` — adds `suppliers` (`organization_id`, `name`, `contact_name`, `email`,
  `phone`, `website`, `notes`; unique per `(organization_id, name)`) and replaces
  `inventory_items.supplier_name` (free text, independently retyped on every item from the same
  supplier) with `inventory_items.supplier_id`, a real foreign key into it — backing `manage/suppliers`
  (`ManageSuppliersComponent`, `manageGuard`) and the supplier picker on both the create form
  (`ManageInventoryComponent`) and the item edit form (`ModalTableComponent`). Per-item logistics —
  `supplier_lead_time`/`order_link`, which genuinely can vary item to item even from the same supplier
  (a custom order vs. a stocked one; a specific product page vs. a general storefront) — deliberately
  stay on `inventory_items` rather than folding into the directory. The migration backfills: one
  `suppliers` row per distinct existing `supplier_name` (per org), every matching item repointed at
  it via `supplier_id`, then the now-redundant `supplier_name` column dropped — its data fully
  preserved as `suppliers.name` first, same "the FK is the source of truth, the label is resolved
  client-side" shape `checked_out_to` already has (`InventoryItem.supplierName`, the resolved display
  label, is unchanged in shape; only where it's sourced from changed — see
  `toInventoryItem()`'s new `supplierLabel` param and `resolveSupplierName()` in
  `shared/utils/supplier-label.ts`). RLS: any authenticated org member can read the directory (needed
  for the picker), but only admin/manager can insert/update/delete it — richer than
  `inventory_field_options`' admin-only insert/delete (this also needs update, for editing a
  supplier's contact info), same "any authenticated user picks from an admin/manager-curated list"
  shape. `inventory_items.supplier_id` itself stays in the existing any-authenticated-user column
  grant (additive `grant update (supplier_id)`, same pattern `add_inventory_item_barcode` used for its
  own new column) — reassigning *which* supplier an item uses is as freely editable as every other
  field, only curating the directory itself is admin/manager-gated. `manage/inventory`'s own "Export"
  button (`exportInventoryCsv()`) is a separate, no-migration-needed addition alongside this one — a
  friendly CSV of every item's current data plus its full activity history (one row per item, activity
  log entries folded into a single newline-joined cell — see `shared/utils/inventory-export.ts`'s own
  doc comment for why one file beats two correlated-by-id ones), reusing data this page already has
  loaded rather than a new query.
- `add_inventory_item_orders` — adds `inventory_item_orders` (`item_id`, `supplier_id` nullable/`on
  delete set null`, `supplier_name` — a required point-in-time text snapshot, so an order still reads
  correctly if its supplier is later renamed or removed — `quantity`, `status`
  `'ordered'|'received'|'cancelled'`, `note`, `ordered_by/at`, `received_by/at`), backing
  `manage/orders` (described above). One order = one item + one quantity, not a multi-line PO. SELECT is
  any org member (joined through `item_id` -> `inventory_items.organization_id`, unlike
  `inventory_item_containers`' original no-join `using (true)` — see
  `add_inventory_item_locking`'s own retrofit of that gap — this table starts properly org-scoped from
  day one); INSERT is admin/manager only (`with check (status = 'ordered')` too, so a row can't be
  inserted pre-marked received/cancelled) — ordering has a real financial cost, the same trust level
  `inventory_items`' own INSERT policy already has, not the wider any-authenticated-user reach
  containers/images editing gets. No UPDATE/DELETE grant for `authenticated` at all: every status
  transition goes through `cancel_inventory_item_order()`/`receive_inventory_item_order()`, both
  `SECURITY DEFINER`, since receiving in particular has to atomically bump
  `inventory_items.quantity_remaining`/`quantity_total` too (only when the item has no containers —
  see the Project Overview paragraph above for why), and a raw RLS policy can't touch a second table
  as a side effect of the first. `receive_inventory_item_order()` also logs to both
  `inventory_item_activity` and the org-wide `activity_log`, matching how the retirement RPCs already
  log to both from a single call.
- `add_notification_email_webhooks` — enables `pg_net` and adds `call_notification_webhook()` plus
  four triggers (`tasks` insert/update, `inventory_items` update, `profiles` insert), backing the
  email notifications described above. Each trigger's own `when (...)` clause scopes it to exactly one
  transition (e.g. a task's `pending_transfer_to` actually changing, not any task update) — `when` can
  only reference `NEW`/`OLD`, not `TG_OP`, which is why direct task assignment (INSERT) and transfer
  offers (UPDATE) need two separate triggers rather than one covering both. The shared secret
  authenticating the Edge Function call is read from Vault (`vault.decrypted_secrets`) at call time,
  not embedded in this migration — see the Project Overview paragraph above for why a trigger's static
  arguments make that the only real option short of committing it.
- `add_site_settings_email_notification_toggles` — adds `site_settings.notify_task_assigned`/
  `notify_task_transfer`/`notify_retirement_request`/`notify_join_request` (all `boolean not null
  default true`), backing Settings > Workflow's "Email notifications" section (described above). No
  RLS/grant changes needed: same reasoning as every other `site_settings` column added this way — its
  UPDATE policy is already a flat, non-column-scoped "admin of own org" check, so new plain columns
  ride along under it.

`supabase/seed.sql` is local-dev demo data for ShelfSync's first real use case, an event planning/
rental company — 21 inventory items (chairs, tables, linens, lighting/AV, tents, bar/power
equipment) across matching `inventory_field_options`, plus a 4-pallet `inventory_item_containers`
breakdown on one item and one `retirement_pending`/one `retired` row, so every stock-status and
retirement-workflow state has an example out of the box. Every item also carries a placeholder
supplier (a handful of fictional per-category `suppliers` rows — e.g. "Gatherwell Event Furniture
Co." for the furniture rows, referenced via `supplier_id` — fixed demo ids, same "hardcode it since
there's no authenticated caller for `current_user_org_id()` to default from" reasoning
`organization_id`'s own id already needs). Each supplier row itself carries a placeholder contact
name/email/phone/website/notes too, rather than leaving those null — the email/website placeholders
reuse the exact same `.example.com` domain that supplier's own items already use for their
`order_link`s, so e.g. Gatherwell's contact email and every Gatherwell item's order link resolve to
the same fictional company. Each item further carries a lead time and an
`https://*.example.com/order/...` link (`.example.com` being the reserved, non-resolving placeholder
domain), a `digital_location` ("Shared Drive > Inventory > <category> > <item>"), and an
`applicable_year`, rather than leaving those null — `expiration_date` and `barcode` are still left
null throughout, deliberately: expiration doesn't meaningfully apply to rental furniture/AV/tents,
and a fabricated barcode risks colliding with the real barcode-scanning feature.
`checked_out_to`/`retirement_requested_by`/`retired_by` are all left `null` since they're real FKs to
`profiles` now and the seed doesn't create fake auth users. The hosted project's own org was reseeded
to the same catalog directly (a one-off `supabase db query --linked` run against live data, not a
migration — see git history for that commit's script and the later one that filled in the placeholder
fields) rather than via this file, which only ever runs against a fresh local Docker instance.

**Important RLS constraint:** every signed-in user maps to the same Postgres role
(`authenticated`) in Supabase — there's no separate DB role per app role. That means
column-level `GRANT`s can't be used to say "admins can edit column X, other users can't": the
grant applies to `authenticated` as a whole. Where that distinction matters (e.g. `profiles.role`),
the fix is a `SECURITY DEFINER` RPC that checks `current_user_role()` internally, not a raw
table `UPDATE` gated by RLS alone. Follow `admin_set_user_role()` as the template. Two spots that
used to have this gap (a non-admin/manager user could edit a whole row via RLS, not just the
intended column(s)) are now both closed: `inventory_items`'s column grant (from
`add_inventory_item_retirement`) excludes `status`/`retirement_*`/`retired_*`, forcing those
through the retirement RPCs; `tasks`'s "Assignees can update their own tasks" policy (which still
granted a plain assignee `title`/`description`/`due_date`/`related_item_name`, not just `status`)
was dropped in `close_task_assignee_column_gap` in favor of `update_task_status()`, mirroring
`request_task_transfer()`'s shape.

Regenerate `src/app/shared/models/database.types.ts` after any schema change with
`npm run supabase:gen:types` (requires the project to be linked — see Commands above).

**Signup requires email confirmation.** This hosted project has email confirmation enabled, and
uses Supabase's default shared email sender, which is rate-limited to a couple of emails/hour
until custom SMTP is configured in the dashboard. `AuthService.signUp()` returns
`needsEmailConfirmation: true` when `signUp()` succeeds but no session comes back, and
`RegisterComponent` shows a "check your email" message in that case rather than navigating to
`/home`. When testing signup repeatedly, expect to hit `over_email_send_rate_limit`
(surfaces as a normal `error.message`) — that's the shared sender's limit, not a bug.

## Coding Conventions (from `.editorconfig`)

- 2-space indentation, single quotes in `.ts` files, final newline required, trailing whitespace
  trimmed (except in `.md` files).
