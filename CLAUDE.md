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
unchanged. This replaced the old "Discard" flow (`DiscardInventoryModalComponent`, a quantity +
mandatory-reason modal that decremented `quantity_remaining`/`quantity_total` together): container
editing is now the only way to reduce stock with a record of which box it came from, though unlike
Discard it has no mandatory reason field — a plain diffed activity log line ("Box 1 (20 → 10)") is
what's recorded instead, same as every other edited field. `ManageInventoryComponent`'s create-item
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

Admins get a `customize` route (guarded by a dedicated `adminGuard`, stricter than the
admin-or-manager `manageGuard`) for site-wide branding: a color theme picker and a logo upload,
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
The same `customize` route's Data tab holds three sections,
each its own full-width card stacked top to bottom rather than side-by-side columns (an earlier
two-column layout made whichever card held two sections force the page to the height of its
*tallest* column, wasting the other column's width without actually shortening the page — full
width instead lets every section's checkbox groups spread across more columns, which is what
actually cuts down scrolling): "Filter data" (the field-options editors — approved category/
physical-location *values*) and "Inventory data" (which optional fields appear on the "Create item"
form) share one `.customize-card` (a divider between them, same pattern `.customize-section +
.customize-section` uses on the Style tab), then "Table presentation" (which optional columns
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
grouped option list/labels and canonical display order, shared by `CustomizeComponent` (grouped
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
noise. `.footer-content` switches from `justify-content: space-between` to `center` when the links are
hidden, so the lone Studio Rio mark doesn't end up stranded at the flex-start edge with nothing to
balance against on the other side. The register form's submit button carries a "you agree to our
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
member count, and inventory item count are real, queried numbers; photo storage usage and the
billing-cycle date are plausible-looking placeholders (getting real storage usage would need a new
Postgres function reading `storage.objects`, Supabase Storage's own backing table, which isn't
exposed to PostgREST directly — real future work, not needed for this preview).

The Inventory page has a card/table view toggle (`InventoryComponent.viewMode`, a
`mat-button-toggle-group` above the item list) — card view is the original gallery layout; table
view is a `mat-table`/`matSort` grid, sortable by clicking any column header (`sortedInventoryList`
sits between the existing `filteredInventoryList` and `pagedInventoryList` getters, so sorting
composes with the existing filter/search/paging pipeline rather than replacing any of it). Table
rows collapse card view's simultaneous badges (retired, checked-out, low/out-of-stock, pending
retirement can all show at once there) into a single higher-priority status pill per row
(`statusLabel()`/`statusSlug()`, also what "sort by status" sorts on) since a dense row has no room
for more than one. Which optional columns the table shows (Category, Physical location, Quantity
remaining, Stock status) is admin-configurable from `customize`'s Data tab, per the paragraph above.

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

Retirement requests can either always need a second approver (today's original behavior) or
retire immediately, an admin's choice via a per-org `site_settings.require_retirement_approval`
toggle (default `true`, so every existing org keeps the original behavior unchanged) surfaced on a
third `customize` tab, **Workflow** (`CustomizeComponent.viewMode` is now
`'style' | 'data' | 'workflow'`), the intended home for future org-behavior toggles alongside this
first one — a `mat-slide-toggle` (this app's first use of that Material module), same local-
selection/save-button/error/saved-flag pattern the Data tab's other settings already use. The
toggle is read inside `request_item_retirement()` itself (`coalesce(..., true)` if no
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

Every brief "it worked" confirmation across the app (task/item created, a Customize setting
saved) is a toast via `NotificationService.success()` (`core/notification.service.ts`, thin
wrapper around `MatSnackBar` rendering `SuccessToastComponent`) rather than a `<p>` left sitting
under the form — a handful of "Create task"/"Create item"/Customize save flows still used inline
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
the search term/expanded panels/in-flight edits a full reload would disturb.

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
  guarded by `approvedGuard` (plus `home`, `tasks`, `customize`, `account` — all similarly guarded,
  `customize` also gated by `adminGuard`). `manage` is a card hub (`ManageComponent`) linking to
  six flat sibling routes — `manage/inventory`, `manage/tasks`, `manage/team`, `manage/activity`,
  `manage/error-log` (all `manageGuard`: admin OR manager) and `manage/danger-zone` (`adminGuard`,
  stricter — org export/delete) — rather than nested child routes, matching the rest of the app's
  flat routing. Every route uses `loadComponent` rather than a top-level `component` import, so
  each page (and whatever it imports) only ships once actually navigated to instead of all
  bundling into one initial chunk; no resolvers exist yet.
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
  guards/auth.guard.ts    # CanActivateFn — awaits authService.getSession() directly
  guards/manage.guard.ts  # admin OR manager
  guards/admin.guard.ts   # admin only (Customize route, manage/danger-zone)
header/, footer/                                           # standalone layout components; header has the logout button
login/                                                      # standalone login screen, real Supabase auth
register/                                                   # standalone signup screen, real Supabase auth
pricing/                                                    # standalone public pricing page, no billing wired up yet (see Project Overview above)
privacy/, terms/                                            # standalone legal pages, no session required (see Project Overview above)
home/                                                        # post-login landing hub: cards linking to the pages below
inventory/                                                  # standalone inventory page: filters, item table, opens modal
tasks/                                                      # standalone personal "My Tasks" list (row-styled task-card)
manage/                                                     # card hub (ManageComponent) linking to the six below
  inventory/, tasks/, team/, activity/                      # admin/manager only: inventory, tasks, team administration, and the cross-entity activity feed
  error-log/                                                # admin/manager only: client_error_log viewer, see Supabase Schema section
  billing/                                                  # admin only: pre-Stripe preview of the org's plan/usage, see Project Overview above
  danger-zone/                                              # admin only: org data export + soft-delete (organizations.deleted_at)
customize/                                                  # admin-only: theme picker + logo upload (site_settings)
account/                                                    # profile info, avatar picker, light/dark mode toggle
shared/
  components/modal-table/    # standalone Material dialog showing InventoryItem details
  models/inventory-item.model.ts   # InventoryItem class (constructor-based, no defaults)
  models/theme-preset.ts     # THEME_PRESETS — key must match a [data-theme] block in styles.scss
  models/inventory-table-column.ts # optional Inventory table-view columns admin can show/hide (Customize > Data)
  models/pricing-tier.ts     # PRICING_TIERS — shared by PricingComponent (/pricing) and ManageBillingComponent
  models/database.types.ts   # generated via `npm run supabase:gen:types` — regenerate, don't hand-edit
  utils/inventory-item.mapper.ts   # toInventoryItem(row, images, checkedOutToLabel, activityLog?) — DB row -> InventoryItem
  utils/inventory-item-images.ts   # loadInventoryImagesByItemId() / uploadInventoryItemImages() / deleteInventoryItemImage()
  utils/inventory-item-activity.ts # loadInventoryActivityByItemId() / logInventoryItemActivity() — inventory_item_activity
  utils/activity-log.ts      # loadActivityLog() / logActivity() — org-wide activity_log, backs Manage > Activity Log
  utils/profile-label.ts     # profileDisplayName()/resolveProfileName() — shared profiles-array lookup
  utils/barcode.ts           # buildItemQrValue()/parseItemQrValue() — ShelfSync's own QR-label encoding
  utils/presence.ts          # isProfileOnline()/formatLastSeen() — reads profiles.last_active_at, backs Manage > Team's presence indicator
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
  `not null default` every field), backing Customize > Data's "Inventory data" section (see Project
  Overview above) — which optional fields show on the "Create item" form. Same reasoning as
  `add_site_settings_inventory_table_columns` for needing no RLS/grant changes; unlike that
  migration's intentionally-narrow four-column default, this one defaults to *every* field so an
  org that's never visited the new section sees no change to their create form.
- `add_site_settings_require_retirement_approval` — adds `site_settings.require_retirement_approval`
  (`boolean not null default true`, preserving today's always-needs-approval behavior for every
  existing org) and a `create or replace` on `request_item_retirement()` (diffed against its
  `add_activity_log` version above, the latest at the time) that reads it and, when false, retires
  the item immediately instead of setting `retirement_pending` — see Project Overview above for the
  full behavior and the new Customize > Workflow tab that surfaces it.
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

`supabase/seed.sql` is local-dev demo data for ShelfSync's first real use case, an event planning/
rental company — 21 inventory items (chairs, tables, linens, lighting/AV, tents, bar/power
equipment) across matching `inventory_field_options`, plus a 4-pallet `inventory_item_containers`
breakdown on one item and one `retirement_pending`/one `retired` row, so every stock-status and
retirement-workflow state has an example out of the box. Every item also carries placeholder
supplier info (a handful of fictional per-category suppliers — e.g. "Gatherwell Event Furniture
Co." for the furniture rows — each with a lead time and an `https://*.example.com/order/...` link,
`.example.com` being the reserved, non-resolving placeholder domain), a `digital_location`
("Shared Drive > Inventory > <category> > <item>"), and an `applicable_year`, rather than leaving
those null — `expiration_date` and `barcode` are still left null throughout, deliberately:
expiration doesn't meaningfully apply to rental furniture/AV/tents, and a fabricated barcode risks
colliding with the real barcode-scanning feature. `checked_out_to`/`retirement_requested_by`/
`retired_by` are all left `null` since they're real FKs to `profiles` now and the seed doesn't
create fake auth users. The hosted project's own org was reseeded to the same catalog directly (a
one-off `supabase db query --linked` run against live data, not a migration — see git history for
that commit's script and the later one that filled in the placeholder fields) rather than via this
file, which only ever runs against a fresh local Docker instance.

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
