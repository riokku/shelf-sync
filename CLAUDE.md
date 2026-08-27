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
unfiltered-beyond-status-toggle name/category/quantity/price row list). Like `SettingsComponent`'s
own tabs (see its own paragraph elsewhere in this file for the full mechanism), the active tab is
reflected in the URL as `?tab=create|retirements` via the same `setViewMode()` shape.
`allInventoryItems` itself
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
container edit — either way logging a reason-carrying line ("Discarded 3 units from Box 1. Reasons:
Water damage, Wear and tear" — "Reason:" singular when only one is picked) to
`inventory_item_activity`, *and* a structured row (`inventory_item_discards` — `item_id`,
`container_id` nullable, `quantity`, `reason` (a `text[]`, one or more entries — see the multi-select
reasons paragraph below), `discarded_by`, `discarded_at`) via the new `logInventoryItemDiscard()`
alongside it, so `manage/reports`' "Stock movement & loss" section has a queryable quantity/reason/
category to group by instead of having to regex-parse that free-text message — see that page's own
paragraph below. This reinstates (in a unified shape) an original `DiscardInventoryModalComponent`
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

Login, Register, and Forgot Password all embed a shared `TurnstileWidgetComponent`
(`shared/components/turnstile-widget`) — Cloudflare Turnstile, to stop scripted signup/credential-
stuffing/password-reset abuse (found missing during a `/security-review` pass). Supabase's own
captcha protection (Auth > Attack Protection, hosted-project-dashboard-only — no migration or
`config.toml` setting can turn it on for the *hosted* project, only for a local `supabase start`
instance nobody here runs) enforces it project-wide across sign-up, sign-in, *and* password
recovery simultaneously the moment it's enabled — there's no way to require it on just Register —
which is why the same widget sits on all three forms rather than only the one this was originally
asked for. Each form's submit button stays `[disabled]` until the widget's `verified` output hands
back a token (`captchaToken`, cleared again on `cleared` — Turnstile's own expired/error callbacks
merged into one output, since the parent's response to both is identical: null out the token and
wait for a fresh one); `(ngSubmit)` still fires on pressing Enter regardless of a disabled button,
so `attemptLogin()`/`attemptRegister()`/`requestReset()` each also guard on `!this.captchaToken`
directly, the same way they already guard on `this.form.invalid`. A token is single-use — a failed
attempt nulls `captchaToken` back out and calls the widget's own `reset()` (fetches a fresh token
from the same rendered instance rather than tearing down and re-rendering) so retrying doesn't
resubmit one Supabase already consumed or rejected. `AuthService.signIn()`/`signUp()`/
`requestPasswordReset()` all take an optional trailing `captchaToken` param, passed straight through
as `options.captchaToken` to the matching `supabase.auth.*` call — optional in the type sense only,
since each of the three components already refuses to call them without a real one.
`environment.ts`/`environment.prod.ts`'s `turnstileSiteKey` (the public half of the pair, safe to
commit) is a real Cloudflare Turnstile widget's site key, shared by dev and prod the same way they
already share one Supabase project. The matching *secret* key is pasted into Supabase's own Auth >
Attack Protection dashboard setting (hosted-project-dashboard-only — neither half of this pairing is
something a migration or `config.toml` can configure for the hosted project) with captcha protection
turned on, so this is fully live: verified directly against the Auth API (`/auth/v1/token?grant_type=
password`) — no token at all fails closed with `captcha_failed: no captcha_token found`, and a
syntactically-present-but-fake token fails with `invalid-input-response` (Cloudflare correctly
evaluating and rejecting it, as opposed to `invalid-input-secret`, which is what a misconfigured
secret on Supabase's side looks like instead — worth knowing as the diagnostic signal if this ever
needs re-checking).

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

A brand-new organization's Home page otherwise showed nothing but an empty card grid — nothing
telling its founding admin what to actually do first. `HomeComponent` now also loads a "Getting
started" checklist (three steps: add an inventory item, invite the team, create a task, each with
its own count query and a "Go" link to the page that does it) above that grid, admin/manager-only
(`authService.canManage()` — the same audience every one of the three steps' destination pages
already requires; a plain staff member can't act on any of them, so `loadGettingStarted()` skips the
whole thing entirely rather than showing an all-actionless list) and hidden once every step is done
or this viewer has dismissed it. Team size is "any other approved-or-pending profile in the org"
(`profiles` count excluding the caller's own id, via `authService.getSession()` directly rather than
the `profile` signal, same signal-timing caveat this file's own `AuthService.session` note already
covers elsewhere) rather than "approved only" — someone having joined via the invite link and simply
awaiting approval is itself real progress on "invite your team," not nothing. `gettingStartedReady`
gates the whole card's first render so a fully-set-up org's Home page doesn't flash the checklist
into view for a moment before its real (all-done) counts arrive and hide it again. Dismissal
(`dismissGettingStarted()`) is deliberately `localStorage`, not a `site_settings` column, even though
every other org-wide toggle in this app is the latter — `site_settings`'s UPDATE policy is admin-only
(see the Bulk edit/Workflow paragraphs above), so a manager could see and complete these steps but
couldn't persist dismissing the card for everyone; keying it to the browser instead (per organization
id, defensively — this app has no notion of one profile belonging to more than one org to actually
collide on) means anyone who can see the card can also dismiss it, at the acceptable cost of a
different teammate or device seeing it again until they do too.

Below the nav-card grid, `HomeComponent` also shows a small personal "what's on your plate" section
— three list cards (tasks outstanding, items checked out to you, your own upcoming reservations) —
for every signed-in user regardless of role, unlike the admin/manager-only getting-started card
above: everyone can have tasks assigned to them, something checked out, or a reservation they
placed themselves (see `manage/reservations`' own staff-visibility widening elsewhere in this
file). Each list is scoped to the signed-in user specifically (`assigned_to`/`checked_out_to`/
`reserved_by` = `auth.uid()`, via three parallel row queries in `loadPersonalStats()`), not
org-wide like `restockCount`/`pendingManageCount` above — different data than those, not just a
different count. Each card lists up to 4 entries (task title + due date, item name, or a
reservation's item/quantity/reserved-for/date-range — everything `manage/reservations`' own list
shows for a row, minus the actor/audit fields, since this is a glance not a management view) with a
"+N more" link to the full page once there are more; every entry itself links out to where it can
actually be acted on — a task deep-links to `/tasks?task=<id>` (the same `TasksComponent` deep link
`TaskDetailModalComponent`'s own "Copy link" button already produces), a checked-out item and a
reservation both deep-link to `/inventory?item=<id>` (a reservation's own item, specifically — its
row itself has no per-reservation deep link anywhere in the app, but the item's detail popup
already shows a read-only "Upcoming reservations" summary, which is the more useful landing spot
than the reservation itself). The reservation list resolves each entry's item name with a second,
small `inventory_items` lookup keyed by the distinct item ids on the fetched reservations — a plain
client-side id->name map, same convention as `inventory-item-orders.ts`'s own `itemNamesById`,
rather than a PostgREST embedded-resource select. Skipped outright for a signed-out session, same
as `loadGettingStarted()`'s own guard. `.home-grid`'s card order is Inventory, Tasks, Account, then
Manage last (admin/manager-only, so it's the one card that can be absent) — Manage used to sit
third, but as the "administer everything" destination it reads better as the final, most-privileged
stop rather than interrupting the everyday Inventory/Tasks/Account row.

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
selection/save-button/error/saved-flag pattern the Data tab's other settings already use. The
active tab is reflected in the URL as `?tab=` (`setViewMode()`, reading the initial value back out
of `ActivatedRoute`'s snapshot once in `ngOnInit()` — same "read once, this component is the only
thing that ever changes it" reasoning `InventoryComponent`'s own `?item=` deep-link handling
already uses) so refreshing, bookmarking, or sharing a link lands back on the same tab rather than
always the Data tab default; `replaceUrl: true` keeps switching tabs from spamming browser history
with an entry per click. The same `setViewMode()`/`?tab=` shape is reused verbatim by every other
page in the app with this same "pill-style `mat-button-toggle-group` switching between a handful of
top-level page sections" shape — `ManageTasksComponent` (`?tab=create|all`) and
`ManageInventoryComponent` (`?tab=create|retirements`), see their own `viewMode` fields elsewhere in
this file — but
deliberately *not* `InventoryComponent`'s card/table toggle (that changes how the same data
renders, not which content is showing) or `ManageOrdersComponent`'s status filter/`AccountComponent`'s
theme toggle (filters and preferences, not navigable page sections). On `ManageTasksComponent`
specifically, the page's existing `?task=<id>` deep link (opens a specific task's detail dialog,
landed on directly or via `TasksComponent`'s own fallback for a task outside that viewer's personal
list) is read *after* `?tab=` and wins if both are present, since a deep-linked task always lives on
"All tasks" regardless of what `?tab=` says. Every
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

An admin can also restrict who's allowed to change an item's *price or supplier* specifically —
Settings > Workflow's "Price & supplier edits" section (a third section alongside Retirement
approval/Bulk edit in that same card), a `site_settings.restrict_price_supplier_edits` toggle
(default `false`, preserving every existing org's today-any-authenticated-user-can-edit-anything
behavior). Unlike `is_locked` above — a single boolean the RLS `with check` clause can test
directly — this needs an *old-vs-new value comparison* ("did price/supplier actually change,"
not just "what's the new value"), which a plain RLS policy expression can't do without a fragile
self-referencing subquery, so this is enforced by a `before update` trigger on `inventory_items`
(`enforce_price_supplier_edit_restriction()`) instead: admin/manager writes always pass; a
staff write only passes if `price_per_unit`/`price_per_container`/`supplier_id` are unchanged
from their stored values. `price_per_unit`/`price_per_container`/`supplier_id` stay in the
existing any-authenticated-user column grant either way — this toggle changes whether a write
is *allowed to go through*, not who's granted to *attempt* it. `ModalTableComponent` mirrors the
same check client-side (`canEditPriceSupplier`, disabling those three controls and showing a
"Manager/admin only" `mat-hint` for a restricted staff member during edit) purely as a UX
nicety — getRawValue() still round-trips a disabled control's unchanged value at save time, so
disabling can't accidentally null out an existing price/supplier, and the trigger is what
actually protects the columns regardless of what the client renders.

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
On the Inventory page and Manage > Tasks' "All tasks" list, bulk selection sits behind its own
`bulkEditEnabled` toggle (a `mat-slide-toggle`, off by default) — the toolbar and every row/card's
checkbox only render once it's on, so ordinary browsing isn't cluttered with a control most visits
never use; turning it off clears whatever was selected rather than leaving a stale selection sitting
around unseen (`toggleBulkEdit()`, the same shape on both pages). The toggle's own placement differs
per page: on the Inventory page it's in its own row above the search bar, right-aligned via
`.bulk-edit-toggle-row`; on `ManageTasksComponent` it instead sits inline with the Create task/All
tasks `mat-button-toggle-group` itself, in a shared `.tasks-header-row` (`justify-content:
space-between`, the toggle group on the left and — only while `viewMode === 'all'`, via its own `@if`
— Bulk edit on the right) rather than a row of its own, since this page already has a tab strip at
the top for the toggle to sit beside. That right-hand side (Select all + Bulk edit — see below) is
its own `.bulk-edit-controls` wrapper rather than two direct children of `.tasks-header-row`, since
`space-between` on three direct children spreads all three evenly across the row instead of treating
"tabs" and "everything else" as two sides — without the wrapper, Select all ends up stranded in the
middle rather than glued to the toggle beside it. Table view's checkbox is a leading `matColumnDef="select"`
column (present in `tableColumns` only while the toggle is on); card view's sits absolutely
positioned in the bottom-right corner of the whole card (not the image — that corner's already
claimed by `.quantity-badge`, which is confined to the image area above it); `ManageTasksComponent`'s
own `.task-row` (a manual CSS grid, not a `mat-table`) instead gets a `.bulk-edit-active` class bound
alongside `bulkEditEnabled` that swaps in a leading `2rem` grid column for the checkbox — without it,
the row would either reserve that column's space with nothing in it while off, or the checkbox would
have nowhere to sit once on. `.bulk-edit-toggle-row`/`.tasks-header-row` also hold a compact "Select
all" `mat-checkbox` immediately to the left of the `mat-slide-toggle`, on both the Inventory page and
`ManageTasksComponent`'s "All tasks" list (same row, shown only while the toggle is on), sized down
from Material's default via `--mat-checkbox-touch-target-display: none` (shrinking the oversized
invisible touch target, the same token `.option-list` already used elsewhere in this file rather than
reaching into MDC's internal DOM) plus a smaller font-size — it's meant as a quick header-row
affordance, not a focal control. It reads/drives the same state `BulkActionToolbarComponent`'s own
built-in checkbox would — `allSelectableItemsSelected`/`someSelectableItemsSelected` on Inventory,
`allVisibleTasksSelected`/`someVisibleTasksSelected` on `ManageTasksComponent` (same shape, just
without a lock-style "can this row even be selected" filter, since tasks have no such concept — every
filtered task is fair game) — so having both visible at once would be a redundant second "select all"
control for the same selection. `BulkActionToolbarComponent` takes a `hideSelectAllCheckbox` input
(set `true` from both Inventory's and `ManageTasksComponent`'s usage) that suppresses its own checkbox
entirely: nothing renders until something's selected, at which point it shows plain "N selected" text
in the checkbox's place instead (the actions row/content-projected buttons still appear as normal).
`ManageTeamComponent`'s pending-join-requests list is the one exception — it has no Bulk edit toggle
to sit next to at all (bulk actions are always available there), so it leaves this input false and
keeps the toolbar's original built-in checkbox. `ManageTasksComponent`'s
`.task-filters` row (search plus the assignee/status/due-date fields) spans the full width of the
page rather than stopping partway across on a wide viewport — the three filter fields keep a fixed,
non-growing `flex: 0 1 14rem` (capped at `max-width: 16rem`) while only the search field
(`.task-search-field`) grows (`flex: 1 1 20rem`, no `max-width`), so it alone absorbs whatever width
the filters don't need rather than every field stopping at the same point and leaving space unused to
the right; the override needs the extra `.task-filters` scoping in its own selector
(`.task-filters .task-search-field`, not just `.task-search-field` alone) purely to out-rank the
generic `.task-filters mat-form-field` rule by CSS specificity — a bare single-class selector actually
has *lower* specificity than a class+type descendant selector and silently loses to it otherwise.
The feature itself (not just this session's own toggle state) can be turned off org-wide from
Settings > Workflow's "Bulk edit" section — a second `.settings-section` alongside
`require_retirement_approval` in that same card, following its exact pattern (`site_settings.
bulk_edit_enabled`, default `true`, local-selection/save-button/error pattern). When off,
`InventoryComponent` hides the "Bulk edit" toggle control entirely (`@if (siteSettings.
bulkEditFeatureEnabled())`), same "hidden, not disabled" treatment `BARCODE_FEATURE_ENABLED` already
established — distinct from (and named to avoid confusion with) `InventoryComponent.bulkEditEnabled`,
which is just this visit's own on/off state of the feature, not whether it exists for the org at all.
This org-wide flag currently only gates `InventoryComponent`'s toggle — `ManageTasksComponent`'s own
`bulkEditEnabled` toggle (added after the fact, once Inventory's had already proven the pattern) isn't
wired to it, so an org that disables bulk edit there still keeps it on Manage > Tasks; folding Manage
> Tasks (and Manage > Team's still-always-on pending-requests bulk actions) under the same site-wide
switch would be a natural, but so far undone, follow-up.
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

Every approved org member (not just admin/manager — see below) gets a `manage/reservations` route
(`ManageReservationsComponent`, `approvedGuard`) — date-ranged bookings of an item's stock (e.g.
"50 of our 100 chairs for the Smith wedding, June 1–3"), for the event/rental use case this app's
own seed data represents. A reservation books a
*quantity*, not the whole item, and is fully separate from `is_checked_out`/`checked_out_to` — that
flag still means "someone has this in hand right now"; a reservation means "this is spoken for on
these dates," with no automatic interaction between the two. Same overall shape as `manage/orders`
(a "New reservation" button opening `PlaceReservationModalComponent`, an item-autocomplete picker,
then a running org-wide list with status-driven row actions), but every item is reservable (no
supplier prerequisite the way an order needs), and creation itself — unlike an order's direct
admin/manager `INSERT` — goes through a `SECURITY DEFINER` RPC too, because it needs a *capacity*
check (is there enough stock left unreserved across the requested date range?) that a plain RLS
`with check` can't express: `create_reservation()` sums the `quantity` of every other
`reserved`/`picked_up` row whose date range overlaps (`daterange(...) && daterange(...)`) and
rejects if the new quantity would exceed what's left. `PlaceReservationModalComponent` shows a live
"N available for these dates" hint computed the same way client-side against reservations already
loaded by the page that opened it — a UX preview only, since the RPC stays the actual source of
truth on submit. Lifecycle is linear with one branch: `reserved` → `picked_up` → `returned`, or
`reserved` → `cancelled` (only before pickup — once picked up, the only forward state is
`returned`), each transition its own RPC
(`mark_reservation_picked_up()`/`mark_reservation_returned()`/`cancel_reservation()`), all logging
to both `inventory_item_activity` and `activity_log` (`entity_type` `'inventory_item'`, reused
rather than adding a new entity type, same as how `receive_inventory_item_order()` already logs
order events under that type). Unlike Orders — which dropped per-item visibility entirely once
`manage/orders` existed — `ModalTableComponent` also shows a small **read-only** "Upcoming
reservations" summary for its own item (`loadUpcomingReservationsForItem()`, self-loaded in
`ngOnInit()` the same way this component already self-loads other supplementary data rather than
threading it through `InventoryItem`/`toInventoryItem()`) — knowing an item is already booked is
genuinely relevant context while deciding whether to check it out right now, which is why this one
case differs from Orders' own precedent.

Reservations started admin/manager-only (matching Orders' own trust level) but was widened to every
approved org member — staff can place, cancel, and action reservations too, the same trust level
item edits/discards already have. Unlike Orders, though, staff only ever see and act on their *own*
reservations; admin/manager alone still see the whole org's. This is enforced at the RLS/RPC layer,
not just the UI: `inventory_item_reservations`' SELECT policy now ANDs
`current_user_role() in ('admin', 'manager') or reserved_by = auth.uid()` into the existing org-scope
check, and `mark_reservation_picked_up()`/`mark_reservation_returned()`/`cancel_reservation()` each
gained the same `reserved_by is distinct from auth.uid()` check alongside the admin/manager role
check they already had (`is distinct from`, not `!=` — `reserved_by` can be null if that profile was
later removed, and `uuid != null` evaluates to NULL rather than true/false in PL/pgSQL, silently
skipping the check, the exact failure class `fix_org_isolation_bugs` already had to correct
elsewhere in this schema). `create_reservation()`'s own capacity check is unaffected by any of this
— it runs as `SECURITY DEFINER`, which already bypasses RLS, so it always sums *every* org member's
overlapping reservations regardless of who's calling; a staff member's booking is still correctly
blocked by someone else's overlapping one even though they can't see that other reservation in their
own list. `ModalTableComponent`'s "Upcoming reservations" item-popup summary is deliberately exempt
from this restriction — it's meant to answer "is this item already spoken for by anyone," not just
"by me," so `loadUpcomingReservationsForItem()` reads through a separate
`get_item_upcoming_reservations()` RPC (added a migration later,
`20260905120000_add_item_upcoming_reservations_rpc.sql`, once the first pass at this feature had
narrowed that summary along with everything else) — `SECURITY DEFINER`, scoped by `item_id` rather
than `reserved_by`, so it bypasses the SELECT policy's per-user restriction the same way every other
RPC in this schema already bypasses RLS for its own controlled purpose. `manage/reservations`' own
org-wide list is unaffected and still goes through the plain, now-scoped SELECT policy directly.
`ManageReservationsComponent`'s route drops
`breadcrumbParent`/`manageGuard` (unlike every other `manage/*` route) since linking a non-admin/
manager viewer's breadcrumb to `/manage` would just bounce them back out via that guard; its own
page subtitle is the one thing in the component itself that's role-conditional, purely to explain
to a staff viewer why their list is shorter than an admin/manager's — every actual access check
still lives in the database, not this `@if`.

`DiscardModalComponent`'s quantity field also has a "Discard all (N)" / "Discard a specific
quantity" mode toggle (`mode: 'all' | 'partial'`, defaulting to `'all'`) — a restoration of the
original (pre-container-tracking) `DiscardInventoryModalComponent`'s own radio-group UX, which the
unified container-aware rebuild had dropped down to typing the full quantity by hand every time.
`'all'` resolves against `maxQuantity` (already reactive to whichever box is picked for a
container-tracked item, or the item's flat `quantityRemaining` otherwise) — no schema/RPC changes,
this is purely a `DiscardModalComponent` UI change.

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

Every user-controlled string that lands in one of these emails (a task title, an inventory item's
name, a signup's `full_name`/`nickname`/`email` on the join-request kind — that last one reachable by
a completely unauthenticated visitor via the public signup form, before any approval step) is run
through `escapeHtml()` before being interpolated into `emailShell()`'s HTML body — caught in a
`/security-review` pass: none of these were escaped originally, so naming a task/item, or just
signing up with a crafted display name, could inject arbitrary markup (e.g. a spoofed CTA link) into
an email a real admin/manager receives, a phishing vector. `ctaHref`/`ctaLabel`/`heading` never need
it — every call site passes those as hardcoded string literals, never a record field.

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

Admins and managers get a `manage/reports` route (`ManageReportsComponent`, `manageGuard`) — three
cards (not tabs; these are meant to be scanned together, unlike Settings' genuinely separate
per-section save flows), each an all-time snapshot with no date-range picker yet. "Inventory value &
stock health" (the org's overall stock *position* — total $ value, `quantity_remaining` × an
effective per-unit price, preferring `price_per_unit` but falling back to `price_per_container /
quantity_per_container` for an item only ever priced "by the case" — plus active item/low-stock/
out-of-stock counts, and value broken down by category and by physical location) sits alone on the
left; "Stock movement & loss" (total units/events discarded, top reasons and discards-by-category
from `inventory_item_discards` — see the Discard flow's own paragraph above, and the multi-select
reasons paragraph just below — plus retirement rate by category from `inventory_items.status`) and
"Task throughput" (completion rate, overdue count, average
days-to-close, and workload by assignee, all from `tasks`) are both more "what's been *happening*"
than "where things stand," so they stack together on the right (`.reports-columns` /
`.reports-column-secondary`) rather than reading as three equally-weighted cards in a row. Every stat
is derived client-side from three plain queries
(`inventory_items`/`inventory_item_discards`/`tasks`, correlated by id the same way this app's other
multi-entity pages already do — see e.g. `ManageInventoryComponent`'s own images/activity maps)
rather than a bespoke RPC per number; this app has no precedent for server-side-aggregated reporting,
and the org sizes this schema realistically holds today make a client-side reduce cheap enough not to
need one. Average days-to-close reads `tasks.updated_at` as a proxy for "when this was marked done" —
accurate for a plain assignee (who can only ever change `status` via `update_task_status()`) and only
approximate for an admin/manager who edited a done task's other fields afterward, since that also
bumps `updated_at`. Every breakdown list (category, location, reason) shares one `BreakdownRow` shape
(`label`/`primary`/`itemCount`) so a single `barWidth()` method can scale every list's own
`.bar-fill` width (a plain `<span>` pair, `.bar-track`/`.bar-fill`, replacing an original
`mat-progress-bar` per row — see below) relative to that list's own largest value.

The page's charts were later upgraded from those flat progress-bar-style rows to two small
hand-rolled SVG components — `shared/components/donut-chart` and `shared/components/ring-stat` —
rather than adding a charting library dependency: this app has no existing charting dependency, a
handful of slices/one gauge doesn't need one, and an earlier attempt at richer visuals elsewhere in
the app (a three.js treatment, since reverted) already established that a new runtime dependency is
the wrong tradeoff for this codebase's size. Both are drawn with the standard "stroked circle with a
partial `stroke-dasharray`" SVG technique — a radius of `15.9155` makes a circle's circumference
exactly 100, so percentage values map 1:1 to arc length — rather than computing real `<path>` arc
commands, and both pull their slice/fill colors from the live theme's own CSS custom properties
(`--mat-sys-primary` etc., cycling through a fixed token list for however many slices a chart has)
so a chart drawn under a different color preset (see `THEME_PRESETS` above) recolors itself
automatically, the same "themed, not hardcoded" convention every other visual element in this app
already follows. `DonutChartComponent` takes plain `{label, value}` slices (already sorted/capped by
the caller — it doesn't re-sort or limit its input) plus a caller-formatted `centerLabel`/
`centerSublabel` pair (a string, not a raw number — what the center should actually say varies by
caller), and owns both the ring itself and its legend so every consumer gets identical
palette-cycling and legend layout for free; "Value by category" feeds it via a `valueByCategoryChartData`
getter that caps the chart at the top 5 categories plus one folded-in "Other" slice (a dozen-plus
thin slices reads as noise, not a shape) — the breakdown list right below the chart is unaffected by
that cap and still lists every category with its exact dollar value, since the chart is purely an
at-a-glance view, not the source of truth for what's there. `RingStatComponent` is the same
technique reduced to a single arc against a full track (clamped 0–100, since a completion rate can't
sensibly exceed that) for "Task throughput"'s headline completion-rate stat, which a plain "38%" text
tile read flatter than a gauge that visually fills in proportional to the number. "Workload by
assignee" itself moved off a plain HTML `<table>` onto a stacked horizontal bar per assignee
(`.workload-chart`, `.workload-bar` holding one `.workload-segment` `<span>` per status with a shared
`.workload-legend` above naming the three status colors) — `workloadSegmentWidth()` scales each
segment against the *page-wide* busiest assignee's own total, not 100% of that one row, so a bar's
overall length also reads as "how loaded is this person relative to the rest of the team," not just
the status mix within their own workload alone.

`DiscardModalComponent`'s reason field is a multi-select (`mat-select multiple`) drawing from an
admin-curated list rather than free text, so "Top reasons" above groups on a real controlled
vocabulary instead of however differently two people happened to phrase the same thing in a box —
reuses `inventory_field_options` (a new `'discard_reason'` `field_name`, same admin-curated-list shape
category/physical_location already have, surfaced the same way via `FieldOptionsEditorComponent` on
Settings > Data, alongside them) rather than a dedicated table.
`inventory_item_discards.reason` is now `text[]`, not `text` — a discard can carry more than one
reason at once (e.g. "Water damage" *and* "Wear and tear"), and each selected reason gets full credit
for the whole discarded quantity in the report's grouping rather than the combination becoming its
own distinct bucket (`buildMovementAndLoss()` loops `discard.reason`, crediting every entry). Every
organization that already existed got a starting list seeded on migration (`'Damaged'`, `'Lost or
missing'`, `'Expired'`, `'Wear and tear'`, `'Other'`); `handle_new_user()` seeds the same list for a
newly created org going forward (existing invite-join path is unaffected — only the org-creation
branch needs this) — without either, discarding stock (previously always possible via free text)
would suddenly require an admin to visit Settings and curate a list first, or nobody could discard
anything at all.

`ManageInventoryComponent`'s create form and `ManageTasksComponent`'s create form both now guard
against losing an in-progress, unsaved entry three different ways, all reading from one shared
source of truth per component (`hasUnsavedChanges()` — for inventory, `inventoryForm.dirty` or a
staged photo or a staged container; for tasks, just `taskForm.dirty`, deliberately excluding
`relatedItemSearchControl` since the autocomplete search box isn't itself submitted data). First,
switching to the page's other tab (Requests / All tasks) while the create form is dirty no longer
switches immediately — `setViewMode()` was split into itself (now a guard) plus a private
`applyViewMode()` that does the actual switch, mirroring `ManageTasksComponent.applyBulkDelete()`/
`performBulkDelete()`'s existing "public method opens a confirm dialog and subscribes, private
method does the work" split, so the actual switch stays directly unit-testable without faking
`MatDialog.open()`. Second, navigating away from the route entirely (clicking a nav link, back
button, etc.) is covered by `unsavedChangesGuard` (`core/guards/unsaved-changes.guard.ts`), a
`CanDeactivateFn` wired onto both `manage/inventory` and `manage/tasks` in the route config — it
calls the same `hasUnsavedChanges()` via a new `HasUnsavedChanges` interface both components
implement, and only opens `ConfirmDialogComponent` (wrapped in a plain `Promise<boolean>`, not an
RxJS `.pipe(map(...))`, matching this app's established no-RxJS-operators convention) when there's
actually something to lose. Third, closing or refreshing the browser tab itself — which
`CanDeactivate` guards never fire for — is covered separately by a `@HostListener('window:
beforeunload', ...)` (`confirmBeforeUnload()`) on each component, calling `event.preventDefault()`
+ setting `event.returnValue` to trigger the browser's own native (non-customizable in any modern
browser) "leave site?" prompt. All three layers share the one `hasUnsavedChanges()` check per
component rather than duplicating the dirty-state logic three ways.

`ManageInventoryComponent`'s Requests tab (pending retirement requests) now supports bulk
approve/decline, the extension CLAUDE.md's own bulk-edit documentation had explicitly flagged as
"out of scope for this pass, a natural future extension of the same shared toolbar" when
Inventory/Manage Tasks/Manage Team's bulk actions first shipped. Reuses `BulkActionToolbarComponent`
the same way `ManageTeamComponent`'s pending-join-requests list already does — no separate Bulk
edit toggle to turn this on/off first (bulk actions are just always available here, same as that
list), a plain `selectedRetirementItemIds: Set<string>` (no search/filter on this tab to intersect
against), and a leading `mat-checkbox` per row. No RPC accepts an array of ids, so both bulk actions
loop the existing single-item `approve_item_retirement`/`decline_item_retirement` RPCs client-side
(`Promise.all`) and tally per-item success/failure, same "no all-or-nothing assumption, success
toast plus an inline error count on partial failure" shape every other bulk action in this app
already follows. Bulk approve is confirmed first via `ConfirmDialogComponent` (`danger: true`,
naming the selected count) — mirroring the single-item `approveRetirement()`'s own confirm, since
retiring is irreversible; bulk decline has no confirm dialog, mirroring the single-item
`declineRetirement()`'s own lack of one, since declining just leaves the item active.
`applyBulkApproveRetirement()`/`performBulkApproveRetirement()` split the same "public method opens
the dialog, private method does the work" way `ManageTeamComponent`'s own
`applyBulkDeny()`/`performBulkDeny()` pair already does, so the actual approve logic stays directly
testable without faking `MatDialog.open()`.

A bell icon in `HeaderComponent` gives every authenticated user an in-app notification center — a
persistent, browsable record of the same four events `send-notification-email` already emails
about (see that Edge Function's own section above): a task directly assigned to you, a task
transfer offered to you, an inventory item's retirement request needing admin/manager approval, and
a new member's join request needing admin approval. Backed by a new `notifications` table
(`add_notifications` migration — `organization_id`, `user_id`, `kind`, `message`, `link`, `read_at`)
with realtime enabled the same two-part way `inventory_items`/`tasks` already are. Deliberately
**no INSERT policy for `authenticated`/`anon`** — every row is inserted by
`send-notification-email` itself, using the `service_role` key it already holds (see that
function's own doc comment), so recipient resolution (who exactly gets notified — a single
assignee/transfer target, or every admin/manager/admin in the org) stays in exactly one place
rather than being duplicated a second time in PL/pgSQL triggers. That function's four
`emailsForX()` handlers were rewritten as `resultForX()`, each now returning both an `EmailToSend[]`
*and* a `NotificationToInsert[]` from one shared recipient-resolution pass; the notifications insert
is unconditional while the email send stays gated behind Settings > Workflow's existing per-org
"Email notifications" toggles (`isEmailNotificationEnabled()`, renamed from `isNotificationEnabled()`
to make that distinction explicit in the code itself) — those toggles only ever meant "should this
send an email," not "should this happen at all," and an in-app notification costs a viewer nothing
the way an unwanted email does.

`NotificationCenterService` (`core/notification-center.service.ts`, root-provided like
`AuthService`/`SiteSettingsService`) owns the client-side state — a `notifications` signal (newest
30) and a derived `unreadCount`. Reacts purely to `authService.isAuthenticated()` via `effect()` to
load/subscribe or clear/unsubscribe, the same reactive-to-session shape `HeaderComponent`'s own
constructor already uses for its badge counts, rather than `DestroyRef` — this is a root singleton
with no real "destroy" during the app's lifetime, unlike a routed page component. It subscribes to
the `notifications` table via the shared `subscribeToTableChanges()` — the one deliberate exception
to that helper's own "one channel per routed page component" precedent, since a root service needs
to stay subscribed for as long as a session exists, independent of whatever page happens to be
mounted; no client-side `user_id` filter, same "trust RLS alone" reasoning every other subscription
in this app already follows. `markAsRead()`/`markAllAsRead()` update optimistically (local state
first, persisted write after) — `notifications.read_at` is the one column granted to
`authenticated` at all (RLS-scoped to `user_id = auth.uid()`, same narrow self-service shape
`profiles.last_active_at` already has).

The bell itself lives in `.header-actions`, badged with `unreadCount()`, opening a small fixed-
position top-right dropdown (`.notifications-panel`) — **own panel, not `MatMenu`**, the same
"width could overflow a narrow viewport" reasoning `HeaderComponent`'s nav drawer (see its own
paragraph below) already gives for the identical choice, just sized as a short dropdown rather than
a full-height drawer. It's positioned independently of its own trigger (a top-level, always-in-DOM
sibling, same "transform/opacity-toggled via a signal, not `@if`, so both open and close animate"
technique the nav drawer already established) rather than anchored to it. Clicking a notification
row (`onNotificationRowClick()`) marks it read and closes the panel; navigation itself is a plain
`[routerLink]` on the row so ctrl/cmd-click still opens a new tab normally.

`HeaderComponent`'s navigation is a classic hamburger + slide-out drawer at every screen width, not
just a narrow-viewport fallback for a row of links (which is what it originally was, before this
rework). The top bar itself only ever shows the brand/logo and, on the right, two persistent icon
buttons: the notification bell above and the hamburger (`.nav-menu-trigger`, opening `.nav-drawer`).
Every actual nav link, plus theme toggle/Help/Account/Logout, lives only in the drawer now — the
bell is the one deliberate exception, kept as an always-visible top-bar icon since its own panel is
unrelated to navigation and a glanceable unread count shouldn't be buried a click deeper. `.nav-drawer`
follows the same "own fixed-position panel, not `MatMenu`" reasoning as the notifications panel above
(a menu sized to its content could overflow a narrow viewport into horizontal scroll; this is pinned
to the right edge and width-capped at `min(80vw, 20rem)` instead), and reuses the same always-in-DOM/
`[attr.inert]`-when-closed technique so both open and close get the slide transition.

Five of this app's highest-traffic data-fetch paths — `InventoryComponent`, `TasksComponent`,
`ManageInventoryComponent`'s Requests tab, `ManageTasksComponent`'s "All tasks" tab, and
`ManageTeamComponent`'s "Current team" section — now surface a failed initial load instead of
silently falling through to an empty-list state. Every one of these previously destructured only
`{ data }` off its Supabase query and ignored `error` entirely, so a genuine fetch failure (a dropped
connection, an RLS misconfiguration, etc.) rendered exactly the same as "this org just has nothing
here yet" — a misleading, hard-to-diagnose dead end for a user who'd have no way to tell "empty" from
"broken." Each of the five gets a `loadError: string | null` field (set from the query's own
`error.message`, cleared on success) checked *before* that page's existing `isLoading`/empty-list
branches, and a `retryLoad()` method (a thin public wrapper around the existing private load method)
wired to a Retry button. `EmptyStateComponent` — already this app's shared icon+message(+projected-
action) treatment for "nothing here" — gained a `variant: 'neutral' | 'error'` input rather than a
second, near-identical component; `'error'` swaps the icon/text to `--app-error-text` (the same token
`.error-message` already uses) so a load failure reads as a problem, not as an ordinary empty state,
with a projected "Retry" button (icon `refresh`) standing in for `'neutral'`'s usual "Clear filters"
in that same content-projection slot. For the three pages whose load method also gets called for a
background refresh after a local mutation (approving a retirement, a realtime-triggered reload,
etc.) — `ManageInventoryComponent`/`ManageTasksComponent`/`ManageTeamComponent` — a failed *background*
refresh leaves the already-loaded list in place rather than clearing it out from under the user;
`loadError` still gets set, so the very next render still shows the retry state instead of stale data
silently going unrefreshed forever, but the user doesn't lose what they were already looking at
mid-session. This pass deliberately covers the five highest-value pages rather than every
`.select()` call in the app; other pages' load paths remain a natural future extension of the same
`loadError`/`retryLoad()`/`variant="error"` shape.

A first motion-polish pass touches three things app-wide/on the two highest-traffic pages. Route
changes now get a brief fade+rise (`router-outlet + *` in `src/styles.scss`, deliberately global
rather than component-scoped — Angular's emulated view encapsulation appends a per-component
attribute hash to every compound selector segment, including plain element selectors, but the
routed component landing as `router-outlet`'s sibling carries its *own* component's hash, never
`AppComponent`'s, so a scoped version of this rule would silently never match; global CSS has no
such hash to fail against). Inventory and Tasks — the two busiest pages — replace their bare
`mat-spinner` loading state with shape-matching shimmer placeholders instead
(`shared/styles/_skeleton.scss`'s `.skeleton-line`/`-block`/`-circle`, composed into a card-grid or
`.task-row`-shaped skeleton by each page's own loading-state template) — a placeholder that already
hints at the real layout reads as "almost there" in a way a generic spinner doesn't. Once real data
lands, both pages also cascade their cards/rows in one after another
(`shared/styles/_stagger.scss`'s `.cascade-in`, delay bound per-item via
`[style.animation-delay.ms]="staggerDelay(i)"` — the same inline-style-from-`$index` technique
`LandingComponent`'s own `.reveal` cards already use for their scroll-triggered stagger, just
driving a CSS `animation` instead of a `transition` since this needs to autoplay on data arrival
rather than wait on an `IntersectionObserver`) — capped at a per-page `Math.min(index, 8) * 40`ms
so paging through a full grid doesn't leave the last couple items waiting on a delay that reads as
sluggish rather than deliberate. Tasks' own "Completed" section is deliberately left out of the
cascade — those are already-done items, and animating them in draws attention away from the two
sections above it a visitor actually needs to act on. All three respect
`prefers-reduced-motion` the same way every other animation in this app already does. This is a
first pass on the two busiest pages, not an app-wide sweep — every other page's own bare
`mat-spinner` loading state remains a natural future extension of the same skeleton shape.

A shared `HelpTooltipComponent` (`shared/components/help-tooltip`) — a small keyboard-focusable "?"
icon button wired to `matTooltip` (this app's existing tooltip mechanism, already used by
`HeaderComponent`'s bell/mode-toggle buttons) rather than a hand-rolled popover — gives a handful of
genuinely non-obvious controls an inline explanation without permanently occupying page space the
way a `<p class="section-hint">` does. Deliberately narrow: only added where nothing nearby already
explains the control (Settings > Workflow's toggles already have their own full-sentence
`.section-hint` paragraphs and don't get one) — `ManageInventoryComponent`'s create-form "Single
quantity" vs "By container/box" tracking-mode toggle, `DiscardModalComponent`'s title (discarding is
permanent and distinct from checkout/retirement), `PlaceReservationModalComponent`'s title
(a reservation books stock for a date range without touching `is_checked_out`/`checked_out_to`), and
`ManageOrdersComponent`'s "Orders" heading (marking an order received auto-restocks a flat-tracked
item but not a container-tracked one — see that page's own paragraph above). Not applied
exhaustively across every dialog/toggle in the app; a natural extension of the same component to
whatever the next confusing control turns out to be.

A `/help` route (`HelpComponent`, `approvedGuard`) is a static in-app "how do I..." reference,
distinct from `/privacy`/`/terms` in the same way `/pricing` is distinct from *those* — this is about
*using the product* once signed in, so it lives inside the normal authenticated shell (header/footer
chrome) like Account/Tasks rather than alongside the unguarded legal pages (which get their own
top-bar layout precisely because a signed-out visitor can land on them), and uses the same container
width every other page does (no narrower reading-width override). Content lives in
`HELP_FAQ_SECTIONS` (`shared/models/help-faq.ts`) as a plain data array — question, answer, and an
optional list of `{ path, label }` links rendered as plain `routerLink`s below the answer — rather
than inline markup the way `PrivacyComponent`/`TermsComponent`'s own static prose is, specifically so
`HelpComponent.filteredSections` can search it: a `mat-form-field` search box filters every section's
items down to whatever matches the term in either the question *or* the answer text (so e.g.
searching "reservation" also surfaces the order-received question, which only mentions it in
passing), dropping any section left with zero matches entirely; every visible `mat-expansion-panel`
auto-expands while a search is active (`[expanded]="searchTerm.trim().length > 0"`) so a match is
immediately visible without an extra click. `hasNoResults` swaps in `EmptyStateComponent` with a
"Clear search" action once a term matches nothing. Linked from `HeaderComponent`'s nav (both the
desktop `.header-actions` row and the mobile drawer) right next to Account, as a `help_outline`-icon
"Help" link.

The Help page also has a "Send feedback" button (`.page-header-row`, next to the `<h2>`, the same
plain h2-plus-trailing-button shape `ManageInventoryComponent`'s own "Export" button already uses —
not `PageHeaderComponent`'s icon-chip treatment, which is scoped to Manage's sub-pages only) opening
`FeedbackModalComponent` — a feedback type (Bug report/Feature request/General feedback/Other,
`shared/models/feedback.ts`) plus a free-text message, from any signed-in user regardless of role.
Self-contained like `PlaceOrderModalComponent`/`PlaceReservationModalComponent`: it inserts directly
into a new `feedback` table (self-attributed, `organization_id` defaulting to
`current_user_org_id()` same as `activity_log`'s own client inserts) rather than handing a value back
to `HelpComponent` to persist — but unlike those two, there's no `inventory_item_activity`/
`activity_log` write to make alongside it, since feedback isn't tied to an item or task. `feedback`
had no SELECT policy for any role at all when this shipped (a deliberate difference from every other
audit-style table in this schema, e.g. `activity_log`/`inventory_item_discards`) — a candid bug
report or complaint shouldn't be visible to the rest of the org the way team-wide activity is, so
nobody *in that org* reads a submission back; Studio's own Feedback inbox (see that section's own
paragraph below) is a later, narrow, deliberate exception to this — not a reversal of it, see that
paragraph for why. The insert alone is what notifies anyone: `send-notification-email` (see
its own section below) gains a fifth event kind, dispatched from a `notify_on_feedback_submitted`
trigger that reuses `call_notification_webhook()` completely unchanged (that function already posts
`tg_table_name`/the new row generically, so a new table just needed a new trigger, not a new
Postgres-side function) — no `when (...)` clause, unlike that function's other four triggers, since
every insert here is worth emailing about. The recipient is a single fixed, out-of-band address
(`chris@studiorioconsulting.com`, hardcoded in the Edge Function next to `APP_URL`/`FROM_ADDRESS` —
this is the app's own maintainer, not an org member, so none of it is resolved from `profiles` the
way every other kind's recipient is) and the subject line is standardized to always the same shape —
`"New feedback: <type label> — <org name> (<person name>)"` — so submissions stay easy to scan/
search/filter in an inbox regardless of what the message itself says; the body repeats the same
type/person/org line above the message text. Deliberately **not** gated behind Settings > Workflow's
per-org "Email notifications" toggles the way the other four kinds are (`isEmailNotificationEnabled()`
is skipped entirely for this one) — those toggles are for an org choosing whether *its own members*
get emailed about *their own org's* events, which doesn't apply to a fixed recipient outside every
org. Also skips the `notifications` table insert every other kind gets, for the same reason: nobody
in the app is the "recipient" of feedback the way a task assignee or approving admin is.

A `/studio` route (`StudioComponent`, guarded by a new `platformAdminGuard` — stricter than every
existing guard, including `adminGuard`: it checks `profiles.is_platform_admin`, not `role`) is a
genuinely new concept for this schema: every other RLS policy and every `manage/*` route scopes
strictly to the caller's own `organization_id`, but Studio is for the app's own maintainer, not any
org's own admin — an org's `role = 'admin'` grants nothing here, and `is_platform_admin` grants
nothing in `manage/*`. The two are deliberately orthogonal, not a hierarchy (Studio isn't "super
admin" sitting above org admin — it's a different, cross-org audience entirely). Same card-hub shape
as `ManageComponent` (`.studio-card`/`.studio-card-icon`, deliberately not shared CSS — see that
component's own precedent of duplicating this shape per-page rather than factoring it out), three
cards: **Feedback** (`StudioFeedbackComponent`) is the cross-org counterpart to the Help page's
"Send feedback" button above — every organization's submissions in one searchable/filterable list,
readable at all only because of a new "Platform admins can view all feedback" SELECT policy (an
*additional* permissive policy, not a replacement — RLS policies on the same table OR together, so
`feedback`'s own org-scoped-to-nobody default is untouched for every other role). A review workflow
(`status`: new/reviewed/resolved, plus `reviewed_by`/`reviewed_at`) was added alongside this
(`add_feedback_status` migration) since the table had none before — marking a row reviewed/resolved
writes directly via `.update()` (no RPC needed: a column-scoped grant on just those three columns,
same shape `add_inventory_item_retirement` established for `inventory_items`, plus the same
`is_platform_admin()`-gated RLS policy) rather than reloading the whole list, the same "mutate the
bound row object in place" convention `InventoryComponent`'s own edit flow already uses. **Error
Log** (`StudioErrorLogComponent`) is a near-identical fork of `manage/error-log` — same dev-error
toggle, client-side pagination, and profile-name resolution — with the one real difference being no
`organization_id` filter (again, an additional cross-org SELECT policy alongside
`client_error_log`'s existing org-scoped one) and each row additionally showing which org it came
from, so the same bug hitting several customers shows up as several rows here instead of needing to
check each org's own error log separately. **Organizations** (`StudioOrganizationsComponent`) is a
plain table (same shape `ManageSuppliersComponent`'s own `<table>` already establishes, not a
`mat-table`) of every org — name, created date, member count, last-active date, active/deleted
status — needing no new policy on `organizations` itself (its own SELECT policy was already
`using (true)` for any authenticated user from `create_organizations.sql`), just a new cross-org
SELECT policy on `profiles` to compute member count/last-active from, reduced client-side into one
`Map` keyed by org id rather than a query per org. `AuthService.isPlatformAdmin` (alongside
`canManage`, same `computed()` shape) backs both `platformAdminGuard` and two small pieces of nav
discoverability visible only to that one account: a "Studio" link in `HeaderComponent`'s nav drawer
(right where the `canManage()`-gated "Manage" link already sits) and a fifth card on
`HomeComponent`'s `.home-grid`, after Manage. `is_platform_admin` itself is never writable through
the app at all (not even an RPC) — set once, manually, directly against the hosted project, same
"real sensitive one-off value, never in a migration file" convention this app's Vault secrets and
hosted-org reseed already follow.

A shared `PageIntroComponent` (`shared/components/page-intro`) gives Inventory, Tasks, and the
Manage hub a one-time, dismissible orientation banner for a user (any role) who might be landing on
that page for the first time — a short "here's what this page is" hint, distinct from
`HomeComponent`'s own "Getting started" checklist (an org-wide, admin/manager-only setup task list
gated on real data, not a purely-cosmetic hint any role gets). Dismissal is `localStorage`, same
best-effort try/catch shape `HomeComponent.dismissGettingStarted()` already established, but keyed
per *user* (`shelf-sync:page-intro-dismissed:<userId>:<pageKey>`) rather than per organization —
this is about whether *this specific person* has already seen this page's orientation, so one
teammate dismissing their own hint shouldn't hide it from someone else's first visit the way sharing
the getting-started card's own org-wide progress legitimately should.

Admins and managers get a `manage/release-notes` route (`ManageReleaseNotesComponent`, `manageGuard`)
— a "What's new" list of shipped features (`CHANGELOG_ENTRIES` in `shared/models/changelog.ts`), a
hand-maintained, newest-first array kept alongside CLAUDE.md's own running log, each entry's `date`
matching when it actually shipped. This used to be a section on the Help page itself; it's now its
own page, reachable only via a card on the Manage hub — admin/manager-only for now, since the Manage
hub is the only place it's linked from (a natural future extension is surfacing it to every role once
it has a home outside that hub). `shared/utils/changelog.ts` builds an unseen-count badge on top of
the list (`getUnseenChangelogCount()`/`markChangelogSeen()`, both `localStorage`-backed and per-user
like `PageIntroComponent`'s own dismissal, not per-organization) — the very first time this is ever
checked for a user with no stored value at all, it bootstraps them as caught-up-as-of-now rather than
surfacing every entry that ever shipped before they first looked, the same way a freshly-connected
email inbox doesn't retroactively mark years of old mail unread. `ManageComponent` badges this count
on its own Release Notes card, same treatment its Inventory/Tasks/Team cards already give their own
pending-request counts even though this isn't an approval queue — set directly in `ngOnInit()`
alongside those (synchronous, no Supabase query needed). Visiting `manage/release-notes` is what
actually clears it: `ManageReleaseNotesComponent.ngOnInit()` calls `markChangelogSeen()`, and the
Manage hub's own next load picks that up.

Every user can build their own "Quick menu" from the Account page — an opt-in toggle plus a
checkbox picker (up to `MAX_QUICK_MENU_ITEMS`, currently 5) choosing which destinations appear as
plain icon links centered in `HeaderComponent`'s top bar. Deliberately not a click-to-open dropdown
(an earlier version was exactly that, behind a single `bolt`-icon trigger) — each chosen
destination is its own always-visible icon button, one tap away with no menu to open first, which
is the actual point of "quick." `shared/models/quick-menu.ts`'s `QUICK_MENU_OPTIONS` is a flat list
mirroring the nav drawer's own top-level links exactly (Home/Inventory/Tasks/Reservations/Manage/
Help/Account, same icons/routes) — deliberately not a broader set of app destinations, since "quick
access to what's already one tap away in the drawer" is the whole value proposition. Backed by two
new self-service `profiles` columns (`quick_menu_enabled`/`quick_menu_items`, a plain `text[]` of
option keys rather than labels/routes directly, so a later rename/reorder of the option list needs
no data migration) — same "no privilege distinction to protect, so just widen the column grant"
reasoning `avatar_key`/`last_active_at` already have, no RPC needed. `HeaderComponent.quickMenuItems()`
resolves the stored keys back to full options in `QUICK_MENU_OPTIONS`' own fixed canonical order
(not the order they were selected in — simpler than supporting drag-to-reorder for a first pass,
and means unchecking then rechecking an item can't scramble the menu), filtering out
`requiresManage` options (just the Manage link) for a caller who can't reach them — the same
fail-closed shape the drawer's own `@if (canManage())` gate around that link already has, so a
manager who added it and was later demoted simply stops seeing it. The row of links itself
(`.quick-menu-links`) is what's absolutely centered against `.header-wrapper`
(`position:relative` + `left:50%` + `translate(-50%,-50%)`), not each link individually, and
independent of `.brand`/`.header-actions`' own widths on either side — those two siblings differ
(the org name/online-count vs. a fixed few icons), so a plain flex child here would sit off-center,
biased toward whichever side is narrower. The whole row is hidden entirely (not disabled/shown-
empty) whenever it resolves to zero items, whether because the toggle is off or every selected item
has since become unreachable.

The Account page's four cards (profile info, Avatar, Quick menu, Appearance) flow into two columns
(`.account-cards`, `columns: 22rem 2`) rather than one long stack, so a wide viewport doesn't need
to scroll nearly as much to see all four. Deliberately CSS multi-column flow, not a rigid 2-up grid
pairing specific cards into fixed rows — the four cards are noticeably uneven heights (Quick menu
in particular grows a lot once enabled, Appearance stays short), and a fixed-row grid would size
each row to its tallest cell, wasting whitespace under whichever card in that row was shorter
(the same reasoning Settings' own Data tab gives for staying single-column, see that page's own
paragraph above) — multi-column flow instead lets the browser balance total height across both
columns on its own, and `break-inside: avoid` on every card keeps one from ever being visually
split across the column break. Sized by `column-width` (same technique Settings' own
`.table-column-groups` already established) so a narrow/mobile viewport collapses to a single
column automatically rather than needing a matching breakpoint here.

A visual pass brought some of the landing page's own confidence — gradient light, a more
characterful display face, motion — inside the authenticated shell, starting with `HomeComponent`
and `ManageComponent`'s hub. Two new typefaces load alongside Roboto (`index.html`'s Google Fonts
link): `--font-display` (Bricolage Grotesque), applied globally to every `h1`-`h4` in `styles.scss`
so it reaches page headings and dialog titles alike without any template opting in individually,
and `--font-mono` (JetBrains Mono, paired with a `.mono` utility class using
`font-variant-numeric: tabular-nums`) for any figure that's actually counted — a quantity, a date,
a stat. Neither touches Material's own component-internal typography (buttons, chips, table
headers, form labels), which stays on Roboto's tuned metrics throughout. `HomeComponent`'s hero
(`.home-hero`) is now a pinned-dark gradient band — `color-scheme: dark` plus the same
`color-mix(primary/tertiary, black)` gradient formula and drifting glow-blob technique
`landing.component.scss`'s own `.hero-backdrop`/`.hero-glow` already established, deliberately
reused rather than reinvented — replacing the single subdued glow blob it used to have. Below the
greeting, a 3-stat "pulse row" (tasks due today, low/out-of-stock count, reservations starting
within 7 days) is computed entirely from data `HomeComponent` already loads for its "what's on your
plate" lists and getting-started card — no new queries — and `heroSubtitle()` turns that same
count into a real one-liner ("3 things need your attention today" / "Nothing urgent right now") in
place of a static "Where do you want to go?" that never changed regardless of what was actually
going on. The getting-started card's flat `mat-progress-bar` is replaced by `RingStatComponent` —
the same gauge `manage/reports` already uses for its completion-rate stat — sitting beside the
heading/subtitle in a `.getting-started-header` flex row rather than stacked above the step list;
this is also what caught a real bug in `RingStatComponent` itself, since `gettingStartedProgressPercent`
passes a raw fraction (`2/3 * 100 = 66.66666666666666`) rather than Reports' own pre-rounded
integer — `RingStatComponent` now rounds internally (`Math.round`, not just clamp) so no caller has
to remember to round before passing a percent in. The four nav cards' icon chips
(`.home-card-icon-a/-b/-c/-d`) move from a single flat `*-container` fill to a two-tone gradient
mixing two of the org's three theme-role containers — deliberately built from the `-container` tokens
specifically, not the bare `--mat-sys-primary`/`-tertiary`/`-secondary` roles, which resolve to pale
tones in dark mode unsuited to a white/light icon glyph on top; a `-container`-to-`-container`
gradient keeps contrast against the matching `on-*-container` foreground correct in both themes
regardless of which two are mixed. The "What's on your plate" list rows drop the old one-top-bar-
per-card color coding in favor of a colored left rule *per row*, reused from
`HomeComponent.taskRowSeverity()`: overdue (red) outranks due-today (amber), which outranks 'ok' (a
calm tertiary tone shared by every checked-out-item/reservation row too, and a task with no due
date, since a future or unset date isn't actually a status worth flagging) — a more useful signal
than "which of the three cards is this" once a row's own urgency varies row-to-row. A reservation
row's quantity also moved out of its run-on primary text line ("50× Folding Chairs for Smith
Wedding") into its own trailing `.mono` figure, matching the counted-figure convention above.
`ManageComponent`'s hub picked up the same two-tone icon-chip treatment, one gradient per *section*
(Inventory/Team & tasks/Insights/Admin) rather than per card — with 14+ cards, section-level is
enough variety without inventing a fifth/sixth combo — except Danger Zone, which keeps its own
distinct flat red chip rather than joining the Admin section's shared gradient, the same
"deliberately reads as riskier than its siblings" reasoning its h3 color override already had.

A follow-up pass tightened this to match the design mockup itself rather than just its general
spirit, after the first cut noticeably diverged on a few concrete measurements — most visibly
"What's on your plate" (`.home-lists`), which shipped as a full-width single column (the pre-
existing app's own original reasoning: a narrow card wraps a long task/item/reservation line across
2-3 lines) when the approved mockup had it as a side-by-side grid. Every card across `HomeComponent`
and `ManageComponent` also picked up a `1px solid` `outline-variant` border (every card in the
mockup has one; the shipped version initially didn't), and `.home-grid`/`.home-lists`/`.home-card`/
`.home-list-card` sizing (padding, border-radius, gap, icon size, heading weight) was tightened to
the mockup's own tighter, more compact numbers rather than reusing the pre-existing app's looser
ones. `HomeComponent` also dropped its `<app-breadcrumbs>` row entirely (and the now-unused
`page-toolbar` style import) — as the very first thing after signing in, "Home" was the only crumb
it ever showed, with nowhere to actually go back to.

The same severity-coded-left-rule idea extended from Home's own "What's on your plate" ledger to
the real task lists it was modeled on: `TaskCardComponent`'s `.task-row` (backing both
`TasksComponent`'s personal queue and `ManageTeamComponent`'s per-member lists) and
`ManageTasksComponent`'s own `.task-row` (the "All tasks" table) both replaced their old, differently-
shaped overdue treatments — a solid red pill around the due-date text on the former, a flat 4px
overdue-only border plus colored due-date text on the latter — with the identical 3-tier convention
Home uses: `TaskCardComponent.severity()`/`ManageTasksComponent.taskSeverity()`, both mirroring
`HomeComponent.taskRowSeverity()`'s own overdue-outranks-due-today-outranks-'ok' logic exactly (the
same calm tertiary tone for a future or unset due date, or an already-done task). Both rows also
picked up the app-wide `1px solid outline-variant` card border. The due-date text itself stays a
plain, uncolored `on-surface-variant` in both places now — the left rule alone carries the signal,
same as Home's own rows — so the previously-shown overdue `<mat-icon>error</mat-icon>` was dropped
along with it.

The Inventory page — the highest-traffic page this pass had touched — picked up the same three
primitives. Card view's `mat-card` gets the app-wide `1px solid outline-variant` border (the
existing per-photo badge system — checked-out/low-stock/out-of-stock/pending-retirement — already
covers card view's own severity signaling, so no left-rule was added there; a card's badges and a
row's left rule are two different answers to the same "what's this item's status" question, suited
to their own layout). Table view's `<tr mat-row>` gets a colored left rule that echoes its own
status pill's already-established color exactly (`.table-row-status-*`, reusing the same tokens
`.table-status-*` already defines for the pill fill, just as a stroke instead) rather than
introducing a separate palette — `available` green, `checked-out` tertiary, `low-stock`/`pending-
retirement` amber, `out-of-stock` red, `retired` a neutral outline tone. (Nested under `.mat-mdc-row`
rather than as sibling top-level rules — a bare `.table-row-status-x` selector has *lower*
specificity than `tr.mat-mdc-row`'s own base `border-left: 3px solid transparent` and silently loses
to it regardless of source order otherwise, a real bug caught during this pass's own visual
verification.) Every quantity/price column in both card view (`.quantity-badge`) and table view
(quantity total/per-container/allocated/remaining/low-threshold, price per unit/container) picked up
`.mono` — the same "any figure that's actually counted gets the mono treatment" convention from
Home, applied here for the first time to a page that's mostly *made of* such figures.

A follow-up pass swept the same `.mono` convention across the rest of the app's headline-figure
spots. `manage/reports`' own `.stat-value`/`.stat-detail`/`.breakdown-value`/`.workload-total`
classes get `font-family: var(--font-mono)` directly (rather than tagging every individual template
interpolation with the `.mono` class) since none of these classes is ever used for anything but a
counted figure — including the mixed number-plus-word cases like "3 of 8 done" or "13 units", which
already had `font-variant-numeric: tabular-nums` applied to the whole string before this, so mono-
ing the whole span rather than just its digits matches a precedent this file already established
for itself. `RingStatComponent`'s own center percentage and `DonutChartComponent`'s center label and
legend percentages — both shared components, so this reaches every page that uses them, Home's own
getting-started ring included — also picked it up directly in their templates via the `.mono` class.
`manage/billing`'s three countable usage stats (team members, inventory items, photo storage) got
`.mono` too; the fourth usage stat on that same row (account-created date) deliberately didn't, same
"figures, not dates" line Home's own ledger rows already drew. Deliberately *not* swept onto every
number anywhere in the app — `HeaderComponent`'s "N online" presence text and
`BulkActionToolbarComponent`'s "N selected" are both incidental counts inside a sentence, not a
headline stat display, and reads as inconsistent overreach rather than a real "counted figure"
context the way a stat tile or a ledger row's quantity does.

The last piece of this design pass gave most of Manage's sub-pages a consistent identity of their
own, via a new shared `PageHeaderComponent` (icon chip + title + optional subtitle) replacing each
page's own bare `<h2>` — some paired with a `.page-subtitle` paragraph, some with a whole
`.page-header-row` flex wrapper for an action button — that had been duplicated near-verbatim
across seven-plus component stylesheets before this. Two content-projection slots cover the shapes
those duplicated headers needed: `[headerTitleExtra]` renders inline right after the title text
(Orders' own help tooltip, previously inline inside its `<h2>`), and the default slot renders
trailing action content (Suppliers'/Orders'/Reservations' "Add"/"Place order"/"New reservation"
buttons, previously a flex sibling in `.page-header-row`). A page with a role-conditional subtitle
(Reservations, whose copy differs for a plain staff viewer vs. admin/manager — see that page's own
route comment) computes it as a plain getter rather than inline template logic, since the
component's own `subtitle` input is just a string. Danger Zone gets a `variant="danger"` input that
swaps the icon chip for the same flat red treatment its own Manage-hub card already uses (see
`ManageComponent`'s own `.manage-card-icon-danger` comment) rather than the shared gradient — this
page is a deliberate outlier meant to read as riskier than every other page, not another
destination in the same set. Applied to Reports, Suppliers, Orders, Team, Activity, Release Notes,
Error Log, Reservations, Billing, and Danger Zone in a first pass — deliberately not
`manage/settings`/`manage/inventory`/`manage/tasks` at the time, since each has a tab toggle (plus,
for Inventory, an action button and for Tasks, bulk-edit controls) sitting right below the heading,
which looked riskier to retrofit than the plainer pages. A follow-up pass covered those three too:
the tab toggle group (and, on Inventory, the Export button; on Tasks, the Bulk edit controls) turned
out to already be its own element sitting *below* the heading in every case, not something
entangled with it — so the swap was exactly the same as everywhere else, `<app-page-header>` in,
bare `<h2>` (± its own `.page-header-row` wrapper) out, with the tab/action row left completely
untouched as a sibling underneath. Settings uses the same `palette` icon as its own Manage-hub
card; Inventory's Export button and Tasks' tab row ride in the same default content-projection slot
Suppliers'/Orders' own buttons already established. That leaves only the Manage hub itself
un-migrated, which keeps its own bare header on purpose (see above).

A pass on empty states and small interaction polish followed. `EmptyStateComponent`'s icon moves
from a bare, dimmed (`opacity: 0.6`) `mat-icon` floating on its own into a soft circular gradient
badge — the same two-tone container-token treatment this app's nav/list/page-header icon chips
already use, just circular and sized up (4.5rem) since this is the one visual focal point of an
otherwise-empty page rather than a small accent beside other content. The badge plays a brief
scale-in on mount (a plain CSS animation — an empty state renders once and stays, nothing to
debounce or replay against, so no JS-driven trigger is needed), skipped under
`prefers-reduced-motion` same as this app's other ambient animations. The `error` variant swaps the
badge's fill to a subtle error-tinted one (mirroring `ManageComponent`'s own Danger Zone icon
treatment) rather than the shared neutral gradient. `compact` mode (an empty state nested inside an
already-populated page, e.g. a "Completed" section with nothing in it) deliberately keeps the old
small-inline-icon treatment with no badge — a hero-sized circle would be out of place squeezed into
one row.

Several of the app's "the whole element is the click target" surfaces (as opposed to a card that
merely *contains* a button, like Inventory's own item cards) picked up an explicit `:active` press
state, rather than only ever reacting to `:hover` and otherwise holding steady straight through a
click: `HomeComponent`'s `.home-card`/`.home-list-card`, `ManageComponent`'s `.manage-card`,
`StudioComponent`'s `.studio-card`, and `TaskCardComponent`'s/`ManageTasksComponent`'s own
`.task-row` (both already `role="button"` with a click handler on the whole row, not just an inner
control). The card surfaces reduce `:hover`'s own lift/shadow into a "pushed in" state (less
translateY, a smaller shadow, a slight `scale(0.98)`) rather than just holding the hover state
through the press; the two task-row surfaces instead darken a step further
(`--mat-sys-surface-container-high`) since a background-only hover has no "lift" to reduce.
`.home-list-items` rows are the one exception needing a different mechanism — their own `:hover`
already tops out at `surface-container-high`, the highest container tone available, so there's no
darker background left to press into; a `scale(0.985)` on `:active` carries the same feedback
instead, deliberately left out of the row's own `transition` list so the press itself reads as
instant rather than eased (only the release, back to `:hover`'s background, animates). None of this
is gated behind `prefers-reduced-motion` — unlike this app's ambient/auto-playing animations, a
press state only ever fires in direct response to the user's own click, the same category
`:hover`'s pre-existing transform changes already sit in without a guard. Deliberately scoped to
elements that are themselves the interactive target — Inventory's card-view `mat-card` and table
rows were left alone, since neither is actually clickable as a whole (only their own "Details"
button / actions-column icon button is), and adding press feedback to the surrounding card/row would
have implied an affordance that isn't really there.

A "checkmark draw-in or subtle confetti" moment on completing every Getting Started step (part of
the original ask that prompted this pass) was considered and deliberately not built: the step that
actually flips a task/item/teammate count from zero to nonzero almost always happens on a
*different* page than Home itself (creating the first inventory item from `manage/inventory`,
inviting a teammate from `manage/team`, etc.), so by the time a visitor is back on Home with
`gettingStartedSteps` freshly loaded, the transition already happened off-screen — there's no
"just completed" moment inside `HomeComponent`'s own lifecycle left to animate. Worth revisiting if
this card ever gains its own live/realtime updates rather than a load-once snapshot.

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
  guarded by `approvedGuard` (plus `home`, `tasks`, `account`, `help` — all similarly guarded).
  `manage` is a card hub (`ManageComponent`) linking to twelve flat sibling routes —
  `manage/inventory`, `manage/tasks`, `manage/team`, `manage/activity`, `manage/error-log`,
  `manage/suppliers`, `manage/orders`, `manage/release-notes`, `manage/reports` (all `manageGuard`:
  admin OR manager), `manage/reservations` (`approvedGuard` only — every approved org member, not
  just admin/manager; see the Project Overview section above) and
  `manage/billing`/`manage/danger-zone`/`manage/settings` (`adminGuard`, stricter — financial info,
  org export/delete, and site-wide branding respectively) — rather than nested child routes,
  matching the rest of the app's flat routing. The hub itself (`ManageComponent`) groups these
  into four labeled sections — Inventory (Inventory/Suppliers/Orders/Reservations), Team & tasks
  (Tasks/Team), Insights (Activity Log/Release Notes/Reports/Error Log), and Admin
  (Billing/Settings/Danger Zone, Danger Zone deliberately last) — rather than one flat grid; with a
  dozen-plus cards, grouping by what they're actually for keeps the page scannable. The three Admin
  cards dropped their old individual "Admin" `permission-badge` pill once grouped under its own
  section header — redundant once the section itself already only renders for
  `authService.role() === 'admin'`.
  `manage/settings` lives under `manage` (not its own top-level `settings` route) for
  the same reason as every other admin/manager tool here — it's reachable only via the Manage hub's
  own Settings card, not a direct header nav link or Home card, matching Billing/Danger Zone's own
  precedent of being Manage-hub-only rather than duplicated elsewhere. `studio` and its three flat
  sibling routes (`studio/feedback`, `studio/error-log`, `studio/organizations`) follow the exact
  same card-hub/flat-sibling-routes shape as `manage` — but guarded by `platformAdminGuard`, a
  genuinely different, cross-org audience (`profiles.is_platform_admin`, not any `role`) than every
  guard above; see the Project Overview section above for the full reasoning and why this is
  deliberately not nested under `manage` itself. Every route uses
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
  notification-center.service.ts # NotificationCenterService — HeaderComponent's bell dropdown; notifications signal + unreadCount, markAsRead()/markAllAsRead()
  guards/auth.guard.ts    # CanActivateFn — awaits authService.getSession() directly
  guards/manage.guard.ts  # admin OR manager
  guards/admin.guard.ts   # admin only (manage/settings, manage/billing, manage/danger-zone)
  guards/platform-admin.guard.ts # is_platform_admin only — a different, cross-org audience from every guard above (studio/*)
  guards/unsaved-changes.guard.ts # CanDeactivateFn — confirms leaving a dirty create form (manage/inventory, manage/tasks)
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
  reservations/                                             # admin/manager only: date-ranged reservations of an item's stock
  release-notes/                                            # admin/manager only: "What's new" list, see Project Overview above
  error-log/                                                # admin/manager only: client_error_log viewer, see Supabase Schema section
  reports/                                                  # admin/manager only: inventory value/stock health, stock movement/loss, task throughput
  billing/                                                  # admin only: pre-Stripe preview of the org's plan/usage, see Project Overview above
  danger-zone/                                              # admin only: org data export + soft-delete (organizations.deleted_at)
  settings/                                                # admin-only: theme picker + logo upload (site_settings) — see Project Overview above
account/                                                    # profile info, avatar picker, light/dark mode toggle, quick-menu picker
help/                                                        # static in-app "how do I..." reference (see Project Overview above)
studio/                                                     # platform-admin only (is_platform_admin, not any org role): card hub (StudioComponent) linking to feedback/, error-log/, organizations/ — see Project Overview above
shared/
  components/modal-table/    # standalone Material dialog showing InventoryItem details
  components/bulk-action-toolbar/ # shared "N selected / select all / clear" chrome for every page with bulk actions
  components/bulk-reassign-modal/ # Inventory's bulk category/physical-location reassignment dialog
  components/supplier-form-modal/ # add/edit dialog backing manage/suppliers' directory CRUD
  components/place-order-modal/ # self-contained item picker + quantity/note dialog backing manage/orders' "Place order"
  components/place-reservation-modal/ # self-contained item picker + date-range/quantity dialog backing manage/reservations' "New reservation"
  components/discard-modal/ # quantity ("Discard all" or a specific amount) + mandatory-reason dialog backing ModalTableComponent's "Discard" button
  components/turnstile-widget/ # Cloudflare Turnstile CAPTCHA, embedded on Login/Register/Forgot Password
  components/help-tooltip/ # small "?" matTooltip icon button explaining a non-obvious control inline
  components/page-intro/ # one-time dismissible orientation banner for a page's first-time visitor (Inventory, Tasks, Manage hub)
  components/donut-chart/ # hand-rolled SVG donut chart (no charting library) — backs manage/reports' "Value by category"
  components/ring-stat/ # hand-rolled SVG percentage ring gauge — backs manage/reports' completion-rate stat
  components/page-header/ # icon-chip + title/subtitle header, shared across most manage/* sub-pages
  components/feedback-modal/ # self-contained feedback-type + message dialog backing the Help page's "Send feedback" button
  models/inventory-item.model.ts   # InventoryItem class (constructor-based, no defaults)
  models/supplier.model.ts   # Supplier — a directory entry inventory_items.supplier_id can point at
  models/inventory-item-order.model.ts # InventoryItemOrder — one restock order against an item's linked supplier
  models/inventory-item-reservation.model.ts # InventoryItemReservation — a date-ranged booking of some quantity of an item's stock
  models/theme-preset.ts     # THEME_PRESETS — key must match a [data-theme] block in styles.scss
  models/inventory-table-column.ts # optional Inventory table-view columns admin can show/hide (Settings > Data)
  models/pricing-tier.ts     # PRICING_TIERS — shared by PricingComponent (/pricing) and ManageBillingComponent
  models/notification.model.ts # UserNotification / NotificationKind / notificationIcon() — backs HeaderComponent's bell dropdown
  models/changelog.ts        # CHANGELOG_ENTRIES — hand-maintained "What's new" list, backs manage/release-notes
  models/help-faq.ts         # HELP_FAQ_SECTIONS — question/answer/links data backing the searchable Help page
  models/quick-menu.ts       # QUICK_MENU_OPTIONS / MAX_QUICK_MENU_ITEMS — backs AccountComponent's picker and HeaderComponent's own icon row
  models/feedback.ts         # FeedbackType / FEEDBACK_TYPE_LABELS — backs FeedbackModalComponent, mirrored by hand in the send-notification-email Edge Function
  models/database.types.ts   # generated via `npm run supabase:gen:types` — regenerate, don't hand-edit
  utils/inventory-item.mapper.ts   # toInventoryItem(row, images, checkedOutToLabel, activityLog?, ..., supplierLabel?) — DB row -> InventoryItem
  utils/inventory-item-images.ts   # loadInventoryImagesByItemId() / uploadInventoryItemImages() / deleteInventoryItemImage()
  utils/inventory-item-activity.ts # loadInventoryActivityByItemId() / logInventoryItemActivity() — inventory_item_activity
  utils/inventory-item-discards.ts # logInventoryItemDiscard() / loadAllInventoryItemDiscards() — structured counterpart to the free-text discard activity line, backs manage/reports
  utils/inventory-item-orders.ts # loadAllInventoryItemOrders() — every org order, backs manage/orders
  utils/inventory-item-reservations.ts # loadAllInventoryItemReservations() / loadUpcomingReservationsForItem() — backs manage/reservations and ModalTableComponent's read-only summary
  utils/inventory-export.ts  # buildInventoryExportCsv() / downloadCsv() — backs manage/inventory's "Export" button
  utils/activity-log.ts      # loadActivityLog() / logActivity() — org-wide activity_log, backs Manage > Activity Log
  utils/profile-label.ts     # profileDisplayName()/resolveProfileName() — shared profiles-array lookup
  utils/supplier-label.ts    # resolveSupplierName() — mirrors profile-label.ts for inventory_items.supplier_id
  utils/barcode.ts           # buildItemQrValue()/parseItemQrValue() — ShelfSync's own QR-label encoding
  utils/presence.ts          # isProfileOnline()/formatLastSeen() — reads profiles.last_active_at, backs Manage > Team's presence indicator
  utils/changelog.ts         # getUnseenChangelogCount()/markChangelogSeen() — localStorage-backed, backs ManageComponent's Release Notes card badge
  utils/realtime.ts          # subscribeToTableChanges() — Supabase Realtime postgres_changes wrapper, see Project Overview above
  utils/debounce.ts          # debounce() — plain setTimeout debounce with .cancel(), backs the task pages' realtime reload handlers
  utils/flash-tracker.ts     # FlashTracker — tracks which ids show the .realtime-flash "someone else just changed this" pulse
  styles/_realtime-flash.scss # shared .realtime-flash keyframes, backing FlashTracker above
  styles/_legal-page.scss   # shared top-bar + prose layout for privacy/ and terms/ (see Project Overview above);
                             # login/register no longer share a partial like this — each owns its own layout now
  styles/_skeleton.scss     # .skeleton-line/-block/-circle shimmer placeholders, backing Inventory/Tasks' loading states
  styles/_stagger.scss      # .cascade-in fade+rise, staggered per-item via [style.animation-delay.ms] — Inventory cards, Tasks rows
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
- `add_inventory_item_discards` — adds `inventory_item_discards` (`item_id`, `container_id` nullable/
  `on delete set null`, `quantity`, `reason`, `discarded_by`, `discarded_at`), a structured
  counterpart to the free-text "Discarded N units... Reason: ..." line `ModalTableComponent`'s
  Discard flow already logs to `inventory_item_activity` — see the Project Overview paragraph above
  for why that text log alone isn't enough for `manage/reports`. Same child-table shape as
  `inventory_item_containers`/`inventory_item_orders` (no `organization_id` of its own; org isolation
  comes from `item_id`), with the day-one-correct join-based SELECT policy `add_inventory_item_orders`
  established rather than the no-join `using (true)` `inventory_item_containers` originally shipped
  with and had to retrofit. INSERT is any authenticated user, self-attributed only (`with check
  (discarded_by = auth.uid())`) — same trust level and shape as `inventory_item_activity` itself,
  matching discarding's own already-any-authenticated-user reach (see
  `ModalTableComponent.canDiscard`'s own doc comment) — since the stock-reducing writes this table
  merely logs are already independently enforced (`is_locked` included) by their own existing
  policies. No UPDATE/DELETE grant at all — permanent, like every other audit-trail table in this
  schema.
- `add_inventory_item_discard_reasons` — widens `inventory_field_options.field_name`'s check
  constraint to also allow `'discard_reason'` (a check constraint can't be altered in place, same as
  `add_more_avatar_presets`, so this drops and recreates it), backing `DiscardModalComponent`'s
  reason field becoming a multi-select against that admin-curated list instead of free text. Changes
  `inventory_item_discards.reason` from `text` to `text[]` (`alter column ... using array[reason]`
  preserves every already-logged row as a one-element array) plus a `cardinality(reason) > 0` check,
  since a discard can now carry more than one reason at once. Seeds a starting list (`'Damaged'`,
  `'Lost or missing'`, `'Expired'`, `'Wear and tear'`, `'Other'`) for every organization that already
  existed, and extends `handle_new_user()` (diffed against its `add_activity_log` version, the most
  recent at the time, per this repo's own "diff against the previous version" lesson) to seed the
  same list for a newly created org going forward — without either, discarding stock (previously
  always possible via free text) would suddenly require an admin to curate a list first, or nobody
  could discard anything at all.
- `add_notifications` — adds `notifications` (`organization_id`, `user_id`, `kind` — a plain checked
  `text` column, not a real Postgres enum, same shape `activity_log.entity_type` already has —
  `message`, `link`, `read_at`), backing `HeaderComponent`'s in-app notification bell (see the Project
  Overview paragraph above for the full client-side mechanism). Deliberately **no INSERT policy for
  `authenticated`/`anon`** — every row is inserted by `send-notification-email` itself via the
  `service_role` key it already holds, keeping recipient resolution in exactly one place rather than
  duplicating it in a PL/pgSQL trigger. SELECT is self-only (`user_id = auth.uid()`); UPDATE is
  self-only *and* column-scoped to just `read_at` (`grant update (read_at)`), the same narrow
  self-service shape `profiles.last_active_at` already has — marking a notification read is the only
  client-side write this table ever needs. Realtime-enabled the same two-part way (publication
  membership + `replica identity full`) `enable_realtime_for_inventory_and_tasks` already established.
- `add_inventory_item_reservations` — adds `inventory_item_reservations` (`item_id`, `start_date`,
  `end_date`, `quantity`, `reserved_for` — free text, not a profiles FK, since this books stock for
  an external customer/event, not an org member — `note`, `status`
  `'reserved'|'picked_up'|'returned'|'cancelled'`, plus `reserved/picked_up/returned/cancelled_by/at`
  pairs for each transition), backing `manage/reservations` (see the Project Overview section
  above). Same child-table shape as `inventory_item_orders`/`inventory_item_discards` (no
  `organization_id` of its own; org isolation via the `item_id` join) and the same day-one-correct
  join-based SELECT policy those two established. **No INSERT/UPDATE/DELETE grant for
  `authenticated` at all** — stricter than `inventory_item_orders` (which does grant a direct
  admin/manager INSERT), because even *creating* a reservation needs a capacity check (summing
  every other overlapping `reserved`/`picked_up` row's quantity via `daterange(...) && daterange(...)`)
  that a plain RLS `with check` can't express, so creation goes through `create_reservation()`
  (`SECURITY DEFINER`, admin/manager only) alongside the three transition RPCs
  (`mark_reservation_picked_up()`/`mark_reservation_returned()`/`cancel_reservation()`), all four
  logging to both `inventory_item_activity` and `activity_log` the same way the retirement/order
  RPCs already do.
- `widen_reservation_access_to_staff` — see the Project Overview section above for the full
  behavior. Drops `create_reservation()`'s admin/manager role check entirely (any approved org
  member can place a reservation now) and rewrites the SELECT policy plus the three transition RPCs
  so a non-admin/manager caller only ever sees/acts on rows where `reserved_by = auth.uid()`.
  `create_reservation()`'s own capacity-check query is untouched and unaffected — it's `SECURITY
  DEFINER`, so it already bypassed RLS before this migration and continues to after.
- `add_item_upcoming_reservations_rpc` — adds `get_item_upcoming_reservations(p_item_id)`, a
  narrow follow-up to the migration above: that one's new SELECT policy also silently scoped
  `ModalTableComponent`'s "Upcoming reservations" item-popup summary down to just the viewer's own
  bookings, which should stay visible to everyone. `SECURITY DEFINER`, scoped by `item_id` (not
  `reserved_by`) so it bypasses that restriction on purpose — see the Project Overview section
  above for the full reasoning.
- `add_quick_menu_to_profiles` — adds `profiles.quick_menu_enabled`/`quick_menu_items`, backing
  the Account page's "Quick menu" picker and `HeaderComponent`'s own centered row of icon links (see
  Project Overview above). Same self-service shape `last_active_at` already established: purely
  cosmetic, no privilege distinction to protect, so widening the existing column grant is enough —
  no RLS/RPC changes needed beyond that.
- `add_restrict_price_supplier_edits` — adds `site_settings.restrict_price_supplier_edits`
  (`boolean not null default false`) and `enforce_price_supplier_edit_restriction()`, a
  `before update` trigger on `inventory_items` (see Project Overview above for the full
  reasoning on why this needs a trigger rather than a plain RLS `with check`, unlike
  `is_locked`). `price_per_unit`/`price_per_container`/`supplier_id` stay in the existing
  any-authenticated-user column grant unchanged — this only gates whether a write actually
  commits, not who's granted to attempt it.
- `add_feedback` — adds `feedback` (`organization_id` defaulting to `current_user_org_id()`,
  `user_id`, `type`, `message`), backing the Help page's "Send feedback" button (see Project
  Overview above). INSERT-only, self-attributed, any authenticated org member — no SELECT policy
  for any role at the time, deliberately unlike every other audit-style table in this schema, so
  nobody *in that org* reads a submission back (see `add_platform_admin` below for the later,
  narrow, cross-org exception). Adds one trigger, `notify_on_feedback_submitted`, reusing
  `call_notification_webhook()` unchanged (from `add_notification_email_webhooks`) — that function
  already posts `tg_table_name`/the new row generically, so no Postgres-side function changes were
  needed, just a new table to point a trigger at.
- `add_platform_admin` — adds `profiles.is_platform_admin` (RPC/manual-only, same reasoning
  `role`/`membership_status` already have — no column grant at all, since the only writer is a
  one-off `UPDATE` run directly against the hosted project, never through the app or a migration)
  and `is_platform_admin()`, a `SECURITY DEFINER` helper mirroring `current_user_role()`/
  `current_user_org_id()`'s own shape exactly. Adds three *additional* permissive SELECT policies —
  RLS policies on the same table OR together, so each of these sits alongside that table's existing
  policy without touching it — granting a platform admin cross-org read on `feedback`,
  `client_error_log`, and `profiles`, backing Studio (see Project Overview above for the full
  feature). `organizations` needed no new policy: its own SELECT policy was already `using (true)`
  for any authenticated user (`create_organizations.sql`).
- `add_feedback_status` — adds `feedback.status`/`reviewed_by`/`reviewed_at`, backing
  `StudioFeedbackComponent`'s review workflow (new/reviewed/resolved) — `feedback` had no such
  workflow at all before this. Column-scoped grant (`update (status, reviewed_by, reviewed_at)`,
  same shape `add_inventory_item_retirement` established for `inventory_items`) plus a
  `platformAdminGuard`-matching RLS UPDATE policy — so even a platform admin can't rewrite the
  original `type`/`message` through this path, and nobody else can update the table at all.

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
