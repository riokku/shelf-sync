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

`index.html` carries social preview metadata (`description`, `og:*`, `twitter:*`) — found missing
during a design-review pass: pasting the landing page link into Slack/email/LinkedIn previously
showed a bare title with no description or image, since only `<title>` and the viewport tag existed
before this. `assets/og-image.png` (the shared `og:image`/`twitter:image`) is a real screenshot of
this page's own live hero section — captured via headless Chrome at exactly the standard 1200×630
`og:image` size (`--window-size=1200,630 --screenshot=...` against a local `ng serve`, with
`--force-prefers-reduced-motion` so the hero's own `fade-up` entrance animation — see
`LandingComponent`'s own reduced-motion block above — renders fully opaque immediately rather than
needing a timed wait for it to finish) — not a hand-drawn graphic, so it stays visually identical to
what a visitor actually sees. `og:url`/`og:image` both need absolute URLs (a crawler fetches
`og:image` directly rather than resolving it against the page it just scraped, unlike a browser
reading `<base href>`), pinned to the same Cloudflare Workers default domain
`send-notification-email`'s own `APP_URL` already hardcodes, for the identical "no custom domain
configured yet" reason — regenerate the screenshot and update both URLs together if that ever
changes.

`/pricing` (`PricingComponent`) is a public three-tier pricing page (Free/Basic/Pro, Basic marked
"Most popular"), same unguarded/chrome-hidden/own-nav-and-footer treatment as landing — linked from
both the landing page's nav and `FooterComponent`. The three tiers' caps and feature splits are a
first pass at what *should* differentiate them once real usage-cap enforcement exists (still not
built — see below), chosen around what actually drives Supabase hosting cost for this app: item
photos are by far the biggest lever (both storage *and* the repeated bandwidth/egress cost of
browsing them, since Supabase bills egress separately from storage), team size is a moderate,
predictable lever (Auth bills by monthly active users), and inventory/task row counts are minor
unless an org reaches tens of thousands of items. Core inventory/task functionality is deliberately
available on every tier rather than paywalled — differentiation is by *scale* (item/team/photo-
storage caps) and *admin polish* (custom branding, data export, error log access — all Pro-only),
not gating the product's basic value proposition this early on. See `PricingComponent`'s own doc
comment for the full per-tier breakdown. The three tiers themselves live in
`shared/models/pricing-tier.ts` (`PRICING_TIERS`, each with a `limits` object —
`maxTeamMembers`/`maxInventoryItems`/`storageLimitMb`, `null` meaning unlimited) rather than being
inlined in `PricingComponent`, so the numbers a prospective customer sees on `/pricing` and the caps
`manage/billing` measures an existing org against can't drift apart.

Each tier's own call-to-action button now does something real, resolved per viewer/tier by
`PricingComponent.ctaFor()` rather than templated inline logic — see that method's own doc comment
for the full decision table. Signed out, every tier still routes to `/register` exactly as before
Stripe existed (checkout-during-signup is deliberately out of scope — an anonymous visitor needs an
org to attach a subscription to first). Signed in as the org's admin, the current tier shows a
disabled "Current plan" label, a non-current Basic/Pro card shows a real button that starts Stripe
Checkout, and the Free card (when the org is actually on a paid tier) routes to `manage/billing`
instead of calling Stripe — "downgrading" to Free is a cancellation, handled entirely by the Stripe
Customer Portal, never a Checkout call. Signed in as anyone else (staff/manager), every non-current
tier shows a disabled "Contact your admin" — mirrors `adminGuard`'s own "billing is admin-only"
boundary (`manage/billing` uses `adminGuard`, not the broader admin-or-manager `canManage()` most of
Manage's other sub-pages use), enforced for real by `create-checkout-session` itself (see below), not
just this button being hidden.

`manage/billing` (`ManageBillingComponent`, `adminGuard` — billing is financial information, same
audience as Danger Zone) shows an org's real Stripe subscription state via `BillingService` — no
more permanent "not connected yet" preview banner or hardcoded Free tier. Account creation date,
team member count, inventory item count, and photo storage usage are still real, independently
queried numbers exactly as before (storage usage from `get_inventory_photo_storage_usage()`, an
admin-only `SECURITY DEFINER` RPC summing `storage.objects` sizes via `inventory_item_images` ->
`inventory_items`, since `storage.objects` isn't exposed to PostgREST directly) — only the plan/
billing-date/payment-method section changed. "Upgrade to Pro" is offered whenever the org isn't
already on Pro — on Free *and* on Basic alike, not just from Free — deliberately the single most
visually prominent action on the card (`.upgrade-pro-button`: a hand-styled primary/tertiary gradient
button with a soft glow, a diagonal shine sweep every few seconds, `auto_awesome` icon, and its own
`:hover`/`:focus-visible`/`prefers-reduced-motion` handling, since Material's own button theming API
only covers a solid `--mat-button-filled-container-color`, not a gradient — Pro is the plan worth
nudging every non-Pro org toward). "Upgrade to Basic" only shows from Free. Once on any paid tier, a
"Manage billing" button opens the Stripe Customer Portal for cancellation/payment-method updates — no
custom cancel/payment-method UI was built anywhere in this app, per Stripe's own guidance that the
Portal should own that — sitting next to a "View plans" link back to `/pricing` (kept out of the plan
summary header specifically so the two read as a pair, and visible on every tier including Free, where
Manage billing itself doesn't render yet). A `past_due` subscription shows a payment-failed warning; a
`cancelAtPeriodEnd` subscription notes when it reverts to Free. `BillingService` (`core/billing.service.ts`)
is the shared root-provided service both pages
read from — a signal-backed `subscription`/`currentTier` pair (`currentTier` derived via
`pricingTierByKey(subscription()?.tier ?? 'free')`, the same "missing row means the default"
convention `SiteSettingsService`'s own signals already use) plus `startCheckout(tier)`/
`openBillingPortal()`, which call an Edge Function rather than writing any table directly — mirrors
`ImpersonationService.start()`'s own `functions.invoke()` + `extractFunctionErrorMessage()` shape,
since neither this service nor any client code has a write grant on `subscriptions` at all (see that
table's own migration note below). `startCheckout()` returns a `{ error, redirected }` pair rather
than just an error string, because it has two genuinely different outcomes (see
`create-checkout-session`'s own paragraph below for why): `redirected: true` means the browser is
mid-navigation to a real Stripe Checkout page (`window.location.href = data.url`) and the caller
should leave its own pending/spinner state alone; `redirected: false` means an existing paid
subscription's price changed in place with no redirect at all — `startCheckout()` itself reloads
`subscription()`/`currentTier()` before resolving, so the caller just clears its pending state and
shows its own "done" toast (`NotificationService.success()`, same as every other brief confirmation
in this app) since there's no page navigation to otherwise signal it.

Real Stripe subscription state lives in a new `subscriptions` table — one row per org (missing row =
implicit Free, same convention as above), `tier`/`status` columns, Stripe customer/subscription/price
ids, `current_period_end`, `cancel_at_period_end`. Any approved org member can read their own org's
row (tier isn't sensitive the way payment details are); there is **no insert/update/delete grant for
`authenticated`/`anon` at all** — every write happens through three new Edge Functions'
`service_role` clients, the only thing that can ever move an org between tiers. Backed by official
Stripe integration guidance (fetched live via `npx skills add https://docs.stripe.com` into
`.agents/skills/stripe-*` — Checkout Sessions in `mode: 'subscription'` + the Billing APIs, which
auto-generate Invoices per cycle with no separate Invoicing integration needed; the Customer Portal
for every self-service plan change; a webhook handler for the subscription lifecycle described as
never optional; one Stripe Product per tier, never multiple tiers' prices on one Product; a
restricted API key rather than a full secret key; never passing `payment_method_types`, letting
Stripe's own dynamic payment methods apply).

`supabase/functions/create-checkout-session` and `create-billing-portal-session` are browser-invoked
(`supabase.functions.invoke()`), mirroring `impersonate-user`'s own shape exactly: real CORS
handling, a module-level `service_role` client alongside a per-request caller-identifying client (the
caller's own forwarded `Authorization` header against the anon key, used only for `.auth.getUser()`),
a flat `{ error: string }` JSON body on every non-2xx response. Both re-check the caller is an admin
of their own org server-side (mirroring `adminGuard`'s own check) rather than trusting the client.
`create-checkout-session` finds-or-creates the org's Stripe Customer by reading (never writing)
`subscriptions.stripe_customer_id` — passing `customer_email` instead the first time and letting
Checkout create the Customer itself, since every actual table write for this feature stays inside the
webhook — then creates the session with both `client_reference_id` *and*
`subscription_data.metadata` set to the organization id (session-level metadata is only ever visible
on `checkout.session.*` events; a later Portal-driven upgrade or plain renewal has no idea which
Checkout Session originally created it, so the Subscription object's own metadata is what lets the
webhook re-correlate those events back to an org). `create-billing-portal-session` needs an existing
`stripe_customer_id` (400 — "choose a plan first" — if none yet) and just mints a portal session URL.
Stripe Price ids for Basic/Pro are a hardcoded constant map inside `create-checkout-session` (same
convention as `send-notification-email`'s own `FROM_ADDRESS`/`APP_URL`) — two tiers, never read by
Angular, not worth a table — duplicated into the webhook function as a defensive fallback for tier
resolution when a subscription's own metadata is somehow missing.

The Checkout-Session path above only ever applies when the org has no currently-billing subscription
(Free, or a past cancellation) — a real gap caught before it could double-bill anyone: an org already
on Basic clicking "Upgrade to Pro" would, if this just reused the same Checkout flow, get a brand-new,
*second* Subscription object on the same Stripe Customer rather than changing the existing one, since
Checkout Sessions only ever create new subscriptions. `create-checkout-session` instead checks the
org's `subscriptions` row first — if `stripe_subscription_id` is set and `status` is
`active`/`trialing`/`past_due` (a real, currently-billing subscription, not `canceled` or similar), it
calls `stripe.subscriptions.update()` directly instead, swapping the subscription's existing item onto
the new tier's Price with proration (`proration_behavior: 'create_prorations'`, Stripe's own default,
made explicit) and returns `{ updated: true }` — no Checkout URL, since there's nothing to redirect
to, the change is immediate. That `update()` call is itself what triggers a real
`customer.subscription.updated` webhook event, so the actual `subscriptions` row write still goes
through `stripe-webhook` exactly the same as every other path; this function only ever *performs* the
plan change, never writes the row itself. A request for the tier the org is already on is rejected
outright (400) rather than calling Stripe over nothing.

Shipped with a real bug caught on the very first live checkout attempt, not from a test: Stripe's
"Managed Payments" feature (Stripe acting as merchant of record, handling tax globally) is on by
default for this account and requires every Product to carry a `tax_code` — the first attempt failed
with "the product tax code is missing" before ever reaching this app's own code. Diagnosed by
reproducing the exact same `checkout.sessions.create()` call directly against Stripe's raw API (`curl`
itself turned out to segfault on this machine specifically when Stripe returns a 4xx from `api.stripe.com`
regardless of auth method — Node's `fetch` was the working substitute) rather than by trial-and-error
against this app's own code. Fixed by passing `managed_payments: { enabled: false }` on the session
(cast through `as Stripe.Checkout.SessionCreateParams`, since this is new enough that the installed
`stripe` npm package's own TS types may not yet know the field) rather than assigning tax codes to
Basic/Pro — real tax handling is already its own deliberately-deferred item below, and this is the
same category of thing. Revisit both together before any real, non-test charge.

`supabase/functions/stripe-webhook` is the *only* place any `subscriptions` row is ever written,
called directly by Stripe rather than the browser (mirrors `send-notification-email`'s shape instead
— a single `service_role` client, no CORS) and authenticated by Stripe's own webhook signature
(`stripe.webhooks.constructEventAsync()` — the async variant, since Deno's crypto has no sync
verifier — against the raw request body, the `Stripe-Signature` header, and `STRIPE_WEBHOOK_SECRET`)
rather than this app's own `x-webhook-secret` shared-secret scheme, which is specific to the
Postgres-trigger-originated calls that function otherwise handles; `[functions.stripe-webhook]` in
`config.toml` sets `verify_jwt = false` for the identical "Stripe's caller has no Supabase JWT
either" reason that block already exists for `send-notification-email`. Handles exactly the six
events Stripe's own guidance calls mandatory: `checkout.session.completed`/
`checkout.session.async_payment_succeeded` (gated on `payment_status === 'paid'` for the former) each
re-`retrieve()` the real Subscription (a Checkout Session itself carries no status/period-end) and
upsert the row (`onConflict: 'organization_id'`); `customer.subscription.updated` (Portal-driven
upgrade/downgrade, plain renewals) reads the org id from the Subscription object's own metadata (it
has no `client_reference_id` — only a Checkout Session ever does) and does the same upsert;
`customer.subscription.deleted` flips the row to `tier: 'free'`, `status: 'canceled'` while keeping
the Stripe ids for a future resubscribe; `invoice.paid` re-syncs the row on every renewal;
`invoice.payment_failed` sets `status: 'past_due'` with no forced downgrade — Stripe's own dunning
retries own the grace period, the Portal is where the customer actually fixes their payment method.
Response codes deliberately depart from `send-notification-email`'s "always 200, best-effort"
philosophy: a signature failure is a genuine `400`, and a database write failure inside a handler is
a logged `500` — an inaccurate subscription row is worth Stripe's own automatic retry, unlike a
missed notification email.

Deliberately out of scope for this first pass: real usage-cap enforcement against
`PRICING_TIERS.limits` (an org can still exceed its own tier's caps today — this only changed
whether the org can actually *pay*, not whether anything is gated by payment); annual billing or
multiple prices per product; Stripe Tax (their own guidance's own mandatory reminder: before any
real, non-test charge, revisit `automatic_tax` plus an active Stripe Tax registration — without one
Stripe silently collects zero tax); any invoice/payment-history UI or table (`invoice.paid`/
`invoice.payment_failed` only ever refresh `subscriptions.status`/`current_period_end`, nothing is
persisted per-invoice); trials; and a `_shared/` Edge Function directory (the small `STRIPE_PRICE_IDS`/
`APP_URL` config stays duplicated per-function, matching every existing Edge Function in this app).

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
as `loadGettingStarted()`'s own guard. `.home-grid`'s card order is Inventory, Tasks, Reservations,
Account, then Manage last (admin/manager-only, so it's the one card that can be absent) — Manage
used to sit third, but as the "administer everything" destination it reads better as the final,
most-privileged stop rather than interrupting the everyday row of destinations everyone can reach.
Reservations was added to this grid after the fact (originally reachable from Home only via its own
personal "upcoming reservations" list card below, or the nav drawer/Quick Menu) — same
`approvedGuard` tier as Home itself, so no `@if` gate is needed the way Manage/Studio need one; its
icon chip (`home-card-icon-e`) is reused by the "Your upcoming reservations" list card's own header
icon too, matching the "list icon echoes its conceptually-matching nav card" convention this
paragraph already documents for Tasks/Inventory.

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
Live in the UI via `shared/utils/barcode.ts`'s `BARCODE_FEATURE_ENABLED` (`true`) — every entry
point checks this flag and renders normally while it's on: `ManageInventoryComponent`'s create-form
field/scan button, `ModalTableComponent`'s QR label button/barcode display row/edit field/scan
button, and the "Barcode" checkbox in both of Settings > Data's grouped-field sections (included in
`INVENTORY_FORM_FIELD_GROUPS`/`INVENTORY_TABLE_COLUMN_GROUPS` while the flag is true). This started
as a temporary kill switch (the feature wasn't fully set up to function yet at the time) and was
flipped on once `BarcodeScannerModalComponent`/`QrLabelModalComponent` were verified to be fully
wired — real `@zxing/browser`/`qrcode` implementations, no stubs, `_headers`' own
`Permissions-Policy: camera=(self)` already anticipating the camera grant — so turning it on really
was the one-line change its own doc comment had always promised. Kept as a real constant rather than
deleted now that it's on, purely as a fast kill switch: flipping it back to `false` hides every one
of those entry points again instantly, with the underlying code (this file, both modal components,
the `inventory_items.barcode` column/migration, the `InventoryItem` field itself) left fully in
place either way. Checked directly in each rendering site rather than folded into `fieldEnabled()`/
`tableColumns`, since an org whose stored `site_settings.inventory_form_fields`/
`inventory_table_columns` predates this flag's introduction needs the exact same behavior regardless
of what's stored.

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

Three actions that are cheap and safe to reverse right after they happen — the Inventory page's
bulk category/physical-location reassign, Manage Tasks' bulk status change, and
`ModalTableComponent`'s Discard flow — offer an "Undo" action on their own success toast instead of
either a confirm dialog up front (friction on every single use, for a mistake that's rare) or no
safety net at all. `NotificationService.successWithUndo(message, onUndo, undoLabel?)` is the shared
mechanism: `SuccessToastComponent` (already every success toast's content component) gained an
optional trailing `mat-button` rendered only when `undoLabel` is set, which calls the toast's own
`MatSnackBarRef.dismissWithAction()` on click — a bare `openFromComponent()` config has no built-in
action slot the way the string-based `open(message, action)` API does, so the button has to live
inside the component's own template, with `successWithUndo()` subscribing to `onAction()` to run the
caller's `onUndo` callback. A longer duration than the plain `success()` toast (6s vs 3s) gives a
reader an actual chance to click it. Each of the three call sites captures whatever it's about to
overwrite *before* writing (a per-item previous category/physical-location pair, a per-task previous
status, the item's — and, for a container-tracked discard, that specific box's — pre-discard
quantities) and its own `undoBulkReassign()`/`undoBulkStatusChange()`/`undoDiscard()` writes that
snapshot straight back through the exact same write path the original action used (a plain
`inventory_items` update, `update_task_status()`, a plain `inventory_items`/
`inventory_item_containers` update respectively), logging the reversal as one more ordinary
activity-log entry rather than erasing the record that the original action happened — undoing a
discard in particular deliberately never touches the `inventory_item_discards` row itself, which
grants `authenticated` no UPDATE/DELETE at all and is permanent by design (see that table's own
migration note) — the correct audit trail is "this discard happened, and was then undone" as two
lines, not one erased line. `undoBulkReassign()` diffs its captured value against the item's
*current* one (already patched by the realtime subscription to the post-write value by the time undo
can run) rather than blindly overwriting, so a concurrent further edit to that item in the meantime
isn't silently clobbered — same reasoning `applyBulkReassign()` itself already uses to skip a field
that's already at its target value.

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
(this is a single-router-outlet SPA, so at most one of the seven subscribing components is ever
mounted at a time — no app-wide channel-manager service needed), torn down via `DestroyRef.
onDestroy(() => supabase.removeChannel(channel))`, the same cleanup pattern this app's `setInterval`
usages already established. Deliberately **no client-side `organization_id` filter** on the
subscription — matches every other query in this app, which trusts RLS alone for org scoping; a
Realtime `postgres_changes` event is itself gated per-subscriber by the table's own RLS SELECT
policy (join-based policies included — see `widen_realtime_to_child_tables`'s own migration
comment for why that still works, and why it still needs `REPLICA IDENTITY FULL`), no separate
"Realtime Authorization" setup needed for this event type. Each of the subscribing components
reuses its own page's existing reload precedent rather than a new merge strategy:
`ManageInventoryComponent`/`InventoryComponent` patch a single row in place
(`refreshInventoryItem()`/`refreshInventoryListItem()`, the latter promoting `loadInventory()`'s
local `profiles` var to a field so it can re-resolve labels for just the one changed item);
`TasksComponent`/`ManageTasksComponent`/`ManageTeamComponent`/`ManageOrdersComponent`/
`ManageReservationsComponent` instead reuse their existing full-reload methods
(`loadTasks()`/`loadTeamTasks()`/`loadOrders()`/`loadReservations()`), debounced 300ms via a new
plain-`setTimeout` `shared/utils/debounce.ts` utility (matching this app's no-RxJS-operators
convention) so a burst of WAL events collapses into one reload rather than one per event — these
pages already deliberately do a full reload after any local mutation, since e.g. a transfer can
move a task between lists. `ManageTeamComponent`'s subscription is added alongside, not merged
into, its existing 30s presence-poll `setInterval`/cleanup — a separate, already-settled concern
(see the presence paragraph above) this feature has no reason to disturb.

Scope started deliberately narrow (only `inventory_items`/`tasks` rows going live) and was widened
in a follow-up pass once the gap it left started to matter: a pure `inventory_item_images` add/
remove never touches its parent `inventory_items` row at all, so a photo-only edit didn't push live
even though everything else did (`inventory_item_containers`/`inventory_item_discards` were never
part of this gap — a container edit, container-tracked discard included, already re-derives and
writes `quantity_remaining`/`quantity_total` back onto the parent row on every save, which the
existing `inventory_items` subscription already picks up). `InventoryComponent`/
`ManageInventoryComponent` each now open a *second*, separate subscription on
`inventory_item_images` alongside their existing `inventory_items` one — keyed by `item_id`, not
`id` — that reuses `refreshInventoryListItem()`/`refreshInventoryItem()` verbatim (both already
reload that item's images on every call, regardless of why); the same follow-up also gave
`manage/orders`/`manage/reservations` a realtime subscription of their own for the first time
(`inventory_item_orders`/`inventory_item_reservations` respectively) — unlike every other page
here, these two previously had none at all, so marking an order received or actioning a reservation
in one tab never showed up in another until a manual reload. Both reuse the same debounced-full-
reload-plus-`pendingFlashIds` shape the task pages already established, described below.
`ManageReservationsComponent`'s subscription needs no extra client-side scoping for a staff
viewer even though this page's own guard is `approvedGuard` (every approved member, not just
admin/manager) — `inventory_item_reservations`' own SELECT policy already restricts a non-admin/
manager caller to just their own rows (see `widen_reservation_access_to_staff`), and Realtime
evaluates that same real policy per subscriber, so a staff member's channel simply never receives
another member's row to begin with.

No toast fires for a background change from another user — `NotificationService` stays scoped to
the acting user's own action, same as everywhere else in the app; data just updates silently —
instead, the specific row/card that changed briefly pulses via a shared `.realtime-flash` treatment
(`shared/styles/_realtime-flash.scss`, a background-color fade reusing the same visual language as
`LandingComponent`'s own decorative `.mock-row.flash` mockup) so a live update is noticeable
without needing a toast. `shared/utils/flash-tracker.ts`'s `FlashTracker` (a plain `Set<string>` of
currently-flashing ids with its own auto-expiry, matching this app's existing convention of plain
class fields over a signals-based state layer) is what each of the subscribing components adds/
reads from — `isFlashing(id)` in the template — rather than a signal-per-row. Only ever triggered
from the realtime handler itself, not from a component's own local-edit reload paths (e.g.
`ManageInventoryComponent.openInventoryDetail()`'s `afterClosed()`), since flashing your own
just-made edit would be pointless — you already see it change. `InventoryComponent`/
`ManageInventoryComponent` flash the single patched row directly, once the patch itself lands
(never on a DELETE, since there's no row left to flash — the `inventory_item_images` subscription
is the one exception, flashing unconditionally on every event including DELETE, since deleting a
photo still leaves the item's own row/card visible to flash). `TasksComponent`/
`ManageTasksComponent`/`ManageTeamComponent`/`ManageOrdersComponent`/`ManageReservationsComponent`
collect changed ids into a `pendingFlashIds` set as raw (pre-debounce) `postgres_changes` events
arrive, then flash all of them together right after their existing debounced reload actually
completes — flashing before the reload would highlight a row that's still showing stale data.

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

Export's counterpart, an "Import" button right beside it, bulk-creates items from a re-uploaded CSV
built off a downloadable template (`shared/utils/inventory-import.ts`'s `buildInventoryImportTemplateCsv()`
— 15 columns, every insertable "Create item" field except barcode, which this feature skips entirely
rather than gating on `BARCODE_FEATURE_ENABLED`, and every server-derived column a fresh item can't
have yet). Parsing uses `papaparse` (real staff editing this in Excel/Sheets makes BOM/quoting/line-
ending robustness matter more than avoiding a small dependency, unlike this app's usual hand-rolled-
over-a-library preference for its charts) — `parseAndValidateImportRows()` reads cells by header name
rather than position, so reordering columns in the spreadsheet doesn't break anything, and validates
each row client-side before anything is ever sent to the DB: a blank Name or Quantity total, a
malformed numeric field, or an invalid `Expiration date` (strict `YYYY-MM-DD`, checked against a real
calendar date) all block that one row (shown in a preview table, skipped on import) rather than the
whole file; a `Supplier name` that doesn't case-insensitively match the org's already-loaded
`SupplierService.suppliers()` directory is only a warning — the row still imports with `supplier_id`
left `null`, same "fix it after import" spirit as photos and container/box breakdowns, both
deliberately left out of this feature entirely (every imported item is flat-quantity; both can be
added to an item afterward same as always). A row whose `Name` case-insensitively matches an item
already in the org (`existingItemNames`, every name in `allInventoryItems` — active/pending/retired
alike, passed to the modal via `MAT_DIALOG_DATA` since it's page state, not a shared service the way
`SupplierService` is) or another row in the same file is also blocked, as a likely accidental
duplicate rather than silently creating a second entry — matched every row sharing that name when
it's an in-file collision, not just the second-or-later occurrence, since there's no reliable way to
guess which one was meant to be the real item. This is a client-side safeguard only; unlike `barcode`,
`inventory_items.name` has no DB-level unique index, so a genuine race between two simultaneous
imports still isn't caught server-side. The matching itself (`isDuplicateItemName()`, case-insensitive
and whitespace-trimmed) lives in `shared/utils/inventory-item-name.ts` rather than inline in the
importer, since `ManageInventoryComponent.submitInventoryItem()` — the plain "Create item" form —
reuses it too: typing a name that already exists there is rejected with the exact same
`DUPLICATE_ITEM_NAME_ERROR` wording, so the two creation paths agree on what counts as a duplicate
rather than the importer being stricter than manual entry. No RPC accepts an array of rows, so
`ImportInventoryModalComponent` (self-contained like `PlaceOrderModalComponent` — it does its own
`inventory_items` inserts, own error handling, own toast) inserts one row at a time, batched in small
concurrent chunks (`Promise.all` per chunk of ~15, chunks sequential) rather than one request per row
firing all at once, and tallies success/failure per row exactly like every other bulk action in this
app — except, unlike those, it stays open on a "done" step afterward (rather than immediately closing
the way `PlaceOrderModalComponent` does) so skipped/failed rows are actually reviewable, real
partial-outcome detail a single order never has. One best-effort `activity_log` summary entry
(`entity_id: null`, schema-legal — that column has no FK) covers the whole import rather than one
entry per item. That "done" step's own primary action is a "View inventory" CTA (only shown once
`succeededCount > 0` — nothing to view otherwise) navigating to `/inventory`, the full browsing page,
rather than just trusting the "Imported N items" text — explicit `dialogRef.close()` + `router.navigate()`
rather than a plain `[routerLink]` relying on `MatDialogConfig`'s default `closeOnNavigation`, so the
close is directly unit-testable rather than depending on an inferred library default.

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

Every approved org member gets a `manage/audits` route (`ManageAuditsComponent`, `approvedGuard`
only — same tier `manage/reservations`/`/broadcasts` already established for a `manage/*` page
reachable without admin/manager) for physical inventory audits ("cycle counts"): reconciling what
the system thinks is in stock against what's actually on the shelf. An admin/manager starts an
audit (org-wide, or scoped to one `physical_location`) via `StartAuditModalComponent`, which calls
`start_inventory_audit()` — a `SECURITY DEFINER` RPC that snapshots every item with `status !=
'retired'` in scope (active *and* `retirement_pending` — finding stock on a pending-retirement item
during a count is itself a meaningful discrepancy, not noise to exclude) into a new
`inventory_audit_counts` row per item, `expected_quantity` set to that item's `quantity_remaining` at
that exact moment. Any approved member can then open the audit (`AuditDetailComponent`, embedded
inline via `ManageAuditsComponent.selectedAuditId`/`?audit=<id>`, same `selectedItemDetail`/`?item=`
shape `ManageInventoryComponent` already established, rather than a routed `manage/audits/:id` —
audits have only one entry point, their own list, unlike Studio's routed detail pages which exist
specifically for cross-linking from multiple entry points) and submit what they actually counted for
any not-yet-counted item via `submit_audit_count()` — no role check beyond org membership, same
staff-level trust `widen_reservation_access_to_staff.sql` already established for physical warehouse
work; re-submitting overwrites, so a miscount is fixable until the audit is finalized. A counted
item lands in one of three buckets purely computed client-side from its `expected_quantity` vs
`counted_quantity` (`isAuditDiscrepancy()`, `shared/models/inventory-audit.model.ts`): matches,
discrepancies, or (uncounted) not-yet-counted. Matches render as their own "Audited items" section,
the same per-item card treatment Discrepancies already has (`.count-row`, name/expected/counted/
"difference 0", who counted it and when) rather than a single collapsed "N items matched exactly"
summary line — a match's own difference is always literally 0 by definition (a match is exactly
"counted equals expected"), so that field is a plain hardcoded `0` in the template rather than a
computed one, tagged with a success-toned "Matched" pill instead of Discrepancies' own
Apply/Applied/Container-tracked tag.
`AuditDetailComponent`'s own header also denotes the audit's status directly (a `.status-pill`,
same markup/palette `ManageAuditsComponent`'s own list row already established for this exact
in_progress/completed/cancelled set) — previously only inferable on the detail page itself from
which meta lines ("Completed by…"/"Cancelled by…") or header buttons happened to render.

Reconciling a discrepancy is admin/manager-only — the same trust split `approve_item_retirement`
draws against discarding stock elsewhere in this schema — via `apply_audit_count()` (per-row) or a
bulk "Apply all" (the same `Promise.all` + per-row tally convention every other bulk action in this
app already follows, no RPC accepting an array of ids). It shifts the item's *live*
`quantity_remaining`/`quantity_total` by the counted-vs-expected **delta**, not an absolute
overwrite (`new_remaining = live_remaining_now + (counted − expected_snapshot)`) — real activity on
the item during the audit window (a checkout, a discard, another edit) would otherwise be silently
erased by overwriting to the counted figure outright; if nothing else changed, the delta reduces to
exactly `new_remaining = counted`, so this is invisible in the common case. A container-tracked item
(`exists (select 1 from inventory_item_containers where item_id = ...)`, checked server-side)
refuses to apply at all — there's no reliable way to know which specific box was miscounted, so that
discrepancy is informational only and has to be corrected by hand via the item's own container
editor. Applying and completing are independent actions: "Complete audit"
(`complete_inventory_audit()`) just finalizes the audit's own record and deliberately does **not**
auto-apply whatever's left unapplied, since a manager might deliberately choose not to trust a
particular count — an unapplied discrepancy stays visible in the completed audit's own history
rather than being forced through. "Cancel audit" (`cancel_inventory_audit()`) is the only other way
out of `in_progress`, no reconciliation attempted, and stays admin/manager-only outright — cancelling
mid-audit is always a judgment call.

Completing itself was originally admin/manager-only too, same as cancelling — widened so any approved
member can complete an audit once nothing in it is left uncounted (`AuditDetailComponent`'s own
`canCompleteAudit` getter, `authService.canManage() || notYetCounted.length === 0`), since once every
item has a submitted count there's no judgment call left to make; leaving discrepancies unapplied is
still fine (see above), but an admin/manager choosing to complete *before* everything's counted is a
real decision only they can make. Enforced server-side, not just in the template —
`complete_inventory_audit()` counts its own audit's still-null `counted_quantity` rows and only
raises the admin/manager-only exception when that count is nonzero, so a direct RPC call from a
non-manager on a not-fully-counted audit is rejected exactly like before.

`inventory_audits` is an org-level table (its own `organization_id`), not a per-item child — modeled
on `broadcasts` rather than the containers/discards/orders/reservations shape, since an audit spans
many items rather than belonging to one. `inventory_audit_counts` is a child of the audit (not of
the item), one row per item snapshotted at start time (`unique (audit_id, item_id)`) — pre-populating
every in-scope item up front, rather than only recording rows for items someone actually counts, is
what makes "38 of 50 counted" and "this item was never found" possible at all. Neither table grants
`authenticated` any direct INSERT/UPDATE/DELETE — every write goes through the five RPCs above, all
`SECURITY DEFINER`, dual-logging to `inventory_item_activity`+`activity_log` (a new
`'inventory_audit'` `activity_log.entity_type`, same drop-and-recreate-check-constraint widen
`add_broadcasts` already did for `'broadcast'`) the same way every other lifecycle RPC in this schema
already does. `apply_audit_count()` shipped with a real bug caught and fixed same-day, before any
client code depended on it: no guard against being called twice on an already-applied row, which
would have silently double-shifted the item's quantity on a retry/double-click/stale-render — see
`20260920120100_fix_apply_audit_count_double_apply.sql`'s own comment.

An in-progress audit can also be claimed by an org member (or several) as an explicit "who owns
finishing this" signal — a single `lead` plus any number of `supporters`, both surfaced on
`AuditDetailComponent`'s own "Audit team" section as a Lead `mat-select` and a Support
`mat-select multiple`, and echoed as a small "Led by X" tag on each row of `ManageAuditsComponent`'s
own list. Purely organizational: neither changes who's actually allowed to count/apply/complete —
`set_audit_team()` has no role check beyond org membership, the same staff-level, self-claimable
("I've got this one") trust `submit_audit_count()` already established, not an admin/manager-only
assignment. `inventory_audits.lead_id` is a plain nullable FK (same `on delete set null` shape
`started_by`/`completed_by`/`cancelled_by` already use); support is many-to-many, so it's a child
table (`inventory_audit_supporters`, `unique (audit_id, user_id)`) rather than a second FK column —
same real-FK-cascades-cleanly shape `broadcast_references` already established for its own member
references, not an unenforced `uuid[]`. A lead can never also appear in the support list — enforced
both client-side (the support picker's own options exclude whoever's currently selected as lead, and
picking a new lead immediately drops them out of an already-made support selection too) and, since
the client-side hint alone was never the real enforcement anywhere else in this schema either,
server-side by `set_audit_team()` itself (strips the lead from the replacement support set
regardless of what the caller actually sent). `set_audit_team(audit_id, lead_id, support_ids)` takes
the *whole* replacement set each call (not an add/remove delta) — simpler for a caller resubmitting
a multi-select's entire current selection — and only while the audit is still `in_progress`, same
restriction `submit_audit_count()` already has.

`AuditDetailComponent`'s own client-side gesture for this is an explicit Edit/Save/Cancel toggle
(`isEditingTeam`, same shape `ModalTableComponent`'s own item edit flow already establishes) rather
than saving on every individual selection change — the two dropdowns and the saved-team chips (see
below) are mutually exclusive, never both on screen at once. An "Edit" button (hidden once already
editing, and hidden entirely once the audit is no longer `in_progress`, since `set_audit_team()`
itself refuses a finished audit) opens the dropdowns via `startEditingTeam()`, which seeds them from
the audit's own current team rather than whatever was left over from a previous, since-cancelled edit
session. `onLeadChange()` still drops a newly-picked lead out of the local support selection if they
were already in it (so a lead never shows up in both lists at once even before saving), but is now a
purely local, pre-save adjustment — the actual write only happens on an explicit Save click, which
calls `saveTeam()` and, only on success, closes the dropdowns and reloads. A rejected save stays in
edit mode with whatever was entered still in place rather than reverting it — Cancel
(`cancelEditingTeam()`, which does discard back to the last-saved state) is the explicit way to throw
changes away now that one exists, so a failed Save should stay retryable/adjustable instead of being
silently thrown away for the caller to redo from scratch.

Once not editing, the saved team renders as name-plus-avatar chips instead of the dropdowns —
`InventoryAuditTeamMember` carries an `avatarKey` alongside `id`/`label` (resolved via
`resolveProfileAvatarKey()`, same shape `BroadcastReferencedMember` already established for its own
avatar+name chip), rendered through `UserAvatarComponent` in the same pill-chip visual language
`BroadcastsComponent`'s own `.broadcast-reference-chip` established, with the one lead chip given a
`primary-container` treatment (plus a small "Lead" tag) to stand out from any number of plain support
chips. These chips reflect `audit.lead`/`audit.supporters` specifically — the already-reloaded,
server-confirmed state, not the live form controls — so a name only ever appears with its icon once a
save has actually landed, never mid-edit.

`AuditDetailComponent`'s "Audit items" section renders *every* not-yet-counted item as its own
bordered card right away — the same `.task-row` visual language (surface-container-low background, a
matching 1px border, the same radius) `TaskCardComponent` already establishes — rather than a single
shared form behind a search-and-click autocomplete. Every item in an audit's scope was already added
automatically by `start_inventory_audit()` when the audit began (whole org, or whichever
`physical_location` it was scoped to), so there's nothing left to "pick": `countSearchControl` is now
a plain name filter narrowing which cards are visible, not a required selection step. Each card holds
its own independent `FormGroup` (`countFormFor()`, a `Map<countId, FormGroup>` built lazily per card
rather than one shared form, since every card is on screen and fillable/submittable at once) — Expected
quantity (a plain disabled input, the `quantity_remaining` value snapshotted at audit start, never
editable) sits directly beside Counted quantity (editable) so the figure you're comparing against is
right where you're typing the one that matters — Counted quantity's own field is wider than Expected's
(a plain read-only figure needs less room than a labeled, icon-prefixed editable one), and Notes get
their own row below with the Submit button centered beside them (the note field carries
`subscriptSizing="dynamic"` so that centering lands against its actual visible input row, not the
reserved hint/error space `appearance="outline"` otherwise always leaves below it) rather than trailing
along top-aligned in the same row as the quantity fields.
`isSubmittingCount(id)`/`countErrorFor(id)` are similarly per-item (a `Set`/`Map` keyed by count id, not
one shared boolean/string) so submitting one card's count doesn't disable or blank out any other card's
own in-progress entry. A completed/cancelled audit still shows its own leftover-uncounted items — the
same section, retitled "Not yet counted," falls back to a plain read-only name list once `isInProgress`
is false, since there's nothing left to fill in on a finished audit.

Loading a fresh `AuditDetailComponent` and re-loading it after every action on the page (submitting a
count, applying a discrepancy, completing/cancelling, saving the team) both go through the same private
`loadDetail()` — but only the very first call is allowed to toggle `isLoading` (which starts `true` as
the field's own default and is set `false` exactly once, the first time this resolves); every later
call is a silent background refresh of the already-rendered content, the same "`isLoading` only ever
toggles on the initial load" shape `ManageAuditsComponent`'s own `loadAudits()` already establishes.
`loadDetail()` used to re-set `isLoading = true` on *every* call, which meant any action — including
something as light as picking a name from the lead/support dropdowns above — tore the entire view down
to its loading skeleton and rebuilt it, reading as the whole page resetting.

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

A follow-up pass picked this shape up across nearly every other data-fetching page in the app as
each one shipped or was revisited afterward (Suppliers, Orders, Reservations, Reports, Activity
Log, both Manage's and Studio's own Error Log, Studio's Feedback/Organizations/Users and their two
entity-detail pages, Broadcasts, `ModalTableComponent`'s own supplementary loads, and the rest of
Manage Tasks'/Team's own pages beyond the one tab/section the original pass singled out) — the same
incremental, by-attrition adoption `_skeleton.scss`'s own doc comment above describes for the
skeleton-loading sweep, rather than a second coordinated pass. `HomeComponent`'s personal "What's on
your plate" section, `ManageBillingComponent`, and `StudioComponent`'s own headline stat-grid close
out three of the remaining gaps this way — Home in particular is the app's single highest-traffic
page, where "nothing assigned to you" vs. "the query silently failed" is the most consequential
place in the app for that ambiguity to exist. `HomeComponent.personalStatsError` covers just its
three-list section specifically (loadPersonalStats()'s three queries) — the rest of the page (hero,
nav-card grid, getting-started card) renders regardless of whether that section's own load
succeeded, so there's no single whole-page `isLoading`/`loadError` gate the way a plain list page
has. `StudioComponent.loadError` is scoped to `loadStats()` specifically, not `loadPendingBadge()`'s
own independent feedback-count query — the same "just a badge, no real empty-vs-broken ambiguity"
reasoning `ManageComponent`'s own hub-card counts and `HeaderComponent`'s own badges are left out of
this pattern for. `ManageDangerZoneComponent`, `AccountComponent`, `ManageComponent`'s hub badges,
and `SettingsComponent` (which doesn't own a `site_settings` fetch itself at all — that's
`SiteSettingsService`'s job once at app startup, not this page's own `ngOnInit()`) remain
deliberately out of scope: none of them render a list whose "empty" and "broken" states are
actually ambiguous the way this pattern exists to resolve.

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
`prefers-reduced-motion` the same way every other animation in this app already does. This started
as a first pass on just the two busiest pages, not a coordinated app-wide sweep — but the same
`.skeleton-line`/`-block`/`-circle` shape (each page composing its own bespoke card/row/table
arrangement, per that partial's own doc comment) was picked up incrementally by nearly every other
data-fetching page as it shipped or got revisited afterward (Reservations, Orders, Suppliers,
Reports, Billing, Activity Log, Error Log, Team, Account, every Studio page, Broadcasts), and
`PendingApprovalComponent` — the join-request "awaiting approval" screen, the last page-level
loading state anywhere in the app still showing a bare `mat-spinner` — was converted to the same
shape once it was the only one left, closing out what had been an unfinished sweep by attrition
rather than by design. The cascade-in stagger paired with the skeleton on Inventory/Tasks above is
a separate, deliberately narrower touch (see its own paragraph just above) — picking up the
skeleton shape elsewhere never implied picking up the stagger too, and it hasn't spread the same way.

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
`mat-table`) of every org — name, created date, member count, item/task/storage usage (see the later
`add_platform_organization_task_count` paragraph below for how), last-active date, active/deleted
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

`StudioComponent`'s own hub picked up a headline stat-grid above its three cards — the
platform-admin counterpart to `manage/reports`' own stat tiles, giving this hub an actual
"state of the business" glance instead of just three navigation links. Five plain head:true/count
queries (organizations active-count, organizations created in the last 7 days, approved profiles,
open feedback, and non-development `client_error_log` rows in the last 24 hours), same convention
`ManageComponent`'s own `ngOnInit()` already uses for its three pending-queue badges — no new RPC or
view, this schema already grants a platform admin cross-org read on every table involved. The
24-hour error count is filtered client-side against the fetched rows' own `app_env` rather than a
SQL `.neq('app_env', 'development')`, since `x != y` evaluates to `NULL` — not true — when `x` is
`NULL` in Postgres, which would have silently excluded a null `app_env` row instead of counting it
as "not development" the way `StudioErrorLogComponent`'s own equivalent, already-shipped check
(`row.app_env !== 'development'`) does. `.stat-grid`/`.stat-tile`/`.stat-label`/`.stat-value` are
duplicated from `manage/reports` rather than shared, matching this app's own convention of not
centralizing every small presentational pattern (the icon-chip gradients are the other standing
example of this).

`StudioOrganizationsComponent`'s own table rows are now clickable — the whole `<tr>` (same
`role="button"`/`tabindex="0"`/`(keydown.enter)`/`(keydown.space)` whole-row-is-a-button shape
`TaskCardComponent`'s own `.task-row` already establishes) navigates to `studio/organizations/:id`
(`StudioOrgDetailComponent`), a dedicated page for that one org: its own created date/status, a
member list (name, role badge, a "Pending" badge for an unapproved join request, and the same
online-dot/"last seen" presence treatment `ManageTeamComponent`'s own per-member indicator uses),
the org's 5 most recent feedback submissions (reusing `StudioFeedbackComponent`'s own new/reviewed/
resolved status-badge colors), its 5 most recent client errors, and (see the later
`add_platform_organization_task_count` paragraph below for how) its inventory item and task counts.
The first three come from tables a platform admin already has cross-org SELECT on (`profiles`/
`feedback`/`client_error_log`, see `add_platform_admin` above). Self-loaded in `ngOnInit()` from
just the `:id` route param (an
`organizations.select('*').eq('id', id).maybeSingle()` lookup, then the member/feedback/error
queries filtered by that same id, the feedback/error ones capped at 5 each via
`order(created_at desc).limit(5)`) — a missing/inaccessible id renders a "doesn't exist, or you no
longer have access" empty state with a link back to Organizations, and a genuine fetch error gets
the same `loadError`/retry treatment this app's five highest-traffic pages already established,
rather than either case reading as a blank or broken page.

This was originally a popup (`OrgDetailModalComponent`, opened via `MatDialog.open()`) before a
follow-up pass converted it — the first of what's meant to be a broader "convert Studio's info
drill-downs from popups to real pages" sweep, revisited page-by-page elsewhere in the app once
Studio itself was settled. `BreadcrumbsComponent` gained a `labelOverride` input to support this:
every other page's breadcrumb label comes from static route `data`, but an entity-detail page's
real label (the org's name here) isn't known until its own async load resolves, so the route's
`data.breadcrumb` is just a placeholder ("Organization") that `[labelOverride]="organization?.name"`
overrides once the fetch completes — falling back to that placeholder for the brief window before
it does. `STUDIO_ORGANIZATIONS_BREADCRUMB_PARENT` (`app-routing.module.ts`) gives the page its own
"Home / Organizations / {org name}" crumb — the list you actually drilled in from, one level short
of the full "Home / Studio / Organizations / {name}" chain, since `BreadcrumbParent` only ever
supports a single hop (same limit `MANAGE_BREADCRUMB_PARENT`/`STUDIO_BREADCRUMB_PARENT` already
accept for every other nested page in this schema). That single-hop limit was later lifted, just
for `StudioUserDetailComponent` — see its own paragraph further down for `BreadcrumbsComponent`'s
new `secondaryParent` input, a second, genuinely linkable hop.

A fourth Studio card, **Users** (`StudioUsersComponent`, `studio/users`), is the opposite direction
from Organizations' own org-first browse — a support conversation usually starts from a name or an
email, not an org, so this is a cross-org lookup: type into a search field and every matching
profile (name/email substring, case-insensitive) shows up with its org, role, and approval status,
each row linking to the exact same `StudioOrgDetailComponent` page Organizations' own rows link to
(finding someone and then seeing their org's full context is one click, not a second lookup).
Deliberately search-first rather than browse-first — nothing renders until a search term narrows
it, both because "browse everyone" is already Organizations' own job (via its member counts) and
because a platform-wide profile list only grows as the product does; results are capped at 25 with
a "showing N of M" hint above the table once a search matches more than that. Matching is a plain
client-side substring filter over a `profiles` list loaded once on init (same "load once, filter in
memory" shape `ManageTeamComponent`'s own team search already uses) rather than a server-side
`ilike` search this app has no other precedent for — the platform's total user count is still small
enough for this to stay cheap, and avoids the escaping complexity a raw `.or()`/`ilike` filter
string built from unsanitized user input would otherwise need. Reads the same two cross-org-granted
tables Organizations' own page already does (`profiles`/`organizations`) — no new policy.

`StudioOrgDetailComponent` is also where a platform admin actually acts on an org, via a "Platform
actions" section above the read-only Members/feedback/errors sections — the last of the four
Studio admin features from this same pass. Two distinct, deliberately separate levers, each for a
distinct trigger: **Suspend** is an immediate, fully reversible access block for abuse or
non-payment (does *not* start any delete countdown — an org can sit suspended indefinitely until a
platform admin lifts it), while **Retire** is the platform-side counterpart to
`ManageDangerZoneComponent`'s own self-service "Delete organization" — the exact same
`organizations.deleted_at` soft-delete-then-30-day-purge mechanism, just triggerable by a platform
admin on *any* org rather than only that org's own admin on their own, and deliberately labeled
"Retire" here (not "Delete") since the trigger this pass was built for is a concluded contract, not
abuse — a distinct enough mental model from the self-service flow's own framing to deserve its own
word even though the underlying column is identical. `platform_suspend_organization()`/
`platform_unsuspend_organization()`/`platform_retire_organization()`/`platform_restore_organization()`
(`add_platform_org_suspension_and_retirement` migration) are four new `SECURITY DEFINER` RPCs,
platform-admin-gated exactly like every other cross-org write in this schema
(`is_platform_admin()`, see `add_platform_admin`) — `restore_organization` also happens to be the
self-service "undo" `add_organization_deletion`'s own comment had flagged as not existing yet
("Recovery today is a manual update... no self-service UI yet"); it's still not self-service for an
org's own admin, but at least no longer a manual SQL statement run by hand against the hosted
project. Suspension adds `organizations.suspended_at`/`suspended_by`/`suspension_reason`, and
folds `suspended_at is null` into `current_user_org_id()` right alongside its existing
`deleted_at is null` check (diffed against `fix_org_isolation_bugs`'s version per this repo's own
"diff against the previous version" lesson) — the same single choke point every org-scoped RLS
policy in this schema already reads, so a suspended org's members lose all data access immediately,
schema-wide, with no per-policy changes needed, exactly mirroring how a retired org already worked.
In practice this means a suspended org's members hit the same "We couldn't find your account"
`PendingApprovalComponent` state a retired org's members already did — `approvedGuard`'s own
`getProfile()` call returns null once the RLS SELECT policy denies it, no new copy or guard logic
needed. `suspendOrganization()` opens a new `SuspendOrganizationModalComponent`
(`shared/components/suspend-organization-modal`) for a mandatory reason (same "a consequential-but-
reversible action should still say why" reasoning `DiscardModalComponent`'s own mandatory reason
field already established, simpler than `DeleteOrganizationModalComponent`'s type-to-confirm shape
since suspension is fully reversible); `retireOrganization()` reuses
`DeleteOrganizationModalComponent` as-is (it already just takes an org name, no assumption baked in
that the caller is that org's own admin); `unsuspendOrganization()`/`restoreOrganization()` both use
the plain `ConfirmDialogComponent`. Every action mutates `this.organization` in place on success
rather than navigating away or refetching — the page itself is the only thing that needs to reflect
the change now (unlike the old popup, which had to keep a caller's own list row in sync via a
shared object reference; a page reload of `StudioOrganizationsComponent`'s own list picks up the
change naturally on next visit). `StudioOrganizationsComponent`'s own status badge gained a third
state (`Active`/`Suspended`/`Retired`, precedence in that order — a retired org's badge wins even if
it was suspended first), and its `.org-row-deleted` muting class was generalized to
`.org-row-inactive` to also cover a merely-suspended (not yet retired) row.

A follow-up polish pass reordered `StudioOrgDetailComponent`'s own sections and tightened two
details. "Platform actions" moved from right under the meta `dl` to the very bottom of the page,
after Members/Recent feedback/Recent errors — reading the org's own read-only context first, with
the consequential actions only after, rather than leading with them. "Recent feedback" became a
`mat-accordion` (one `mat-expansion-panel` per entry, same title/description header shape
`ManageTeamComponent`'s own per-member panels already establish) instead of a single-line,
`[title]`-tooltip-truncated row — a feedback message is often too long for one line, and hovering
for a native tooltip was a poor way to actually read it; expanding the panel now shows it in full.
"Retire organization" gets a hardcoded solid red (`--app-danger-bg`/`--app-danger-on-bg`, via the
button's own `--mat-button-filled-container-color`/`-label-text-color` tokens) instead of Material's
theme-following `color="warn"` — since an org can pick its own color theme (see `THEME_PRESETS`),
`warn` isn't guaranteed to read as an unambiguous red the way this one-way, semi-permanent action
needs to; same "deliberately reads as riskier than everything around it" reasoning `ManageComponent`'s
own Danger Zone card and `PageHeaderComponent`'s own `variant="danger"` already establish with their
own hardcoded reds. Suspend's own button stays plain `color="warn"` — it's fully reversible, so a
lighter, theme-following touch is still appropriate there.

A second follow-up gave "Recent errors" the exact same `mat-accordion` treatment "Recent feedback"
got above (both now share one `.recent-list-accordion`/`.recent-entry-message` styling, since
they're structurally identical apart from the feedback panel's own leading status badge) — an error
message can run just as long as a feedback one, so the same single-line/`[title]`-tooltip
limitation applied equally to both; the header's own title text gets an explicit ellipsis rule
(`.recent-entry-title`) that feedback's own title never needed, since feedback's title is always
just a short type label while an error's title *is* the (potentially very long) message itself.
Also added a persistent "Back" button (a plain `.back-row`, deliberately its own row above
`app-page-header` rather than that component's own trailing-action slot — this reads as leaving the
page entirely, a different weight than an action that stays on it, so it sits above the org's own
name/logo rather than beside it) — visible immediately regardless of load state, rather than only
appearing inside the `notFound` empty state as it originally did (that empty state's own button was
removed once this permanent one existed, so the two didn't duplicate the same affordance on the same
screen). A third follow-up gave the page header itself the org's own uploaded logo in place of the
generic `apartment` icon, whenever that org has one: `PageHeaderComponent` gained an optional
`logoUrl` input that swaps in an `<img>` (and the chip's own gradient background for a neutral one —
see that component's own doc comment for why a gradient tuned for a plain icon glyph doesn't suit an
arbitrary logo image) — the first `PageHeaderComponent` usage in the app whose own identity is a
specific *entity* rather than the page itself. Resolved via
`SiteSettingsService.loadLogoUrlForOrganization(id)`, an already-existing method (originally built
for the register page's own invite-link logo preview) that reads any org's branding by id regardless
of the caller's own — `site_settings`' branding columns are anon/authenticated readable schema-wide,
unlike every other org-scoped table here, so this needed no new RLS policy.

Building the original `OrgDetailModalComponent`'s own action-opening methods (back when this was
still a popup) surfaced a real Angular DI footgun worth remembering, since it'll resurface the
moment any *other* dialog-content component needs to open further dialogs of its own:
`MatDialogModule`'s own `NgModule` declaration carries `providers: [MatDialog]` (visible in Angular
Material's own compiled metadata) *in addition to* `MatDialog`'s tree-shakable `providedIn: 'root'`
— meaning a standalone component that both (a) is itself rendered as a dialog's content (needing
`mat-dialog-title`/`-content`/`-actions` in its own template) *and* (b) opens further dialogs of its
own via `inject(MatDialog)`, gets a second, module-scoped `MatDialog` instance if it imports the
*whole* `MatDialogModule` — silently shadowing the app-wide root instance for that one component.
Invisible in the running app (each dialog still opens and tracks itself correctly regardless of
which instance's stack it's on), but it breaks spying on the root `MatDialog` from a test —
`TestBed.inject(MatDialog)` resolves the true root singleton, while the component under test holds
the shadowed one, so `spyOn(dialog, 'open')` silently never intercepts anything and the component
always exercises a *real* (never-resolving, since nothing in the test env can close it) dialog
instead. `ModalTableComponent` — this schema's other example of a "dialog content that opens
further dialogs" shape — never surfaced this, simply because its own spec never once spies on
`MatDialog.open()`. The fix at the time: import the individual `MatDialogTitle`/`MatDialogContent`/
`MatDialogActions` standalone directives instead of the whole module — they carry no such provider
baggage. Moot for this specific component now that it's a page rather than dialog content at all
(no `mat-dialog-*` directives needed, so no `MatDialogModule` import, so no shadowing possible —
just a plain `inject(MatDialog)` to open its three leaf dialogs, same as
`ManageDangerZoneComponent`'s own shape), but worth remembering generally for `ModalTableComponent`
or any future dialog-in-dialog component: an NgModule imported into a standalone component's own
`imports` array can carry provider side effects well beyond the directives/pipes it's there for.

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

A follow-up pass gave `PageIntroComponent` a bigger, more deliberate splash — the original shipped
as a flat, single-line `surface-variant` bar (small icon, one line of text, a plain icon-button `X`)
that read as a system notice rather than a first impression, easy to miss entirely. The redesign
borrows this app's existing bold treatments rather than inventing a new one: `EmptyStateComponent`'s
circular gradient icon badge (scaled up further, since this is the one focal point of a first visit
to a page rather than an already-empty list) and a diluted two-tone gradient wash + border mirroring
`PageHeaderComponent`'s own `zone` treatment, in place of the old flat fill. A new required `title`
input (a short "Welcome to X" heading, picking up this app's global `h1`-`h4` display-font rule) sits
above the existing `text` body copy, and a labeled "Got it, thanks" `mat-flat-button` sits alongside
(not instead of) the small corner-`X` — a real, deliberate dismissal action rather than only a small
icon easy to misclick past. All three consumers (Inventory/Tasks/the Manage hub) picked up a matching
`title` and slightly tightened `text` alongside the component change.

Its placement also moved, same pass — originally the last thing rendered before a page's own content
(below the `.page-hero` band, sharing that section's own `@if`), it settled between `.back-row` and
`.page-hero`: breadcrumbs, then Back, then the welcome card, then the hero, then the page's own
content — below the navigation row rather than interrupting it, and still ahead of the hero it's
introducing rather than trailing below it. On Inventory/Tasks specifically this puts it back inside
the page's `@if (!selectedItem)`/`@if (!selectedTask)` block the hero/back-row already share (it had
briefly rendered unconditionally, a leftover of being a late addition tacked on after both `@if`s
rather than a deliberate choice) — which also means it no longer shows at all while viewing a
specific item/task's own detail view, matching the hero's own scoping.

Admins and managers get a `manage/release-notes` route (`ManageReleaseNotesComponent`, `manageGuard`)
— a read-only "What's new" list of shipped features, reachable only via a card on the Manage hub
(admin/manager-only for now, since the Manage hub is the only place it's linked from — a natural
future extension is surfacing it to every role once it has a home outside that hub). This used to be
a section on the Help page itself, then a hand-maintained `CHANGELOG_ENTRIES` array
(`shared/models/changelog.ts`) kept alongside CLAUDE.md's own running log — it's now backed by a real
`release_notes` table (`add_release_notes` migration, see the Supabase Schema section below), so a
platform admin can post/edit/delete entries from Studio at runtime instead of a code change. Every
entry carries a `severity` (`standard`/`emphasized`/`critical`) that drives distinct styling —
`ReleaseNoteSeverity` and the shared `RELEASE_NOTE_SEVERITY_LABELS`/`RELEASE_NOTE_SEVERITY_OPTIONS`
live in `shared/models/release-note.model.ts`. `standard` (the common case) renders identically to the
list's original plain styling; `emphasized` and `critical` each get a colored left accent, a matching
tinted background wash, and a small uppercase pill badge naming the tier — reusing this app's existing
`--app-warning-*`/`--app-danger-*` badge-pill token pairs (amber, then red) rather than inventing a
third "highlight" color, the same escalation the low-stock/out-of-stock status pills already use for
"notable" vs. "urgent." `shared/utils/release-notes.ts` (`loadReleaseNotes()`/`createReleaseNote()`/
`updateReleaseNote()`/`deleteReleaseNote()`) is the shared read/write layer both pages sit on top of —
plain Supabase calls, no RPC, since `release_notes`' own RLS (`is_platform_admin()`-gated writes, any-
authenticated-user reads) is a flat check with no atomic multi-table side effect the way e.g.
`create_broadcast()` needs. `shared/utils/changelog.ts` (kept, despite the underlying data no longer
being a static "changelog") still builds the unseen-count badge on top of the list
(`getUnseenChangelogCount()`/`markChangelogSeen()`, both `localStorage`-backed and per-user like
`PageIntroComponent`'s own dismissal, not per-organization, under the same `shelf-sync:changelog-last-
seen:<userId>` key this always used — kept unchanged so switching to a DB-backed list didn't reset
every existing user's read/unread state) — the very first time this is ever checked for a user with no
stored value at all, it bootstraps them as caught-up-as-of-now rather than surfacing every entry that
ever shipped before they first looked, the same way a freshly-connected email inbox doesn't
retroactively mark years of old mail unread. Unlike its original static-array version,
`getUnseenChangelogCount()` is now async (it issues its own narrow `release_notes` query, just
`posted_at`, since a hub badge doesn't need the full title/description text every row also carries) and
takes a Supabase client alongside the userId; `markChangelogSeen()` takes the caller's own already-
loaded newest `postedAt` directly rather than re-deriving it, since both `ManageReleaseNotesComponent`
and `StudioReleaseNotesComponent` already have their freshly-loaded list in hand by the time they call
it. `ManageComponent` badges this count on its own Release Notes card, same treatment its
Inventory/Tasks/Team cards already give their own pending-request counts even though this isn't an
approval queue — folded into `ngOnInit()`'s existing `Promise.all` alongside those now that it's a real
query, rather than set synchronously beforehand. Visiting `manage/release-notes` is what actually
clears it: `ManageReleaseNotesComponent.ngOnInit()` calls `markChangelogSeen()`, and the Manage hub's
own next load picks that up.

Writing a release note is Studio-only — `studio/release-notes`/`StudioReleaseNotesComponent`
(`platformAdminGuard`), a full create/edit/delete CRUD page alongside Manage's read-only one, both
reading the same platform-wide table. This is genuinely global content (every organization sees the
exact same list), so authorship belongs with the app's own maintainer, not any org's own admin/manager
— `release_notes` has no `organization_id` column and no per-org policy join anywhere, the first table
in this schema like that. Structurally this started as the same near-identical-fork shape
`StudioErrorLogComponent` already established for forking a `manage/*` page onto Studio, then grew real
CRUD once the underlying data moved off a static array — `manage/release-notes` is gated by
`manageGuard` (org role admin/manager), which `is_platform_admin` doesn't imply (the two are
deliberately orthogonal — see Studio's own intro paragraph above), so a platform-admin-only account
with no elevated role in their own org would otherwise have no way to even *see* what shipped, let
alone post it. A "New release note" button opens `ReleaseNoteFormModalComponent`
(`shared/components/release-note-form-modal`) — self-contained like `BroadcastModalComponent`/
`SupplierFormModalComponent` (it does the actual `createReleaseNote()`/`updateReleaseNote()` write
itself), title/description/severity/posted-date fields, `data.releaseNote` optional-means-create same
shape those two already use. Each row gets Edit/Delete icon buttons (`ConfirmDialogComponent` gates
delete, `danger: true`, matching every other permanent-delete confirm in this app) — no extra
client-side role gate needed beyond the route's own `platformAdminGuard`, since only a platform admin
ever reaches this page at all. No realtime subscription (unlike this page's closest sibling,
`BroadcastsComponent`) — with a single platform-admin audience, "someone else changed this while I was
looking" isn't a real scenario the way it is on a multi-editor page. `StudioComponent` badges its own
Release Notes card the same way `ManageComponent` already does (`unseenReleaseNotesCount`, awaited
alongside `loadPendingBadge()`/`loadStats()` in `ngOnInit()`'s own `Promise.all`, not folded inside
`loadStats()` itself — this count has no "genuinely broken vs. empty" ambiguity worth its own
`loadError`/retry treatment the way that method's five queries do) — and since
`getUnseenChangelogCount()`'s `localStorage` key is per-user, not per-page, visiting either hub's
Release Notes page clears both hubs' badges together.

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

The Account page's profile-info card got its own Edit/Save/Cancel flow (same shape
`ModalTableComponent`'s own item-edit flow already established) so a signed-in user can update their
own full name, nickname, and email — previously read-only `<dd>` text with no way to change any of
it short of an admin/manager editing it for them via Manage > Team (see
`EditProfileModalComponent`'s own paragraph just below — a different, older, admin-only feature this
is deliberately *not* merged into: that dialog edits *any other* member's profile including role,
from the team roster; this is a person editing their *own* row, with no role field at all, since a
self-service role change would be a privilege-escalation path this schema has always kept RPC-only
regardless of who's asking). What's actually editable is role-gated client-side, not at the RLS/grant
layer — `full_name`/`nickname`/`email` have shared one flat, no-privilege-distinction-to-protect
column grant since the day each was added (same reasoning `add_last_active_at_to_profiles`'s own doc
comment already gives for `avatar_key`/`last_active_at`), so a staff member could already write any
of these to their own row directly before this existed; `AccountComponent.canEditFullProfile`
(`authService.canManage()`) simply curates which fields the *form* offers — full name and email stay
plain read-only text for a staff viewer even while editing, nickname stays editable for everyone —
the same "UI-only kill switch, nothing behind it at the RLS layer" shape `BARCODE_FEATURE_ENABLED`
already establishes. `startEdit()` still enables/disables the full-name/email `FormControl`s per that
same check (mirroring `ModalTableComponent.startEdit()`'s own `canEditPriceSupplier`-gated
enable/disable pair) so `saveProfile()`'s `getRawValue()` still round-trips a disabled control's
seeded, unchanged value — a staff save can never accidentally null out a full name/email it was never
offered a way to touch. Email carries a `HelpTooltipComponent` clarifying it's where ShelfSync sends
notifications (see `send-notification-email`'s own section below), not the Supabase Auth credential
used to sign in — the two are genuinely separate values (`profiles.email` vs. `auth.users.email`),
and changing this field doesn't touch the latter; `ChangePasswordModalComponent`'s own "Change
password" button is the only thing on this page that touches real Auth credentials. Organization and
Role stay plain read-only text in both view and edit mode regardless of role — organization identity
isn't a per-profile field to begin with, and a role change (self or otherwise) only ever happens
through `admin_set_user_role()`, whether that's reached via `EditProfileModalComponent` on the team
roster or, in principle, anywhere else.

Manage > Team's own admin-only `openEditProfile()` (`EditProfileModalComponent`) predates the
Account page flow above and solves a different problem: an admin editing *someone else's* full
name/nickname/email *and role* from the team roster, gated behind `authService.role() === 'admin'`
specifically (stricter than the usual admin-or-manager `canManage()` — a manager can't reach this
dialog at all) rather than `manageGuard`'s broader admin-or-manager reach, since a role change is the
one field in that dialog that's genuinely privileged. Its Edit button has no guard against opening it
on the caller's own row the way the neighboring Remove button does (`@if (member.profile.id !==
currentUserId)`) — an admin *can* self-edit their own role through it today, but only ever a lateral/
downgrade move (choosing a role other than the one that already got them onto this admin-only
button), never an escalation, so this was left as-is rather than added to this pass's scope.

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

A follow-up design pass gave Home's own hero band — previously unique to that one page — to
Inventory, Tasks, and the Manage hub too, the three other pages one tap away from it in the nav
drawer, on the reasoning that a bold, "this is a real destination" entrance shouldn't be reserved
for the app's front door alone. The gradient/glow-blob backdrop, kicker chip, and pulse-row stat
chips (previously hand-rolled directly in `home.component.scss`/`.html`) moved out to a new
`shared/styles/_page-hero.scss` partial — same `@use`-per-consumer convention `_skeleton.scss`/
`_stagger.scss`/`_realtime-flash.scss` already established — so `HomeComponent` itself was
refactored onto the shared classes rather than kept as a fourth, slightly-different copy. Each
consumer's kicker/pulse-row content is its own, drawn from data that page already has loaded rather
than a new query: Inventory's kicker is its own active item count, its pulse row low/out-of-stock
plus checked-out counts; Tasks' kicker is its open task count, its pulse row overdue/due-today/
transfer-offer counts; the Manage hub's kicker is the signed-in org's own name
(`authService.organizationName()`), its pulse row retirement-request/task-transfer/unseen-release-note
counts (the same three badge counts `ManageComponent.ngOnInit()` already loaded for its own cards).
The Manage hub's own hero is a quieter cut — `.page-hero-quiet`, less padding and a capped heading
size — since it's one click deeper than the other three and reads as competing with them at full
strength.

`PageHeaderComponent` — the compact icon-chip header every `manage/*` sub-page already used —
picked up a matching but lighter-weight upgrade of its own via a new opt-in `zone` input
(`'inventory' | 'team' | 'insights' | 'admin'`, matching `ManageComponent`'s own four card groupings
exactly): a diluted two-tone gradient wash behind the whole header, an oversized low-opacity
watermark of the page's own `icon` bleeding off its right edge, and a thin primary->tertiary
gradient rule under the title. Unset by default (every existing usage keeps rendering exactly as
before), it's now set on all 13 real page usages of this component — Inventory/Suppliers/Orders/
Reservations get `zone="inventory"`, Tasks/Team get `zone="team"`, Activity/Release Notes/Reports/
Error Log get `zone="insights"`, Billing/Settings get `zone="admin"` — while Danger Zone keeps its
own distinct flat-red `variant="danger"` treatment instead of joining the Admin wash (same
"deliberately reads as riskier than its siblings" reasoning its icon chip already had), and every
dialog-content usage (`ModalTableComponent`, `TaskDetailModalComponent`) leaves `zone` unset
entirely, since a colored wash/watermark suits a full page, not a dialog. Studio's own
`PageHeaderComponent` usages were left out of this particular pass — Studio has no equivalent
four-section grouping to key a zone off of — but picked up a matching `zone="studio"` (see this
input's own doc comment) in a later follow-up, once Studio had enough flat sub-pages
(`Feedback`/`Error Log`/`Organizations`/`Users`, since joined by `Usage`/`Email Log`/`Audit Log`) to
make one shared wash worth adding; `StudioOrgDetailComponent`/`StudioUserDetailComponent` still
leave it unset, same "entity-detail drill-down, not a top-level destination" reasoning every other
detail page's exemption above already has.

A second new `[headerFigure]` content-projection slot lets a caller swap the header's plain icon
chip for a live figure instead — wired up on the three pages that already had one obvious headline
stat previously buried in a card below the fold: `RingStatComponent` now sits directly in Reports'
own header (`completionRatePercent`, the same figure its "Task throughput" card already showed and
still does — duplicating a headline number into the header rather than moving it, the same "echo up
top, detail below" shape `HomeComponent`'s own pulse row already has with its own list cards),
Billing's (`usagePercent(storageUsedMb, currentTier.limits.storageLimitMb)`, reusing that page's own
existing helper), and Team's (a new `onlinePercent` getter — approved members currently online, as a
percentage of the whole team).

Every top-level page reachable directly from the header's nav drawer/quick menu — Inventory, Tasks,
Manage, Reservations, Help, Account, and Studio — now also shows a plain "Back" button
(`routerLink="/home"`) right above its heading/hero, alongside (not replacing) the breadcrumb trail
that was already there; Home itself is the one exception, same "nowhere to go back to" reasoning its
own missing breadcrumbs already have. Inventory and Tasks already had a `.back-row` for leaving an
item/task's own in-place detail view — the new "back to Home" button reuses that identical class
rather than inventing a second one, since the two meanings are mutually exclusive (a page only ever
shows one at a time: leaving a detail view, or browsing). `.back-row`'s own layout (previously
copy-pasted identically into seven-plus component stylesheets, `StudioOrgDetailComponent` first)
moved into the shared `_page-toolbar.scss` partial alongside `.page-toolbar` itself, since every
consumer already `@use`s that partial for its breadcrumb row anyway — `ModalTableComponent` is the
one holdout, keeping its own local rule (a different margin, no `.page-toolbar` of its own to sit
under).

Admins and managers can post org-wide "Broadcast" announcements — a title, a message, and
optionally references to specific team members and/or inventory items — via a new `/broadcasts`
route (`BroadcastsComponent`). Same tier as `manage/reservations`: `approvedGuard` only, not
`manageGuard` — every approved org member reads the feed, but the "New broadcast" button
(`authService.canManage()`) and, for real, `create_broadcast()` server-side both gate who can
actually post one. Posting fans out to every other approved org member as an in-app notification
(a new `'broadcast'` `notifications.kind`, reusing the existing bell dropdown — see that feature's
own paragraph above) and an `activity_log` entry, all as one atomic `SECURITY DEFINER` RPC call
(`create_broadcast()`) rather than a plain insert, since a plain RLS `with check` can't express
fanning out to two other tables — same reasoning `create_reservation()` already established.
Deliberately **in-app only, no email** — unlike the four email-backed notification kinds
(`add_notification_email_webhooks`), the bell already covers "seen it or not" for this one, and a
broadcast is inherently a lower-urgency, browse-when-you-get-to-it kind of message than "a task was
just assigned to you." An author can edit or delete their own post afterward (a typo shouldn't need
a follow-up broadcast to fix) — plain RLS scoped to `created_by = auth.uid()`, no RPC needed for
either, unlike creation itself. References are stored in `broadcast_references`, a polymorphic
child table (`reference_type` `'member'` or `'inventory_item'`, exactly one of `member_id`/`item_id`
set) rather than two `uuid[]` columns directly on `broadcasts` — same "child table, org isolation
via the parent join" shape `inventory_item_containers`/`orders`/`discards` already use, so each
reference keeps a real FK (cascading away cleanly if the referenced member/item is later removed)
instead of an unenforced array of ids. The page itself (`BroadcastsComponent`) follows the same
realtime-subscribe-plus-flash/`loadError`-retry/skeleton-card shape `ManageReservationsComponent`
already established — one live-updating feed, newest first, each card showing its references as
small chips (a referenced member's avatar+name, or a referenced item deep-linking to
`/inventory?item=<id>`, the same personal-stats deep link `HomeComponent`'s own "what's on your
plate" section already uses). `BroadcastModalComponent` (self-contained, like
`PlaceOrderModalComponent`/`PlaceReservationModalComponent` — it does the actual write itself)
serves both create and edit, same optional-`data.broadcast`-means-create shape
`SupplierFormModalComponent` already uses; its two reference pickers are plain `mat-select multiple`
lists (this app's first multi-select-with-more-than-a-handful-of-options case, but consistent with
`DiscardModalComponent`'s own reason field rather than introducing a chip-autocomplete pattern this
app has never used anywhere else). Linked from the nav drawer and available as a Quick Menu option,
both right alongside Reservations, matching that page's own "every approved member can reach it"
tier.

A platform admin can lock a specific person's account across every org — for a malicious
individual, as opposed to `platform_suspend_organization()` (blocks a whole org). Reached via a new
`studio/users/:id` route (`StudioUserDetailComponent`) — the first per-*user* Studio detail page
(Studio's info drill-downs had only ever gone as far as per-*org*, `StudioOrgDetailComponent`).
`StudioUsersComponent`'s own search results now link here instead of straight to the matched
person's org page, and a member row on `StudioOrgDetailComponent` itself is now clickable too,
landing on the same page — so both the "start from a name/email" and "start from an org" paths this
app already had converge on one place to actually see a person's own info, which is where the lock
toggle lives. That page itself mirrors `StudioOrgDetailComponent`'s own shape closely (meta list,
"Platform actions" section at the bottom, same skeleton-loading/`loadError`-retry/`notFound`-empty-
state treatment) but with a `mat-slide-toggle` instead of that page's own plain suspend/retire
buttons — a single "can this person use ShelfSync right now" boolean reads more naturally as a
toggle than an org's own three-state suspend/retire ladder does. Toggling it on opens
`LockUserAccountModalComponent` for a mandatory reason (the same "consequential but reversible, so
just ask why" shape `SuspendOrganizationModalComponent` already established); toggling it off is a
plain `ConfirmDialogComponent`, same asymmetry `StudioOrgDetailComponent`'s own suspend/unsuspend
pair already has. The toggle's own visual state is reverted synchronously in `onLockToggleChange()`
before either dialog even opens, rather than left showing Material's own optimistic click-flip
while the async round-trip is still pending, and `lockAccount()`/`unlockAccount()` each set
`toggle.checked` again explicitly once their own RPC genuinely succeeds — both direct writes to the
`MatSlideToggle` instance itself (the `change` event's own `source`), not left to the parent
template's `[checked]="isLocked"` binding to notice the profile mutation and re-push the value on
its own; that indirect path is what let the toggle visibly drift out of sync with the real,
already-committed lock state in practice, caught after this shipped. A platform admin can't lock
their own account (checked both server-side in
`platform_lock_user_account()` and client-side via the toggle's own `disabled` binding, so it fails
loud from the RPC instead of silently if that guard is ever bypassed) — there'd be no way back in
to undo it.

Building `LockUserAccountModalComponent` also surfaced a real, pre-existing bug — its own
`<form (ngSubmit)="confirm()">` has no `[formGroup]` (`reasonControl` is a bare `FormControl`, not
wrapped in one), so nothing actually provided Angular's `ngSubmit` output without `FormsModule`
imported alongside `ReactiveFormsModule`: `NgForm`'s own selector
(`form:not([ngNoForm]):not([formGroup])`) is what listens for the native `submit` event and calls
`preventDefault()` before emitting `ngSubmit`, and it comes only from `FormsModule`, not
`ReactiveFormsModule`. Angular's `strictTemplates` checking (on in this project) doesn't catch a
missing *event* binding the way it does a missing property one — any string is a legal event name
to listen for via `addEventListener`, so `(ngSubmit)="confirm()"` compiled fine while silently never
firing. In practice this meant clicking the submit button fell through to the browser's own native
form submission instead — a real page reload, with `confirm()` never actually running — the exact
"why did the page just reload, and why didn't my change take effect" report that caught it. This
turned out not to be unique to this new component: `SuspendOrganizationModalComponent` and
`DeleteOrganizationModalComponent`, both templates this one was directly copied from, had the
identical bare-`<form>`-no-`FormsModule` shape and the identical latent bug — never caught by their
own existing tests, since those call `confirm()` directly rather than dispatching a real `submit`
event, the same gap that let this ship unnoticed in the first place. All three now import
`FormsModule` alongside `ReactiveFormsModule` (a safe, standard combination — `NgForm` doesn't
require any `ngModel`-bound children to do its native-submit-interception job, so it coexists fine
with each of these forms' own reactive-driven `[formControl]`s), and all three gained a real
DOM-level regression test (dispatching an actual `submit` event and asserting both
`defaultPrevented` and that the dialog closed with the right value) precisely because a
direct-method-call test can't catch this class of bug. Every *other* form-bearing component in this
app was swept for the same shape at the time and confirmed safe — each already binds `[formGroup]`
on its own `<form>`, which provides `ngSubmit` via `FormGroupDirective` regardless of whether
`FormsModule` is imported.

The same shape recurred later in `AuditDetailComponent`'s "Audit items" card (the redesign that
gave every not-yet-counted item its own `<form (ngSubmit)="submitCount(count)">`, each field bound
via its own `[formControl]` rather than a `[formGroup]` on the `<form>` itself) — built well after
the sweep above, so it wasn't covered by it, and shipped with the identical bug: no `FormsModule`,
so `ngSubmit` silently never fired and "Submit count" fell through to a real native form submit.
Caught the same way as the original — live usage ("it refreshes the page but no data is saved"), not
a test, since every existing test called `submitCount()` directly. Fixed the same way (import
`FormsModule` alongside `ReactiveFormsModule`, add a DOM-level regression test dispatching a real
`submit` event). Worth remembering alongside this repo's other recurring-bug lessons: the 2026 sweep
only ever covered components that existed *at the time* — a bare `<form (ngSubmit)>` with per-field
`[formControl]`s and no `[formGroup]` is a shape that's easy to reach for again in any *new*
component built afterward (it looks identical to a correctly-wired reactive form at a glance, and
compiles clean either way), so this is a shape worth checking by hand in any future form, not a
one-time sweep that stays valid forever.

Enforcement is the same choke point every other fail-closed state in this schema already uses:
`account_locked_at is null` is folded into `current_user_org_id()` right alongside its existing
`deleted_at`/`suspended_at`/`membership_status` checks (see `add_platform_account_lock`), so a
locked user's every org-scoped query is blocked schema-wide the instant they're locked, even in a
session that's already open — no forced sign-out needed (and none is attempted; that would need the
`service_role` admin API, out of scope for a plain migration). `approvedGuard` was the one place
that needed an explicit new check rather than relying on that alone, though: `profiles`' own SELECT
policy always lets a caller read their *own* row regardless of lock state (`create_organizations.sql`'s
"Users can always view their own profile" policy), so `getProfile()` never fails for a locked user
the way `current_user_org_id()` failing would suggest — without the explicit
`profile.account_locked_at` check the guard now also makes, a locked-but-still-`approved` profile
would sail straight past it into a page full of silently-empty, RLS-blocked queries instead of a
clear "you're locked out" message. `PendingApprovalComponent` (already the landing spot for a
pending or denied/removed profile) picked up a third state for this — `isLocked`, checked ahead of
the existing pending-approval branch in the template, since `membership_status` stays `'approved'`
the whole time an account is locked, which is also why `ngOnInit()`'s own "already approved, nothing
pending to show, bounce to `/home`" redirect had to gain a `&& !profile.account_locked_at` guard —
without it, a locked user landing on `/pending-approval` (via `approvedGuard`'s own redirect) would
immediately bounce right back to `/home`, which would just re-trigger the same redirect in a loop.
In practice this means signing in with a locked account still succeeds at the Supabase Auth layer
(a locked account's password still works) — `LoginComponent` unchanged, no new check added there —
but the post-login `/home` navigation immediately redirects to this same locked-out screen via
`approvedGuard`, the identical "sign-in succeeds, the very next navigation bounces you back out"
shape a pending member's own login already has.

A follow-up polish pass touched `StudioUserDetailComponent`'s own identity twice. First, the page
header's plain icon chip (`icon="person"`) is now this person's own chosen avatar instead —
`UserAvatarComponent`, projected via `PageHeaderComponent`'s `[headerFigure]` slot (the same slot
`RingStatComponent` already uses on Reports/Billing/Team to stand in for a plain icon) — which also
meant dropping the identical, now-redundant avatar that used to sit a second time, inline with the
meta list right below it. Second, the breadcrumb trail gained a real middle hop for the org this
person belongs to: `BreadcrumbsComponent`'s new `secondaryParent` input (distinct from the existing
`secondaryLabel`, which is deliberately *not* a link — see that input's own doc comment) renders as
a genuine `routerLink`, the same way `parent` itself already does, so `StudioUserDetailComponent`'s
own `organizationBreadcrumbParent` getter (null until the org has loaded, same "nothing to show yet"
gap this page's own `suspendedByName`-equivalent fields already have elsewhere) produces "Home /
Studio / Users / {org name} / {user name}" — a real link to that org's own `StudioOrgDetailComponent`
page, not just inert text, so this page always reads as belonging to a specific org without a second
lookup to find out which.

Studio's own hub was, until now, a snapshot with no trend, no per-org resource breakdown, no record
of whether its own outbound emails actually send, and no record of the platform admin's own past
actions — four gaps closed in one pass, each its own new hub card (Usage, Email Log, Audit Log) or
addition to the existing stat grid (growth trends), and each reusing this app's existing chart/table/
skeleton conventions rather than inventing new ones. `StudioComponent.loadStats()` gained two more
plain queries (`organizations.select('created_at')`, `profiles.select('created_at')` — both already
permitted by existing policies, no migration needed) bucketed via a new `bucketByWeek()` utility
(`shared/utils/trend-buckets.ts`) into 12-week `orgSignupTrend`/`userSignupTrend` arrays, rendered by
a new shared `TrendChartComponent` (`shared/components/trend-chart`) — originally a hand-rolled CSS
bar sparkline, later redrawn as a hand-rolled SVG line chart instead (a line reads more naturally as a
*trend over time* than a row of independent bars does — see below), still no charting library, same
"no new runtime dependency" convention `DonutChartComponent`/`RingStatComponent` already establish for
their own hand-rolled charts. Two instances sit in a new `.studio-trends-row` under the existing stat
grid — "Organizations created" and "New signups," the latter in `--mat-sys-tertiary` to read as a
visually distinct second series.

`TrendChartComponent`'s line-chart redraw keeps the exact same input API (`points`/`totalLabel`/
`colorToken`) its bar-chart original had, so neither of `StudioComponent`'s own two usages needed to
change. The connecting line and its soft gradient area-fill underneath are a single SVG
`viewBox="0 0 100 100"` with `preserveAspectRatio="none"` (so the chart always exactly fills whatever
width/height its flex container gives it, the same "always fills its box" behavior the old `height:X%`
bars had) — a `<polyline>` for the line and a `<polygon>` for the fill (closing down to the baseline at
each end), both computed from one shared `plottedPoints` array so they can't drift out of sync with each
other. `vector-effect="non-scaling-stroke"` on the line keeps its stroke a constant visual thickness
under that viewBox's non-uniform scaling — the standard fix for a responsive SVG line chart, and the
reason a *stroked* line survives this scaling cleanly while a *filled* circle wouldn't (see the next
sentence). Per-point markers are deliberately plain HTML `<span>`s (`position: absolute; left/bottom %`,
a `border-radius: 50%` circle sized in real pixels), not SVG `<circle>`s — an SVG circle's own radius
would squash into an ellipse under the same non-uniform scaling that `non-scaling-stroke` only protects
a *stroke* from, not a filled shape's underlying geometry, while a CSS circle sized in pixels is immune
to viewBox scaling entirely. Only the most recent point renders a visible dot at rest (the point a
viewer's eye should land on, same "de-emphasize everything but current" spirit the old bar chart's own
per-bar opacity already had) — every other point stays individually hoverable (still carries its own
native `title` — the same "exact value on hover, no custom tooltip" layer every bar always had) but sits
at `opacity: 0` until hovered, so the chart reads as line-plus-one-dot rather than a cluttered row of
markers. A zero-value point still sits visibly above the baseline (`bottomPercent` floors at 10, not 0)
rather than flush against it — the same "shouldn't read as a rendering bug" reasoning the old bar
chart's own 4%-minimum-height floor gave, just no longer needing an artificial minimum at all now that a
*point* (unlike a zero-height bar) is never actually invisible sitting at the very bottom.

`studio/usage` (`StudioUsageComponent`) is a per-org resource-usage leaderboard plus a Free-tier
pressure report, both fed by one new cross-org RPC, `platform_get_organization_usage()` (see its own
migration entry above) — "top 5 by storage/items/members" as three `BreakdownRow`-shaped lists reusing
`ManageReportsComponent`'s own `.bar-track`/`.bar-fill` breakdown convention verbatim, plus an "Over
the Free tier" section listing every org already exceeding `PRICING_TIERS.free.limits`
(`shared/models/pricing-tier.ts` — the same limits `ManageBillingComponent` measures a single org
against), each flagged row naming which limit(s) it's over and linking to that org's own
`StudioOrgDetailComponent` page. Nothing here is actually enforced — every org is still hardcoded onto
Free (no `subscriptions` table yet, same gap `ManageBillingComponent`'s own doc comment already
flags) — this is pure insight: who's actually driving cost, and who'd be a natural upsell candidate
once real billing exists.

`studio/email-log` (`StudioEmailLogComponent`) answers a question nothing in this app could answer
before: did a given `send-notification-email` call actually reach Resend successfully? That Edge
Function's own `sendEmail()` now logs every attempt — kind, recipient, org, success/failure, and the
failure's own error text — to `notification_email_log` (see its own migration entry above)
immediately after the `fetch()` call resolves or throws, via a new `logEmailAttempt()` helper. The
page itself is a near-identical fork of `StudioErrorLogComponent` (skeleton rows, `MatPaginatorModule`,
org-name resolution via a plain `Map`), with its own filter defaulting to failures-only rather than
that page's "exclude development" default — a failed send is the actionable case, and a page full of
confirmed-successful sends isn't what a maintainer opens this for.

`studio/audit-log` (`StudioAuditLogComponent`) is the record `platform_suspend_organization`/
`platform_unsuspend_organization`/`platform_retire_organization`/`platform_restore_organization`/
`platform_lock_user_account`/`platform_unlock_user_account` never kept of themselves — who ran which
of the six, on what target, when, and why (see `add_platform_action_log`'s own migration entry above
for the schema and the diff-per-RPC approach). Rendered as a plain table (`StudioOrganizationsComponent`'s
own shape, not an accordion — a row here is a short one-liner, unlike an error/email log entry's
often-long message) with each target linking to its own `StudioOrgDetailComponent`/
`StudioUserDetailComponent` page. Both of those detail pages also gained their own "Recent platform
actions" section — the same "self-contained follow-up query keyed on just the few distinct actor ids
this page's own action log actually has" shape `suspendedByName`/`lockedByName` already established
for exactly this need (a platform admin acting on an org/person is almost never a member of it, so
their name can't come from data the page already loaded) — sitting alongside "Recent feedback"/
"Recent errors" as read-only context, above the "Platform actions" buttons themselves.

`TaskDetailModalComponent`'s Save button (the only thing it ever writes — see
`close_task_assignee_column_gap`'s own migration entry above for why this dialog can only change
`status`, nothing else about a task) is now disabled whenever the Status dropdown's current selection
matches the task's own `status` — previously it stayed clickable the whole time, and `saveStatus()`
itself already silently treated a same-status click as "nothing to save, just leave" rather than
calling `update_task_status()`, so the only real change is the button no longer inviting a click that
was always going to be a no-op. That existing early-return stays in `saveStatus()` itself as
defense-in-depth (it's what re-disables the button if the dropdown is set back to the original value,
and protects any future direct caller of the method) rather than being the only gate.

`StudioOrgDetailComponent`'s meta list now also shows an org's inventory item and task counts,
closing the gap that page's own doc comment had explicitly flagged as deferred (see
`add_platform_admin`'s cross-org SELECT policies — none of them covered `inventory_items`/`tasks`,
and adding a fourth policy pair felt like more than this page needed). Rather than that new policy
pair, this reuses and extends `platform_get_organization_usage()` — the `SECURITY DEFINER` RPC
`manage/studio`'s usage leaderboard (`StudioUsageComponent`) already calls, which was already
bypassing RLS to compute a cross-org inventory `item_count` for its own leaderboard rows. A
`task_count` column joins `item_count`/`member_count`/`storage_bytes` in its return shape, and a new
`p_organization_id` parameter (default `null`, so the leaderboard's own existing zero-arg call is
unaffected) lets `StudioOrgDetailComponent` ask for just the one org's row instead of computing every
org's usage only to discard the rest — when an id is passed, the org's own deleted/suspended status
is ignored too, unlike the leaderboard's default (all-orgs) call, which still excludes deleted orgs,
since a platform admin looking at one specific org's detail page wants its real counts regardless of
that org's current status. A table function's return columns can't change via `create or replace`
(Postgres rejects it outright), so `add_platform_organization_task_count` drops the old signature
before recreating it — the same constraint `20260919120100`'s own migration comment already noted
for this exact function.

`StudioOrganizationsComponent`'s own table picked up the same three usage columns (Items/Tasks/
Storage) right alongside — this list already loads every org at once, so it calls
`platform_get_organization_usage()` with no `p_organization_id` (the same zero-arg,
excludes-deleted-orgs call `StudioUsageComponent`'s leaderboard already makes) rather than looping a
per-org call the way `StudioOrgDetailComponent` does. Because that zero-arg call excludes any org
with `deleted_at` set, a retired org simply has no row in the result — `itemCount`/`taskCount`/
`storageMb` stay `null` for it (rendered as "—", not a misleading "0"), unlike its own
`StudioOrgDetailComponent` page, whose id-scoped call to the very same function still shows its real
historical usage regardless of retirement status. `storageMb` is rounded to one decimal place from
the RPC's raw `storage_bytes`, same conversion `StudioUsageComponent`'s own `topByStorage` already
does (duplicated, not shared — this app's usual small-presentational-pattern convention).

`StudioOrgDetailComponent`'s own meta list picked up the matching `storageMb` (its `itemCount`/
`taskCount` siblings shipped in the pass just above) so all three usage figures now match
`StudioOrganizationsComponent`'s own list-view columns exactly, viewable from either the list or any
one org's own page. Growing the meta `dl` to five/six rows (Created, Status, an optional Reason,
Inventory, Tasks, Storage) read as an increasingly long single-column list, so `.org-meta` moved from
one `auto 1fr` pair per row to two (`auto 1fr auto 1fr`) — a plain CSS grid still handles the
pairing via source order, no per-row wrapper markup needed. Reason is the one row kept full-width
(`.org-meta-full-value`, `grid-column: 2 / -1`) rather than joining the two-per-row flow, since its
value is free-text (a suspension reason, possibly with a "— by {name}" suffix) that reads poorly
squeezed into half a row the way a short label/number pair doesn't. A narrow-viewport media query
(`max-width: 30rem`) collapses back to one pair per row, the same "two columns is a wide-viewport-only
optimization" reasoning `AccountComponent`'s own multi-column card layout already documents elsewhere
in this file.

Creating a second real organization (`Studio Rio`, this app's own maintainer's org — see the git
history around this pass for the full backstory) surfaced a real, previously-latent cross-org data
leak: `add_platform_admin`'s "Platform admins can view all X" SELECT policies on `profiles` and
`client_error_log` are additional *permissive* policies OR'd onto those tables' existing org-scoped
ones — Postgres RLS has no way to know "this query came from Studio" versus "this query came from an
ordinary page," so the moment a caller is both `is_platform_admin` *and* an actual member of a regular
org (previously true of nobody, since this hosted project only ever had one organization until this
pass), literally any plain, unfiltered `profiles`/`client_error_log` query anywhere in the app —
Manage > Team's member list, Manage > Error Log, the header's online-count/pending-badge, Home's
Getting Started team-size count, Billing's member-count usage stat, task assignee/transfer pickers,
Danger Zone's org data export, etc. — returns *every* organization's rows, not just the caller's own.
Every one of those pages had always trusted RLS alone to scope a bare `.from('profiles').select(...)`
the way this app's own "no client-side `organization_id` filter, RLS does the scoping" convention
(see the Realtime section elsewhere in this file) generally endorses; that convention specifically
breaks down for this one pair of tables because of the platform-admin bypass. Confirmed via the live
RLS policies that this is a *read-only* leak, not a write one — `profiles`' `INSERT`/`UPDATE`/`DELETE`
policies have no platform-admin bypass, only `SELECT` does, so e.g. clicking "Remove" on a
cross-org member row (visible only because of this leak) silently affects zero rows rather than
actually deleting anyone.

Fixed by adding an explicit `.eq('organization_id', this.authService.organizationId())` (or, where a
fresher `profile`/`getSession()` result was already on hand in that method, reusing that instead of
re-reading the signal) to every regular-page query against `profiles`/`client_error_log` that didn't
already have one — roughly twenty call sites across `AppComponent`'s header, Home, Inventory, Tasks,
Broadcasts, and most of `manage/*`/`shared/components/*`. A handful of components
(`ManageOrdersComponent`/`ManageActivityComponent`/`ManageErrorLogComponent`/`ManageReportsComponent`)
didn't inject `AuthService` at all before this and needed it added. Deliberately *not* fixed at the
RLS layer (e.g. dropping the blanket policies in favor of routing Studio's own cross-org reads through
dedicated `SECURITY DEFINER` RPCs the way `platform_get_organization_usage()` already does) — that's
the more architecturally correct long-term fix, but a materially bigger, more security-sensitive
change touching several already-working Studio pages, considered and deliberately deferred in favor of
the narrower, lower-risk fix at each affected call site. A few `.from('profiles')` call sites were
deliberately left alone: single-row lookups already scoped by `.eq('id', ...)` (a person editing their
own profile, `AuthService`'s own session-derived profile fetch), profile `DELETE`s already scoped by
id (safe regardless, per the write-side finding above), and every Studio page's own intentionally
cross-org reads.

A global command palette — Ctrl+K on Windows/Linux, Cmd+K on Mac — lets any authenticated user jump
straight to a page or search across inventory items, tasks, reservations, audits, and broadcasts (every
approved member), suppliers/orders/team members (admin/manager), or organizations/platform-wide users
(platform admin only), all by name or raw id, from anywhere in the app. Reached via a new search icon
in `HeaderComponent`'s `.header-actions` (before the notification bell) or the global shortcut
(`@HostListener('window:keydown', ...)` — no other global keydown listener existed anywhere in this app
before this), opening a third fixed-position panel following the same "own panel, not MatMenu"
convention the nav drawer and notifications dropdown already established — centered in the viewport
with a dimmed `rgba(0,0,0,0.45)` backdrop (`.command-palette`/`.command-palette-backdrop`, lighter than
`.nav-drawer-backdrop`'s own 0.6 — this is a quick in-and-out lookup, not a full page takeover) rather
than right-anchored, the conventional command-palette placement. A new `CommandPaletteService`
(root-provided, same `NotificationCenterService`/`HeaderComponent` data-vs-UI split: this service owns
data, `HeaderComponent` owns the panel's own open/close/keyboard-navigation state) lazily loads and
session-caches (5-minute TTL, no realtime subscription — this is a quick-jump tool, not a live view)
a bounded set of each searchable entity, filtering client-side with the same
`term.trim().toLowerCase().includes()` idiom `ManageTeamComponent`'s own search already uses rather
than a per-keystroke `.ilike()`/`.or()` query (see `StudioUsersComponent`'s own doc comment for why this
codebase avoids building filter strings out of unsanitized search input). Every group also matches
against its own raw id, not just its display name — the same "name or id" reach `InventoryComponent`'s
own search already had, extended to every entity here so a uuid pasted from a ticket or another tab's
URL resolves regardless of what it points at. `shared/models/command-palette.ts`'s
`COMMAND_PALETTE_DESTINATIONS` mirrors every route in `app-routing.module.ts` (a broader list than
`QUICK_MENU_OPTIONS`, which stays deliberately curated to 8 for the Account page's own picker), each
gated by the same manage/admin/platform-admin guard its own route already requires.

Selecting a result reuses each page's existing deep link where one already existed (Inventory's
`?item=`, Tasks' `?task=` — including its own fallback to `/manage/tasks` for a manager+ viewer —,
Manage Audits' `?audit=`), or a real per-id route with no query param at all (Studio Organizations/
Users' own `:id` routes). Four pages had no per-row deep link of any kind before this — Suppliers,
Orders, Reservations, Broadcasts — so they gained a shared `?highlight=<id>` convention instead
(`shared/utils/highlight-row.ts`'s `flashAndScrollToHighlighted()`): the matching row gets the same
`.realtime-flash` pulse a live update from another user already uses (via the page's own `FlashTracker`
— Orders/Reservations/Broadcasts already had one for their existing realtime subscriptions;
`ManageSuppliersComponent` picked one up purely to back this, having had no realtime subscription of
its own before), plus a `scrollIntoView()`, rather than inventing a second highlight style. A person
result deep-links to `manage/team`'s own search field via a new `?search=` param that component reads
once in `ngOnInit()`, the same read-once-on-init shape every other `?xxx=` deep link in this app
already uses.

`manage/reports`'s "Stock movement & loss" and "Task throughput" sections can now be scoped to a date
range — a `mat-button-toggle-group` (Last 7/30/90 days, All time, Custom) sitting below the page
header, with a `mat-date-range-input` revealed only for Custom (copying `PlaceReservationModalComponent`'s
own reactive-forms shape, the only other genuine date-range picker in the app, rather than introducing
a second one). "Inventory value & stock health" stays an unranged live snapshot regardless — current
stock levels aren't a retroactively-filterable event without periodic value snapshots, which don't
exist — and within the two ranged sections, a few more point-in-time facts
(`retirementRateByCategory`, `overdueTaskCount`, `workloadByAssignee` — current status/queue, not
something that happened in a window) stay unranged too, each captioned "(current, not date-range
limited)" so the split reads as intentional rather than a bug. Every genuinely event-based stat
(discard events; tasks created/closed in the window, via `created_at`/`updated_at` respectively — two
separate cohorts, not the same tasks) filters against already-loaded data purely client-side —
`loadReportData()` still fetches everything once, keeps the raw arrays on the component, and a range
change just re-runs the two ranged `build*()` methods locally with no network round-trip and no
loading state of its own. The selected range is reflected in the URL (`?range=7d|30d|90d|all|custom`,
plus `?from=`/`?to=` for Custom) via the same `queryParamsHandling: 'merge'`/`replaceUrl: true` shape
`SettingsComponent.setViewMode()`'s own `?tab=` already established, so a scoped report view is
bookmarkable.

`studio/users` no longer requires typing a search term before showing anyone — it now lists the 20
most recently signed-up users (across every org, newest `created_at` first) by default, replacing what
used to be a blank page waiting for input; typing a search term still replaces that list with matches
exactly as before. `StudioUsersComponent.displayedProfiles` is the one getter the template now reads,
resolving to the new `recentProfiles` or the existing `filteredResults` depending on whether
`searchTerm` is set — the loading-state skeleton picked up a matching real table shape (mirroring
`StudioOrganizationsComponent`'s own) in place of its own previous two-bar placeholder, since the table
itself no longer only ever appears post-search.

`manage/reservations` gets a List/Calendar view toggle (`ManageReservationsComponent.viewMode`, a
`mat-button-toggle-group` next to the existing status filter) — a month-grid calendar is the more
natural way to see "what's booked when" for this app's own event-rental use case than a flat list
alone. The calendar itself is a new shared `ReservationCalendarComponent`
(`shared/components/reservation-calendar`) — a hand-rolled CSS-grid month view (no calendar
library, same "no new runtime dependency" convention `DonutChartComponent`/`RingStatComponent`/
`TrendChartComponent` already established for their own hand-rolled charts), always a fixed 6-week
(42-day) grid so switching months never changes the grid's own height. Each day cell shows small
status-colored chips (mirroring `.status-pill`'s own reservation-status palette) for every
reservation whose date range includes that day, capped at 3 visible with a "+N more" overflow;
clicking a day emits its ISO date via `(daySelected)` rather than owning any agenda UI itself.
`ManageReservationsComponent` renders an agenda list below the calendar for whichever day is
selected (defaulting to today) — both the plain list view and this agenda share one
`<ng-template #reservationCard>` for the actual card markup (status pill, dates, actions) via
`ngTemplateOutlet`, rather than maintaining two copies of it. Like `InventoryComponent`'s own
card/table toggle, `viewMode` stays local/session state rather than a URL query param — this is
how the same filtered data renders, not which page section is showing. The calendar is purely
presentational (no realtime subscription of its own); it re-derives its grid from whatever
`reservations` the host page already passes it, so the existing `inventory_item_reservations`
subscription on `ManageReservationsComponent` keeps both views current without any change.

A reservation can now book several items at once — picked one at a time, or prefilled from a
saved kit — rather than always exactly one item, per quantity, per submission.
`PlaceReservationModalComponent`'s original single-item field (item autocomplete +
`reservationForm.controls.quantity`) is unchanged and still the primary line; a "+ Add another
item" button appends further `additionalLines` (a plain array of `{ searchTerm, item, quantity }`
rows, same shape `ModalTableComponent`'s own `EditableContainer` already establishes for a small
repeatable-row editor, not an Angular `FormArray`) — every line shares the dialog's one date range/
"Reserved for"/note, since this is one booking with several item lines, not several independent
bookings. Submitting loops `create_reservation()` once per line (no RPC accepts an array of ids)
and tallies success/failure the same way every other bulk action in this app already does; a
single-line submission is untouched from before (same RPC call, same verbatim error surfacing) —
only 2+ lines take the new path, which stamps every row with a shared, client-generated
`reservation_group_id` (`crypto.randomUUID()`) so they read and act as one booking afterward. A
partial failure keeps the dialog open with only the still-failing lines left pending (the succeeded
ones are cleared out, since they're already created and can't be un-created from here) rather than
either silently losing which items failed or blocking on an all-or-nothing assumption.

A **reservation kit** (`ReservationKit`, `shared/models/reservation-kit.model.ts`) is a saved,
named bundle of items+quantities (e.g. "Wedding package": 50 chairs, 10 tables, 20 linens) an
admin/manager curates ahead of time so a common multi-item booking doesn't mean picking every item
and typing every quantity by hand each visit. `PlaceReservationModalComponent` gets a "Hand-pick
items" / "Use a kit" `mat-button-toggle-group` (`pickMode: 'items' | 'kit'`, shown only once the org
has any kits at all — with none, the dialog behaves exactly as it did before kits existed, no
toggle to show) — an explicit up-front choice rather than a kit picker just sitting above the item
lines unconditionally, which read as an ambiguous "is this optional or not" prefill. Switching modes
(`setPickMode()`) clears whatever item/kit selection was already made (not the shared date range/
"Reserved for"/note, which aren't part of *how* items get picked) — a clean slate for whichever way
was just chosen. 'items' mode shows the item-lines editor immediately, same as before this toggle
existed; 'kit' mode shows only a kit `mat-select` until one's actually picked (`selectedKitId`) —
nothing to edit before then — at which point the identical item-lines editor appears below it,
prefilled from that kit's own items and fully editable (add, remove, change quantities, including
adding items beyond what the kit had) before submitting. A kit item that no longer resolves to a
real item (removed from inventory since the kit was made) is silently skipped with a small "N items
... were skipped" notice rather than blocking the load. Backed by `reservation_kits`/
`reservation_kit_items` (see the
`add_reservation_kits` migration below) — same "org-scoped directory, admin/manager curate it, any
approved member reads/picks from it" shape the supplier directory already established, mirrored via
`ReservationKitService` (`core/reservation-kit.service.ts`, `providedIn: 'root'`, same
signal-plus-`loadError` shape `SupplierService` already uses, except `load()` takes an
`itemNamesById` map from the caller rather than resolving names itself — a kit's own items are only
ever known by id). `ManageReservationsComponent` gets a second top-level tab, "Kits"
(`pageTab: 'reservations' | 'kits'`, reflected in the URL as `?tab=` via the same `setPageTab()`/
`?tab=` shape `ManageInventoryComponent`'s own create/retirements tabs already establish), visible
only to `authService.canManage()` — full create/edit/delete CRUD via
`ReservationKitFormModalComponent` (`shared/components/reservation-kit-form-modal`, self-contained
like `SupplierFormModalComponent` — it does the actual `ReservationKitService.create()`/`update()`
write itself), same repeatable-item-row editor `PlaceReservationModalComponent`'s own additional
lines use. Editing a kit is a full replace of its item list rather than an add/remove/update diff
(`ReservationKitService.update()` deletes every existing `reservation_kit_items` row for that kit
then re-inserts the submitted set) — same "resubmit the whole set" simplicity `set_audit_team()`
already established for its own multi-select, a reasonable simplification for a list that's only
ever a handful of items.

Multi-item reservations placed together — by hand or from a kit — render as one linked group rather
than several unrelated rows once placed: `ManageReservationsComponent` groups every reservation by
its (possibly null) `reservation_group_id` into a `ReservationGroupView` (a single-item reservation
is still its own singleton group of one, rendering through the exact same `#reservationCard`
template as before grouping existed — grouping is purely additive, not a rewrite of the common
case). A real multi-item group instead renders through `#reservationGroupCard` — one card with a
shared header (item count, "Reserved for," dates) plus a per-item sub-row each carrying its own
status pill and its own individual pick-up/return/cancel action, since one item in a group can move
through the lifecycle independently of its siblings (e.g. half the chairs get picked up a day before
the tables). Alongside each item's own action, the group card also offers a bulk "Mark remaining
picked up"/"Mark remaining returned"/"Cancel remaining" button that acts only on whichever of the
group's rows are still in the relevant status — same "no RPC accepts an array of ids, loop the
single-row RPC client-side, tally success/failure" convention every other bulk action in this app
already follows, not a new group-aware RPC.

Checked-out items (`is_checked_out`/`checked_out_to`) can now carry a `checkout_due_at` date —
`ModalTableComponent`'s edit flow gets a "Due back" field right under the "Checked out to"
selector, and once that date passes, the item is "overdue": a red variant of the existing
`checked-out-badge` on Inventory's card view, a tinted/icon-marked "Checked out to" cell in table
view (both left the single-status-pill priority order untouched — see `isCheckoutOverdue()` in
`shared/models/inventory-item.model.ts`), and a matching red pill in `ModalTableComponent`'s own
view mode. Clearing "Checked out to" during an edit also clears the due date, even if the date
field itself was left populated — a due date is meaningless with nothing checked out (mirrors
`quantity_remaining`/`quantity_total`'s own "derive/clear the dependent field" treatment
elsewhere in this schema).

A daily `pg_cron` sweep, `notify_overdue_checkouts()` (`add_inventory_item_checkout_due_date`
migration), finds every checked-out item whose due date has passed and re-notifies every 3 days
until it's resolved (returned, reassigned, or given a new due date — any of the three reset
`checkout_overdue_notified_at` back to null via a `BEFORE UPDATE` trigger, so a fresh overdue
period on the same item notifies again rather than staying silently marked from a previous one).
Unlike every other notification kind in this schema, this one isn't triggered by a row change at
all — it's time passing — so the cron function calls `send-notification-email` directly via
`net.http_post`, the same shared-secret-authenticated call every trigger-driven webhook already
makes, with a synthetic `type: 'OVERDUE_CHECKOUT'` the Edge Function branches on (see that
function's own `resultForOverdueCheckout()`). Notifies both the person holding the item and every
admin/manager, deduplicated when they're the same person; gated by a sixth per-org toggle,
`site_settings.notify_checkout_overdue`, in Settings > Workflow's existing "Email notifications"
section (same bundled-into-one-upsert shape the other five already use) — the in-app
`notifications` row is unconditional, matching every other kind. A same-day follow-up caught (via
a manual `notify_overdue_checkouts()` test run against the hosted project, before any real usage
depended on it) that `notification_email_log.kind`'s own check constraint had been widened for
`notifications.kind` but not for this table's separate, identically-shaped one — every overdue
email was sending successfully but silently failing to log itself, the exact
"never block/throw over a logging write" swallow that function's own doc comment describes, so it
went unnoticed until checked directly; fixed by a follow-up migration widening the second
constraint the same way. Worth remembering alongside this schema's other "diff against the
previous version"/double-apply lessons: a new notification *kind* touches two separate check
constraints (`notifications.kind` and `notification_email_log.kind`), not just one, and only the
second one's gap is silent rather than a visible error.

`StudioComponent`'s own hero — previously just a bare `<h2>Studio</h2>` plus one plain paragraph,
the only page-level heading in the app that never got the shared `_page-hero.scss` treatment —
picked up a bespoke, noticeably bolder "Mission Control" hero: a dark HUD console rather than the
same azure/tertiary gradient every other `.page-hero` consumer (Home, Inventory, Tasks, the Manage
hub) shares. Deliberate: Studio is the one page in the app with an audience of exactly one (the
platform admin — see that component's own doc comment), genuinely "its own domain" in a way no
other page is, so it's the one place a departure from the shared visual language earns its keep
rather than reading as inconsistency. It still `@use`s `_page-hero.scss` for the pieces that
really are the same shape everywhere — `.page-hero` itself (padding/radius/the `color-scheme: dark`
trick), `.page-hero-kicker`, `.page-hero-subtitle`, `.page-hero-pulse-row`/`-chip`/`-value`/`-label`
— and only replaces the backdrop layer (`.page-hero-backdrop`/`-glow`) with its own HUD grid +
scanline + vignette stack, adds a purely decorative rotating-radar-sweep visualization with a
handful of pinging "blip" dots (no real per-org data behind any individual blip — this component
doesn't load anything granular enough to place one deliberately), and layers a two-ghost
chromatic-aberration effect behind the "Studio" title (cyan/magenta duplicates, screen-blended,
nudged a couple px off-axis). Every accent color (cyan/green/amber/red) is hardcoded rather than
read from the org's own `--mat-sys-primary`/`-tertiary` the way the shared backdrop does — the same
"needs to look the same regardless of which theme preset the viewer's org happens to have picked"
reasoning `StudioOrgDetailComponent`'s own hardcoded "Retire" red already established; a platform
admin's own console isn't org branding. `.studio-hero` also picks up the same `1px solid
var(--mat-sys-outline-variant)` border every other panel on this page already has
(`.studio-trend-card`, `.studio-card`) — `.page-hero` itself has none by default (Home/Inventory/
Tasks/the Manage hub's own heroes float free of the cards below them), but here it reads as one more
console panel among several rather than a floating banner, so it picks up the same border those
panels share. The hero's four pulse chips (Organizations/New this week/Open feedback/Errors 24h) get
their own loading skeleton (`heroSkeletonChips`, a fixed 4-item array) and render an em dash instead
of a number if `loadStats()` failed, rather than duplicating that query's own error messaging a
second time right above the `loadError` empty state that already explains it. Each chip's top-left
and bottom-right corners (a diagonal pair — a targeting-reticle accent, not a plain box outline,
which is what marking all four read as on an earlier pass) carry a small solid accent-colored square
(two `background-image` layers rather than `::before`/`::after`, so both corners share one rule) —
the shared `.page-hero-pulse-chip`'s own `0.85rem` corner radius is tightened to `0.375rem` here
specifically so a solid corner fill reads as a clean square rather than getting visibly clipped by
too generous a curve.

Four of the radar's five decorative blips (see above) are tagged with one of this same page's
headline categories — Organizations/Signups/Feedback/Errors, the same four the hero's own pulse row
already shows — via a small mono-font label next to each dot, timed to flash on and fade right as
the rotating sweep crosses that dot ("a true scanner painting a contact," not a label sitting
statically visible the whole time). Every label shares one `studio-hero-blip-label-flash` keyframe
(the same 6.5s period as `.studio-hero-radar-sweep` itself) with a per-blip `animation-delay` set
inline in the template — computed by hand from each blip's compass bearing around the radar's center
and the sweep gradient's own ~26° brightness peak (`elapsed = ((bearing - 26) mod 360) / 360 * 6.5s`),
not derived at runtime. The fifth blip stays a plain, unlabeled, non-flashing dot for visual
texture — a real scope always has some unidentified clutter alongside its tagged contacts. Every
animated piece (the radar sweep, the scanline drift, the blip pings, the label flashes, the kicker
icon's pulse) respects `prefers-reduced-motion`, same as every other ambient animation in this app —
the label flashes specifically are suppressed outright rather than left ticking on a timer, since
there's no moving sweep left to "cross" a contact once the sweep itself stops.

The hero's pulse row made the plain 5-tile `.studio-stats-card` stat grid that used to sit directly
below it (Organizations/New this week/Approved users/Open feedback/Errors 24h) redundant — 4 of its 5
numbers were now shown twice on the same page load — so that card was removed outright rather than
kept as a second, plainer copy of the same data. The one number it carried that the hero doesn't
("Approved users") wasn't kept elsewhere; it wasn't judged worth a whole card of its own, and is
still visible via each org's own member count on `studio/organizations`/`studio/usage`. `loadStats()`
dropped the now-unused `profiles`-membership-status-`'approved'` count query it used to make (down to
five queries from six) — the `profiles` table is still queried once, for `userSignupTrend`'s own
`created_at` column, feeding the trend chart in `.studio-trends-row` (unaffected by any of this — the
trend charts were never part of the redundancy, so they're still there, directly below the hero now).
That row's own loading state gained a real two-card skeleton of its own (it previously had none at
all — while `isLoadingStats` was true, only the now-removed stat grid showed a placeholder, so the
trend cards used to just pop in with no loading treatment once removing the stat grid would have left
nothing between the hero and the studio-grid cards during a load).

An item's Activity Log tab in `ModalTableComponent` was redrawn as a visual vertical timeline
(`.activity-timeline`) rather than a flat, bordered `<li>`-per-row list — one continuous line
(`.activity-timeline::before`) runs behind a colored, icon-bearing circular marker per entry,
reading as one continuous thread through the item's whole history instead of a series of
disconnected dividers. `activityColorClass()` mirrors `activityIcon()`'s own message-sniffing
(same keywords, same precedence) to pick a marker color — checkout (tertiary), checked-in (success),
created (primary), discarded (danger) each get their own, matching the equivalent `.status-pill`
variant already used elsewhere in this component; everything else (allocated/updated/etc.) shares
one neutral default, the same surface-container-high + primary-icon pairing `.info-section-header`
already uses for its own icon — not every message is distinct enough to earn its own color. The
newest entry's own marker (index 0 — `loadInventoryActivityByItemId()` already orders
`created_at desc`) gets a soft pulsing ring around it, same "the current/latest point is the one the
eye should land on" reasoning `TrendChartComponent`'s own single-visible-dot convention already
establishes for its line chart, adapted to a ring since a timeline marker (unlike a line-chart
point) is already always visible rather than needing to be picked out from a full row of them.
Purely a `ModalTableComponent` template/stylesheet change — no schema, no new data.

A shared `ConfettiService` (`core/confetti.service.ts`) fires a brief, full-viewport confetti burst
for a genuine "just happened, right here" celebration moment — see each call site's own doc comment
for why that particular moment qualifies (a completed action the viewer can actually see resolve on
the same page load, not a milestone whose underlying change happened somewhere else — see
`HomeComponent`'s own doc comment on why its Getting Started card deliberately skipped a "just
completed" animation for exactly that reason, the bar this reuses). The confetti itself is a
hand-rolled CSS-particle component, `shared/components/confetti-burst` — same "no new runtime
dependency" convention `DonutChartComponent`/`RingStatComponent`/`TrendChartComponent`/
`ReservationCalendarComponent` already established for their own hand-rolled visuals, with colors
cycling through the live theme's own tokens so a burst recolors itself automatically under any
`THEME_PRESETS` preset. Rather than going through `MatDialog`/CDK Overlay — a decorative,
click-through, no-content overlay has no need for either's dialog-style machinery (backdrop, focus
trap, a positioning strategy) — `ConfettiService.burst()` attaches it by hand via
`createComponent()`/`ApplicationRef`, appended straight to `<body>` and torn down again once the
animation finishes (`ConfettiBurstComponent.DURATION_MS`). Skips itself entirely under
`prefers-reduced-motion`, same convention every other ambient animation in this app already follows.
`AuditDetailComponent.completeAudit()` is the first real trigger: completing an audit that turned up
zero discrepancies with nothing left uncounted (`isPerfectCount`, captured before the RPC call and
the reload that follows it) fires a burst alongside a "🎉 Perfect count" toast in place of the plain
"Audit completed" every other completion gets — a genuine, on-this-page "the whole shelf matched the
system exactly" moment, unlike Home's own Getting Started steps.

`HeaderComponent` also carries a small, deliberately pointless easter egg — the classic Konami code
(`handleKonamiCode()`, tracked as a plain index into the sequence rather than a rolling keystroke
buffer) fires the same confetti burst plus a "🕹️ Konami code!" toast, changing nothing else about the
app. Building this surfaced a real Angular gotcha worth remembering: two separate
`@HostListener('window:keydown', ...)`-decorated methods on the same class silently collide — the
second one's compiled host binding replaces the first's rather than both being registered, rather
than the "every `@HostListener` gets its own independent listener" behavior this looked like it should
have. Caught by the pre-existing Ctrl/Cmd+K command-palette shortcut's own tests going red the moment
this was added as a second decorated method alongside `handlePaletteShortcut()` — fixed by keeping
exactly one `@HostListener` (`onWindowKeydown()`) that calls both `handlePaletteShortcut()` and
`handleKonamiCode()` as plain, undecorated methods. Worth remembering the same way this schema's other
"diff against the previous version"/double-apply lessons already are: a global host listener added
to a component that already has one for the identical event needs to merge into it, not sit beside it.

`studio/usage` gained a fourth section, "Org health" — a Bronze/Silver/Gold badge per org, a
support-attention/upsell signal distinct from that page's own item/member/storage leaderboard
(resource *cost*) and the "Over the Free tier" card (resource *ceiling*): is this org actually
adopting ShelfSync's own deeper features, or just parked on the basics. `shared/models/org-health.ts`'s
`computeOrgHealthTier()` counts how many of five signals an org has ever used at all — container/box
tracking, reservations, restock orders, broadcasts, a completed audit — and maps 4-5 adopted to
Gold, 2-3 to Silver, 0-1 to Bronze; deliberately a plain adoption-breadth count with no
recency/engagement weighting, so it stays a one-glance "uses 4 of 5" rather than needing its own
explainer. All five counts are just five more columns on the already-`SECURITY DEFINER`
`platform_get_organization_usage()` (`add_platform_organization_feature_adoption` migration — see
Supabase Schema below), so no new RLS policy was needed, same reasoning
`add_platform_organization_task_count` already established for extending this one RPC rather than
adding a fresh cross-org policy pair each time Studio needs one more cross-org number.
`StudioUsageComponent`'s own "Org health" list sorts Bronze first (needs the most attention) and
names what each org *hasn't* adopted yet next to its badge — more actionable for a platform admin
deciding who to nudge than listing what already works. The same badge (and, on the org's own detail
page, the same missing-feature explainer) also rides along on `StudioOrganizationsComponent`'s table
(a "Health" column) and `StudioOrgDetailComponent`'s meta list, all three reading the identical
per-org RPC result rather than three separate queries. The badge's own colors are hardcoded, not
theme-derived — same "Studio's own console isn't org branding" reasoning
`StudioOrgDetailComponent`'s own hardcoded "Retire" red already establishes — and duplicated (not
shared via a component) across all three consumers' own stylesheets, matching how `.status-badge`'s
own small pill styling is already duplicated across this app rather than centralized.

Admins/managers can also set up a **recurring** audit — a weekly/monthly/quarterly cadence (org-wide,
or scoped to one `physical_location`, same scope a one-off audit already offers) that auto-starts a
real audit on schedule instead of someone remembering to click "Start audit" every time. Backed by a
new `inventory_audit_schedules` table (see the `add_inventory_audit_schedules` migration below) and a
daily `pg_cron` sweep, `run_scheduled_inventory_audits()`, that snapshots the item counts and creates
the real `inventory_audits` row itself once a schedule's `next_occurrence_date` arrives, then advances
that date by the schedule's own frequency. Once a schedule's next occurrence is within a week, it
shows as "Upcoming" in `manage/audits` — a small read-only card, visible to every approved member
(same open visibility real audits already have), naming the cadence/location and how many days out it
is — while its own scope (location/frequency/note) can no longer be edited until that occurrence
actually fires (`update_audit_schedule()` refuses once `next_occurrence_date - current_date <= 7`).
Pausing or resuming the whole series stays allowed regardless of how close the next occurrence is —
deliberately a separate RPC (`set_audit_schedule_active()`) with no such lock check, since "skip/stop
it" is a different, always-safe action from "change what it does." A second, admin/manager-only
"Recurring audits" section further down the same page lists every schedule (active or paused) with
Edit/Pause-Resume actions — Edit disabled with a tooltip while locked — and an "Add recurring audit"
button opening `AuditScheduleFormModalComponent` (`shared/components/audit-schedule-form-modal`,
optional `data.schedule` means edit vs. create, same shape `SupplierFormModalComponent`/
`ReleaseNoteFormModalComponent` already establish); the first-occurrence datepicker only renders in
create mode, since editing can never move that date at all. A spawned audit's `schedule_id` (nullable
FK back to the schedule that created it) is purely a traceability breadcrumb — nothing in the UI
surfaces it yet, a natural small follow-up. `manage/audits`' existing realtime subscription gained a
third channel on `inventory_audit_schedules`, folded into the same debounced reload/flash pair its
`inventory_audits`/`inventory_audit_counts` channels already share, rather than a second debounce/
flash pair just for schedules.

A comprehensive accessibility pass swept the whole app for real WCAG gaps rather than a targeted
single-feature fix. Icon-only buttons that relied on `matTooltip` alone (which doesn't produce an
accessible name) got real `aria-label`s across `ModalTableComponent` and a dozen-plus Edit/Delete
icon pairs elsewhere; bulk-select `mat-checkbox`es that announced only "checkbox, not checked" with
no row context now include the row's own label. The three hand-rolled fixed-position header panels
(nav drawer, notifications, command palette — see `HeaderComponent`'s own doc comments) already had
a real `cdkTrapFocus` on open, but never restored focus to their own trigger button on close, since
all three stay permanently in the DOM (`[attr.inert]`-toggled, not `@if`) and `CdkTrapFocus`'s own
restore logic only ever fires from `ngOnDestroy` — each trigger is now grabbed via
`@ViewChild(..., { read: ElementRef })` (plain `mat-icon-button`s are real Angular Components in
this Material version, not directives, so the unqualified form of `@ViewChild` resolves to the
component instance rather than the DOM node — caught by the test suite, not by inspection) and
`.focus()`ed explicitly from each close method. The global Ctrl/Cmd+K listener
(`handlePaletteShortcut()`) gained an `event.target` guard — it previously hijacked the keystroke
out of *any* text field anywhere in the app, not just when nothing was focused. Every authenticated
page now has exactly one real `<h1>` — none existed before this, since `PageHeaderComponent`
hardcoded `<h2>` for both routed pages and dialog content alike; it gained a `headingLevel: 'h1' |
'h2'` input (default `'h2'`, unchanged for `ModalTableComponent`/`TaskDetailModalComponent`'s own
dialog-content usage), set to `'h1'` on all 25 real routed-page usages. The title element itself
stays a real `<h2>` tag regardless of `headingLevel` — a duplicated `<h1>`/`<h2>` pair (one per
`@if`/`@else` branch) looked like the obvious approach but silently breaks `[headerTitleExtra]`
content projection, since Angular buckets projected content into the first matching `<ng-content>`
slot at compile time, not per-branch at runtime (caught by this component's own spec going red);
`'h1'` instead overrides the *accessible* heading level via `role="heading"`/`aria-level="1"`, the
standard technique for exposing a different heading level than an element's own tag. Every other
top-level page that renders its own local title directly rather than through `PageHeaderComponent`
(Home/Inventory/Tasks/Manage hub/Studio hub/Account/Help/`PendingApprovalComponent`) got a real
`<h1>` tag instead, with matching `:is(h1, h2)`/plain-selector-widening updates in
`shared/styles/_page-hero.scss` and each page's own stylesheet so the visual treatment didn't
change. A skip-to-content link (`app.component.html`/`.scss`, gated behind the same `showChrome()`
check the header/footer already use) and a real `<header>`/`role="banner"` landmark (a plain tag
swap on `header.component.html`'s root, since `.header-wrapper` was already styled by class
everywhere) round out the structural fixes. Color contrast got a pass too: the footer credit text
(`#c4c4c4` always, ~1.7:1 against a light-mode surface — a real AA failure on every logged-in page's
default footer embedding) now uses `light-dark(#6b6b6b, #c4c4c4)`, keeping the original fixed gray
only for `.footer-on-dark`'s permanently-dark embedding via the same `:host(.footer-on-dark)`
override pattern the logo invert next to it already established; `--app-success-bg`/`--app-danger-bg`
and `.health-badge-silver` (duplicated across three Studio stylesheets) were all darkened for real
AA margin at the small badge text sizes they render at, and `--app-overdue-text`'s dark-mode value
now reuses `--app-error-text`'s own already-verified shade instead of a bespoke, weaker one. The
command palette's search input regained a `:focus-visible` ring (it had `outline: none` with no
replacement). Every hand-built `<p class="error-message">` — ~55 of them across 37 files, none of
which ever announced to a screen reader on insertion, confirmed via a codebase-wide search turning
up zero `role`/`aria-live` usage outside what Material itself injects — picked up `role="alert"`
via a small one-off verified codemod (excluding `error-message-preview`, an unrelated log-row
preview span); `EmptyStateComponent`'s `variant="error"` state got the same treatment on its host
element. `shared/styles/_brand-logo.scss`'s 8.5s auto-playing stroke-draw reveal was the one ambient
animation in the app with no `prefers-reduced-motion` guard — fixing it needed more than just
disabling the animation, since (unlike e.g. `_stagger.scss`'s `cascade-in`) this mark's own *base*
rule is the undrawn start state, so the guard also has to restate the finished (100%) state directly
or the mark would render invisible at rest. A narrower, deliberately-scoped icon-redundancy cleanup
(a small `<mat-icon>` sitting next to text that already says the same thing, so a screen reader
announces both — e.g. "warning Low stock") landed only in the highest-traffic spots
(`BreadcrumbsComponent`'s "Home" link, `HeaderComponent`'s nav-drawer links, `ModalTableComponent`'s
status pills) rather than the full ~606-instance sweep across ~90 templates a first audit turned
up — a deliberate, asked-for scope call, since this category is best-practice noise reduction
rather than a WCAG failure (the information is still there either way).

Inventory item photos are downscaled/re-encoded client-side before upload
(`shared/utils/image-compression.ts`'s `compressImageFile()`, called from inside
`uploadInventoryItemImages()` — the one choke point every photo upload in the app already goes
through, per that function's own doc comment, so this needed no changes at any of its four call
sites) — a modern phone photo (4000px+, several MB) is far larger than this app's own image
gallery/lightbox ever displays it at, and per-org photo storage/egress is this app's own pricing
model's #1 identified Supabase cost lever (see `PricingComponent`'s own doc comment). Deliberately
conservative rather than clever: resize to a 1600px longer edge and re-encode as JPEG at a fixed
0.82 quality via a plain `<canvas>` + `toBlob()` (no library — consistent with this app's existing
"hand-roll it" convention for `DonutChartComponent`/`TrendChartComponent`/etc.), then keep whichever
of (compressed, original) is actually smaller — never risk uploading something bigger than what was
picked. GIF and SVG pass through untouched (rasterizing through a canvas would lose animation/vector
fidelity), and any decode/encode failure anywhere along the way falls back to the original file
rather than blocking the upload over a compression nicety — a broken image is exactly the kind of
file that should still reach the caller's own existing upload error handling, not a new one here.

A platform admin can impersonate another user's real account for troubleshooting — an "Impersonate"
button in `StudioUserDetailComponent`'s "Platform actions" section (alongside the lock toggle),
disabled once `canImpersonate` is false (the target is themselves a platform admin, or is the
viewer's own account — no privilege to gain either way, and the former would be a way to chain
impersonation). This is a genuine Auth session swap, not a client-side "view as" — the whole app
(every page's queries, every guard, every RLS check, realtime subscriptions, the header's own
badges) already reflects the target user correctly because it *is* their session, so nothing
outside this feature's own new files needed to change: `AuthService`'s existing
`onAuthStateChange` listener already reloads `profile`/`role`/`organizationId`/`organizationName`
on any session change. Only the Auth Admin API (the `service_role` key) can mint a session for a
*different* user — Postgres/RLS has no equivalent — so `ImpersonateUserModalComponent` (a
mandatory-reason dialog copied from `LockUserAccountModalComponent`, same "consequential but
reversible" shape and the same `FormsModule`/`NgForm` gotcha that component's own doc comment
explains) hands off to a new `ImpersonationService.start()`, which calls a new `impersonate-user`
Edge Function — this app's first one ever invoked directly from the browser
(`supabase.functions.invoke()`, not only from a DB trigger/`pg_cron` the way `send-notification-
email` always is), and so also the first one needing real CORS handling and a genuine caller-JWT
check (`verify_jwt` stays at its default `true`). The function verifies the caller is a platform
admin, verifies the target is eligible, calls `auth.admin.generateLink({ type: 'magiclink' })` to
get a `hashed_token` with no email ever actually sent (`generateLink` only ever returns a token;
sending is a separate, unused call), logs an `impersonation_sessions` audit row, and returns the
token — which the client exchanges for a real session via `supabase.auth.verifyOtp()` on the app's
one shared client, replacing the platform admin's own session with the target's, in place.
`verifyOtp()` shipped with a real bug caught live on the very first attempt ("Token has expired or
is invalid" on every single try): `auth-js`'s `VerifyOtpParams` has two distinct shapes —
`{ email, token, type }` for a raw OTP code actually sent to that address, and
`{ token_hash, type }` for a hashed token pulled straight out of a magic link, which is exactly
what `generateLink()`'s own `hashed_token` is for — and the first version of `start()` passed
`hashedToken` as `token` in the former shape. Feeding an already-hashed value through the server's
own hashing step a second time can never match the stored record, so this failed unconditionally
regardless of the token's actual validity. Fixed by switching to `{ token_hash: hashedToken, type:
'magiclink' }`, which also means `email` — still returned by the Edge Function, now otherwise
unused — was never actually needed on the client at all.

Two deliberate calls shaped this: **full read/write access**, not a view-only mode — reproducing a
support issue often means *doing* something, not just looking, and a real network-layer write-guard
robust enough to cover every Save/Edit/Delete/Approve/Discard path in this app (cataloged at length
throughout this file) would be a second, much larger feature of its own; every write while
impersonating is genuinely attributed to the target's own account, indistinguishable from something
they did themselves, with the impersonation window itself (who/whom/when/why) logged separately so
it can be correlated afterward. And **ending by signing back in manually**, not a cached one-click
return — no admin credentials are stashed anywhere for this feature; `ImpersonationService.stop()`
RPCs `end_current_impersonation()` (closes the caller's own open audit row — has to run *while
still authenticated as the target*, the only session that exists at that point), clears its own
local flag, calls the existing `authService.signOut()` for real, and sends the platform admin to
`/login?impersonationEnded=1`, which shows a small explanatory message rather than a bare "you've
been signed out." A persistent `ImpersonationBannerComponent` (`app.component.html`, alongside the
header, gated by the same `showChrome()` check) renders whenever `ImpersonationService.isImpersonating()`
is true — a hardcoded, non-theme-derived `--app-warning-bg`/`-on-bg` bar (same "can't blend into the
org's own branding" reasoning `StudioOrgDetailComponent`'s hardcoded "Retire" red already
establishes) naming who/where/how-long-ago, with the Stop button right on it. Only a small,
non-sensitive flag (target name/org/start time — never tokens) persists to `localStorage`, so the
banner survives a refresh or a browser restart the same way the underlying Supabase session itself
already does; a constructor `effect()` in `ImpersonationService` watches `authService.isAuthenticated()`
and clears that flag if the session ends some other way than `stop()` (e.g. the ordinary header
Logout button, which has no idea this flag exists) — otherwise the banner would incorrectly
reappear the next time the platform admin signs back in normally as themselves. A session nobody
explicitly stopped (a closed tab, a crashed browser) leaves its `impersonation_sessions` row open
forever unless someone notices — `platform_end_impersonation_session()` (a second, admin-gated RPC)
and a small "End session" action on `StudioUserDetailComponent`'s new "Recent impersonation" list
(same accordion-row shape "Recent platform actions" one section up already established, sharing
that same section's now-generalized `peopleNamesById` map rather than a second parallel
actor-resolution query) is the cleanup path for that.

Starting an impersonation session also notifies the org it touches — the impersonated person
themselves, plus every other admin in that org, deduplicated when they're the same person (the
same two-audience recipient shape `notify_overdue_checkouts()` already established for itself: the
person directly affected, plus whoever's accountable for the org). Reuses the existing
`call_notification_webhook()`/`send-notification-email` pipeline unchanged — a new
`notify_on_impersonation_started` trigger (`add_impersonation_started_notification`, no `when (...)`
clause, same as `feedback`'s own trigger — every insert here is worth notifying about) is all that
was needed, plus a new `resultForImpersonationStarted()` handler in that Edge Function and a widened
`notifications.kind`/`notification_email_log.kind` (both check constraints, per this schema's own
"a new kind touches two, and only the second one's gap is silent" lesson). Deliberately **not**
gated behind Settings > Workflow's per-org "Email notifications" toggles the way every other kind
except `feedback` already is — this is a security/trust notice about an *external* party (a platform
admin) accessing the org's own data, not an internal workflow convenience an org might reasonably
want to mute; letting it be silenced would defeat the point of building it at all. The impersonated
person's own display name in the notification/email comes from `impersonation_sessions.target_label`
(the row's own point-in-time snapshot) rather than a fresh `profiles` lookup, since it's already
sitting right there on the row and stays correct even if that person is later renamed or removed.

A data change made *during* an impersonation session — an edit, a discard, a status change, any of
the many writes that log to `activity_log`/`inventory_item_activity` — is now visibly tagged as such
in both the org-wide Activity Log (`manage/activity`) and an item's own Activity Log tab
(`ModalTableComponent`), closing a gap deliberately left open when impersonation first shipped (see
that feature's own doc comment above): previously such a write read identically to the target's own
normal activity, with no way to tell the two apart. A client-supplied signal (a header, a flag on the
insert payload) was considered and rejected outright — nothing stops any authenticated caller from
forging or suppressing that same signal on an ordinary write, and an audit trail that trusts client
input for its own integrity isn't trustworthy. Instead this is computed entirely server-side
(`tag_activity_via_impersonation`): a `before insert` trigger on each of the two log tables checks
whether an *open* `impersonation_sessions` row exists for `new.actor_id`/`new.user_id` and sets a new
`via_impersonation` column accordingly, always recomputed unconditionally rather than merely defaulted
when null, so nothing a client sends for that column can matter either way. This works correctly for
every existing call site with zero changes to any of them — `auth.uid()` inside a `SECURITY DEFINER`
RPC still reflects the *real* calling session's own JWT-derived identity regardless of the elevated
table privileges that keyword grants (SECURITY DEFINER changes what the function's *table access* can
do, not what `auth.uid()` resolves to), so during an impersonation session it's genuinely the target's
own id there too — one choke point per table, same shape `is_locked`'s own RLS check or
`current_user_org_id()`'s fail-closed logic already are elsewhere in this schema, rather than needing
to touch the many individual RPCs/`logActivity()`/`logInventoryItemActivity()` call sites that write
to these two tables. Each trigger function needs its own `security definer` specifically to see
`impersonation_sessions` at all despite that — its own SELECT policy is platform-admin-only, so an
ordinary caller's (including the target's own, mid-session) RLS-restricted privileges would otherwise
see zero rows there and silently compute `false` unconditionally. A one-time backfill in the same
migration applies the identical correlation retroactively to rows that already existed, so the tag is
accurate for history too, not just anything logged from here on. Both `ManageActivityComponent`'s row
and `ModalTableComponent`'s own timeline entry show a small pill (`visibility` icon, "Via
impersonation" — the same hardcoded, non-theme-derived `--app-warning-bg`/`-on-bg` tokens
`ImpersonationBannerComponent` itself uses, for visual consistency across the whole feature) next to
the timestamp when this is set; `ModalTableComponent`'s own optimistic local append after a successful
edit (before a reload would otherwise pick it up) sets it from `ImpersonationService.isImpersonating()`
directly, matching what the server-side trigger would compute for that identical write.

A small round of pure-delight additions, no schema/RPC changes — each reuses machinery this app
already had rather than inventing a new mechanism. Inventory and Tasks (this app's own two busiest
pages, the same two `_skeleton.scss`/`_stagger.scss` themselves started on) now show a new
`LoadingCaptionComponent` next to their shimmering skeleton placeholders — a small, genuinely
meaningless witty line ("Untangling extension cords…", "Recounting the folding chairs…") that
rotates every 2.2s for as long as the real load is still in flight, themed to this app's own
event-rental inventory rather than a generic "Loading…". Its own rotation interval is scheduled via
`NgZone.runOutsideAngular()` (re-entering the zone only for the actual signal write each tick) — a
plain in-zone `setInterval` here would make `NgZone`/`ComponentFixture.whenStable()` treat the
component as permanently-pending work for as long as it's mounted, silently hanging any spec that
awaits `whenStable()` while this is still showing (caught the hard way: an earlier version without
this shipped clean in isolation but broke a large swath of `inventory.component.spec.ts`'s and
`manage-tasks.component.spec.ts`'s own existing tests once run as part of the full suite, surfacing
as a stray "Uncaught TypeError" + timeout combination that took real digging to trace back —
`ManageTeamComponent`'s own 30s presence-poll interval had already hit this exact class of bug once
before, see that component's own spec comment on why it uses `fakeAsync`/`tick()` instead of
`whenStable()`). Skipped entirely under `prefers-reduced-motion` (one static caption, no rotation),
same as every other ambient animation in this app. Started narrow on just these two pages rather
than swept onto every loading state — a natural extension to pick up elsewhere the same incremental
way skeleton loading itself was.

`EmptyStateComponent` gained an opt-in `playful` input — when set, a small second line (one random
pick from a short pool of genuinely generic one-liners: "Crickets. 🦗", "Tumbleweeds only.", etc.)
renders under the caller's own real `message`, never replacing it — the real message is what
actually tells a visitor what's missing, so losing it for a joke would be a real regression, not
just a style choice. Ignored outright for `variant="error"` (a failed load isn't the moment for a
joke) and `compact` (no room for a second line). Wired up on exactly two genuinely-empty (not
filtered-to-zero) states for now — Inventory's "No inventory items yet." and Tasks' "You have no
tasks assigned to you." — the same "start on the two busiest pages" scope `LoadingCaptionComponent`
above uses, out of the 30-odd places this component is used across the app.

A sixth, deliberately hidden `[data-theme='party']` preset in `styles.scss` (magenta+cyan, a
combination none of the five real `THEME_PRESETS` use) pairs with a new root-provided
`PartyModeService` (`core/party-mode.service.ts`) — `start()` swaps the whole app into it via
`SiteSettingsService.applyTheme()` (the exact same non-persisting "live preview" swap that method's
own Settings-page theme picker already uses, reused here for a swap that's ephemeral for a different
reason), fires a confetti burst every 1.4s, and after 8s reverts to whatever the org's real theme
actually is — reading it from `siteSettings.theme()`, the persisted signal, not the DOM attribute
directly, since only `updateTheme()` (never `applyTheme()`) ever touches that signal; this holds
correctly in the overwhelmingly common case (the DOM attribute and that signal always agree outside
of the rare moment someone's mid-preview on the Settings page themselves) without needing a second
tracked "what's currently showing" value. A second `start()` call while already active is a no-op
(not restacked) — restacking would both leave stray timers running past their own 8s window and risk
capturing 'party' itself as "the theme to revert to." Backs the classic Konami code easter egg in
`HeaderComponent` (already a "deliberately pointless" confetti-burst-plus-toast — see its own doc
comment — now upgraded to trigger the fuller party-mode version instead of a single bare burst), and,
same as `LoadingCaptionComponent` above, its own `setInterval`/`setTimeout` are scheduled via
`NgZone.runOutsideAngular()` for the identical `whenStable()`-hang reason, re-entering the zone via
`ngZone.run()` only for the two calls that actually need Angular to notice them (the repeated
confetti bursts, and the final theme-revert-plus-flag-reset).

Completing your first-ever task now fires a confetti burst and a "🎉 First task completed! Nice
work." toast — `TaskDetailModalComponent.saveStatus()`'s own genuine, resolves-right-here-on-this-
page milestone (the task visibly moves into Completed the instant the modal closes), the same bar
`AuditDetailComponent.completeAudit()`'s own "🎉 Perfect count" celebration already clears and
`HomeComponent`'s Getting Started card deliberately couldn't (see that card's own doc comment on why
it skipped this treatment — its own completing action almost always happens on a *different* page
than Home itself). Only fires for the assignee completing their own task, not an admin/manager
completing someone else's on their behalf — checked via a plain `tasks` count query
(`assigned_to = auth.uid() and status = 'done'`, `count === 1`) run non-blocking alongside the modal's
own close, so a slow/failed count never delays or breaks the actual save.

`InventoryComponent`'s card/table view and `ModalTableComponent`'s own item detail popup now show a
live "someone else has this open in Edit right now" signal — a pulsing colored border (card/table
row) or a name-plus-avatar banner (the detail popup), backed by a new `ItemEditPresenceService`
(`core/item-edit-presence.service.ts`). This is the first thing in the app built on Supabase Realtime
*Presence* rather than the `postgres_changes` wrapper (`subscribeToTableChanges()`) every other
realtime feature here uses — Presence is ephemeral, per-connection state with automatic cleanup on
disconnect (a closed tab, a crash, a lost connection all clear themselves the instant the socket
drops), which is exactly the shape "who's editing this right now" needs and a DB row would need its
own heartbeat/staleness fallback to approximate (see `profiles.last_active_at`'s own heartbeat for
that alternative). One channel per organization, not per item or per page — keyed by the viewer's own
id (so a second tab/device for the same person collapses onto one entry) and root-provided/session-
scoped like `NotificationCenterService`, so the same live state is visible from whichever of
Inventory/Manage Inventory/the item popup happens to be mounted. `ModalTableComponent.startEdit()`/
`cancelEdit()`/`saveEdit()`/`ngOnDestroy()` are the only call sites that ever track/untrack — entering
Edit tracks the item id, leaving it (Save, Cancel, or the component being destroyed some other way,
e.g. the host page's own Back button) untracks; a closed tab needs no explicit cleanup at all, Presence
handles that on disconnect. `editorFor(itemId)` — read directly from templates — always excludes the
caller's own session, same "no toast/flash for your own action" reasoning this app's other realtime
features already follow. Deliberately visibility-only: nobody's blocked from clicking Edit while
someone else already has an item open, this only makes that visible. Channel names aren't
RLS-protected the way `postgres_changes` delivery is (no Realtime Authorization policies exist in this
schema) — scoping by organization id in the channel name is a practical, not cryptographic, boundary,
accepted here the same way this schema accepts a few other low-sensitivity tradeoffs elsewhere, since
the only thing exposed to someone who guessed another org's id is who's editing what there, nothing
about the item's own data.

A round of accessibility fixes found via a targeted pass rather than a live report. `manage/reservations`'
calendar view (`ReservationCalendarComponent`) had `role="grid"`/`role="gridcell"` markup already in
place, but every day cell was its own native `<button>` with no `tabindex` management at all — basic
Enter/Space activation already worked for free from being a real `<button>`, but tabbing *through* a
month took up to 42 presses, and arrow keys (what a screen reader's own grid navigation mode expects
given the `role="grid"` markup already there) did nothing. Fixed with the standard WAI-ARIA APG
roving-tabindex pattern: exactly one cell (`focusedIso`) carries `tabindex="0"` at a time, everything
else is `-1`; Arrow keys move it a day/week, Home/End jump to the start/end of the focused day's own
week. `selectDay()` (called by both a click and native button activation) keeps the roving stop in
sync with whatever was just actually chosen, so the very next Tab press doesn't skip past the grid
entirely. Arrowing past the currently-rendered 6-week window shifts the displayed month first (same
as clicking Previous/Next), deferring the actual `.focus()` call via `setTimeout` until that new
month's grid has actually rendered. Each cell also gained a proper `aria-label` (`dayAriaLabel()` —
full date plus Today/Selected/reservation-count flags, since the visible content alone — a bare day
number plus whatever chips happen to be showing — doesn't say which month/year a screen reader user
is on) and `aria-selected`, and the month `<h3>` gained `aria-live="polite"` so a screen reader user
hears the month change on Previous/Next even if they're not focused on it.

Separately, Angular's router never moves focus on navigation the way a full page load naturally would
— a screen reader or keyboard-only user navigating via the drawer/command palette/quick menu got no
signal a navigation even happened. `AppComponent`'s constructor now subscribes to `router.events`
directly (a plain `.subscribe()`, no RxJS operators, matching this app's usual convention) and, on
every `NavigationEnd` whose *path* actually changed (comparing `path.split('?')[0]`, the same
convention `showChrome()` itself already uses — so a same-page query-only navigation, a Settings tab
switch or an `?item=`/`?task=` deep link, never re-triggers this), moves focus to the new page's own
heading via `focusPageHeading()`. That method looks for a real `<h1>` first, falling back to
`PageHeaderComponent`'s own `role="heading"`/`aria-level="1"` override (see that component's own
`headingLevel` doc comment for why some pages' "h1" isn't a literal `<h1>` tag) — scoped to
`#main-content` so it can never land on the header/footer's own chrome — and gives it a `tabindex="-1"`
if it doesn't already have one (left in place afterward, same "harmless to leave set" convention this
app's other one-off focus targets already use). Deferred one tick via `setTimeout`, since
`NavigationEnd` fires once the route itself resolves but the routed component's own template hasn't
necessarily painted its heading into the DOM yet at that exact moment.

Inventory and Manage Tasks' "All tasks" tab both get a **Saved views** row — a chip per named
filter/search/sort combo, click to re-apply, a small trailing × to delete — via a new shared,
page-agnostic `SavedViewsBarComponent` (`shared/components/saved-views-bar`). The component has no
idea what a "view" actually contains for either page (Inventory's is search/status/stock-level/
category/physical-location/sort/card-vs-table; Manage Tasks' is search/assignee/status/due-before) —
`TFilters` is a generic, opaque, JSON-serializable object the host constructs (`captureCurrentView()`/
`captureTaskFilters()`) and reads back (`applySavedView()`/`applyTaskSavedView()`), the same "dumb,
host owns the actual meaning" shape `BulkActionToolbarComponent` already established for its own
page-agnostic "N selected" chrome — except this one is self-contained (unlike that toolbar), owning
its own `localStorage` read/write via `shared/utils/saved-views.ts`'s `loadSavedViews()`/
`addSavedView()`/`removeSavedView()`, same reasoning `PageIntroComponent` already gives for owning its
own dismissal storage rather than making every host duplicate it. Keyed
`shelf-sync:saved-views:<userId>:<pageKey>` — per user (not org-wide) and browser-local only, not
synced across devices, the same documented tradeoff `PageIntroComponent`'s own dismissal state and
`HomeComponent`'s Getting-Started dismissal already accept, for the same reason: cheap, no schema
change, and the worst case (a different device just doesn't have this saved view yet) is mild. A
saved view whose stored filters deep-equal (`JSON.stringify` comparison) the host's current filter
state renders with a highlighted chip (`isActive()`), so it's visible when the page is currently
showing exactly one of them. Saving rejects a case-insensitive duplicate name rather than silently
creating a second entry with the same label, the same "likely accidental duplicate" reasoning
`isDuplicateItemName()` already established for inventory item names elsewhere in this app.
Manage Tasks' own `taskFilterDueBefore` is a `Date` on the component but stored/round-tripped through
this as a plain `'YYYY-MM-DD'` string (`toIsoDateString()`/`parseIsoDate()`) — a `Date` survives
`JSON.stringify()` fine but never comes back as one from `JSON.parse()`, which would have broken
re-applying a saved view onto that field's own `matDatepicker` binding, which expects a real `Date`.
"Save current view" itself only ever makes sense once something's actually been searched/filtered —
saving the untouched default would just be a named view that looks exactly like having no view
applied at all — so `SavedViewsBarComponent` takes a third required input, `hasActiveFilters`, that
disables the button (with a `matTooltip` explaining why) and no-ops `startNaming()` even if called
directly. Rather than this component trying to work out "is TFilters at its default" generically
(which it has no way to do for an opaque, page-defined shape), both hosts just pass their own
already-existing `hasActiveFilters`/`hasActiveTaskFilters` getters — each page already had one, since
both already drive that same page's own "Clear filters" button visibility.

`AppComponent`'s own route-change focus move (see its own paragraph above) tags the heading it
focuses with a `.route-focus-heading` class, and a new global `styles.scss` rule suppresses the
browser's default focus outline on it — a `tabindex="-1"` element (what every such heading either
already is or gets set to) can never be reached by a sighted keyboard user actually pressing
Tab/Shift+Tab, so a focus ring appearing there on every navigation was purely a distracting side
effect of the programmatic `.focus()` call, never a meaningful "here's where your Tab press landed"
cue. Screen reader users are unaffected either way, since the focus move itself — not any visual
styling — is what they rely on. Same "must be global, not component-scoped" reasoning
`router-outlet + *`'s own fade-in rule already established for itself, for the identical structural
reason: the heading belongs to whichever routed component just mounted, never `AppComponent`.

Every realtime "someone else just changed this" update in the app now also gets spoken aloud to
screen reader users, alongside the purely-visual `.realtime-flash` pulse `FlashTracker` already
drives — a gap the `.realtime-flash` mechanism itself never closed, since a CSS animation is
invisible to anyone not watching the screen. `shared/utils/realtime-announce.ts`'s
`flashAndAnnounceChanges()` is the one shared entry point every realtime-flashing page now calls
instead of looping `flashTracker.flash(id)` directly — it still flashes every id exactly as before,
but for each one that resolves to a real label (a `labelFor` callback the caller supplies) it also
calls Angular CDK's own `LiveAnnouncer` (already a transitive dependency via Angular Material/CDK,
not a new one — this app's usual "hand-roll it" preference is about avoiding a *charting/calendar*
dependency, not reimplementing an accessibility primitive CDK already ships) with a caller-formatted
message (a `describe` callback). Wired into all nine realtime-flash consumers:
`InventoryComponent`/`ManageInventoryComponent` call it inline at their own single-row-patch site
(passing a one-element array rather than a whole pending set); `TasksComponent`/
`ManageTasksComponent`/`ManageTeamComponent`/`ManageOrdersComponent`/`ManageReservationsComponent`/
`BroadcastsComponent` call it from their own `reloadAndFlashChangedX()`, resolving each id's label
by looking it up in whatever list that reload just refreshed (a task's title, an order/reservation's
`itemName`, a broadcast's title); `ManageAuditsComponent`'s own `pendingFlashIds` mixes two different
id spaces (an audit's own id, or — via the audit-schedules channel — a *schedule's* own id, which
never appears in `audits` at all), so its `auditOrScheduleLabel()` checks both lists rather than
just one. `ManageSuppliersComponent`'s own `FlashTracker` usage is deliberately untouched — it backs
`?highlight=<id>` (the command palette's deep-link landing treatment), not a realtime update, a
different semantic ("you just navigated here" vs. "something changed while you were watching") this
feature doesn't apply to.

Both a reservation's date range and a task's own due date can now be downloaded as a `.ics` file and
added to a real calendar app (Google/Outlook/Apple) — this app's own dates otherwise only ever lived
inside ShelfSync itself. `shared/utils/calendar-export.ts`'s `buildIcsFile()`/`downloadIcsFile()` are
a hand-rolled, single-VEVENT iCalendar builder (same "no new runtime dependency" convention
`DonutChartComponent`/`TrendChartComponent`/`ReservationCalendarComponent`/etc. already established
for their own hand-rolled pieces — RFC 5545 is simple enough for the one-event-per-file shape this
needs) plus the same plain `<a download>`-via-`Blob` technique `inventory-export.ts`'s own
`downloadCsv()` already uses. Every event this builds is all-day (`DTSTART`/`DTEND` with
`VALUE=DATE`, no time-of-day) since both of this app's own date fields already are — the one
genuinely fiddly part of iCalendar files (timezone handling) simply doesn't arise. `DTEND` is
computed as one day past the caller's own *inclusive* end date, since iCalendar's own all-day
`DTEND` is exclusive; a reservation's own start/end map straight onto this, a task's due date passes
only a `startDate` and gets a same-day-plus-one `DTEND` for free. `ManageReservationsComponent` gets
an "Add to calendar" icon button next to the date range on both the single-reservation
`#reservationCard` template and the multi-item `#reservationGroupCard` one (`downloadReservationIcs()`/
`downloadReservationGroupIcs()`, the latter listing every item in the group in its own description
rather than one file per line item, since a group already shares one date range) — available
regardless of a reservation's status, even a cancelled/returned one's historical dates are harmless
to export. `TaskDetailModalComponent` gets the same button beside its own due-date `<dd>`
(`downloadDueDateIcs()`), pulled out of the overdue pill's own flex row into a sibling `<span>`
(`.due-date-cell`) so the button doesn't end up rendered directly on the pill's solid
`--app-danger-bg` fill, which would fight it for contrast.

An inventory item's photos can now be reordered by dragging them, not just added/removed — the
gallery only ever supported add/remove before this despite `inventory_item_images.position` already
existing to support display order. Uses Angular CDK's own `DragDropModule`/`CdkDrag`/`CdkDropList`
rather than a hand-rolled mouse-only implementation (again, not a new dependency — the same
"CDK-shipped interaction primitive, not a charting/calendar library" reasoning `LiveAnnouncer` above
already draws) on `ModalTableComponent`'s existing-images preview row specifically — a newly staged
(not-yet-uploaded) photo stays out of scope for dragging and always appends after the existing ones
(matching `uploadInventoryItemImages()`'s own `startPosition` param), so there's nothing to merge two
different "kinds" of photo into one drag list for. `onExistingImageDrop()` reorders `existingImages`
in place via CDK's `moveItemInArray()`; `imagesReordered` (folded into `hasUnsavedChanges()` and
`startEdit()`'s own `originalImageOrder` snapshot) diffs the *current* order against the order the
edit session started in, filtering `removedImageIds` out of both sides first so marking a photo for
removal — which shifts every later index — never reads as a reorder on its own. `saveImageChanges()`
writes new position values (a plain `0..n-1` per whatever's left in the current array order, dense
values with no particular meaning beyond sort order — only the *relative* order any later
`.order('position')` read cares about) for whichever surviving photos actually moved, skipping a
photo whose index didn't change; this happens before the upload step, though the ordering between
them is actually immaterial — a new upload's own position (computed from a plain remaining-count) is
always numerically after every surviving existing photo regardless of what values the reorder step
just wrote. A drag handle icon (`cdkDragHandle`) confines the actual drag gesture to its own small
button rather than the whole thumbnail, so clicking the image or the remove button never accidentally
starts a drag; CDK's own drag-drop already supports keyboard reordering out of the box (focus the
handle, Space to pick up, arrow keys to move, Space to drop, with its own live-region announcements)
with no extra work needed on top, a nice side benefit of reaching for CDK here rather than a
mouse-only custom implementation. The actual `.cdk-drag-preview`/`.cdk-drag-placeholder` visual
polish (a lifted shadow while dragging, a dashed empty slot left behind) lives in the global
`styles.scss`, not `ModalTableComponent`'s own stylesheet — same "must be global" reasoning as
`.route-focus-heading` and `router-outlet + *` above, but for a different mechanism: CDK clones the
dragged element into a `.cdk-drag-preview` appended near the very end of `<body>`, and even the
in-place `.cdk-drag-placeholder` it leaves behind is created by CDK itself, so neither one ever
carries `ModalTableComponent`'s own emulated-encapsulation attribute for a scoped selector to match.

Any user can turn on optional two-factor authentication (TOTP) for their own account from the
Account page's new "Two-factor authentication" card — self-service and opt-in, not an org-wide
mandate (see below for the "make it mandatory" tradeoffs this deliberately leaves open). Backed
entirely by Supabase Auth's own native MFA support (`supabase.auth.mfa.*` against `auth.mfa_factors`
— a table this schema doesn't own or migrate) rather than a bespoke table/columns; TOTP specifically
(not Supabase's phone or WebAuthn/passkey factor types) since it needs no SMS provider bill and every
authenticator app already speaks it. `core/mfa.service.ts`'s `MfaService` (root-provided, same shape
`SupplierService`/`ImpersonationService` already establish for a cohesive pulled-out concern) wraps
the whole lifecycle: `enrollTotp()` (clears any stale `unverified` factor left over from an abandoned
attempt first, then starts a fresh one), `confirmEnrollment()`/`unenroll()`, and `isVerificationPending()`
(true when this specific *session* — not just the account — still owes a challenge: a verified factor
exists but the JWT's own `aal` claim isn't `aal2` yet, the common case being a fresh sign-in).
`disableTwoFactor()` on the Account page confirms first via `ConfirmDialogComponent` (`danger: false`
— fully reversible, just worth a beat before weakening the account's own login security), mirroring
the same "consequential but reversible" gate this schema already applies to org suspension.

`enrollTotp()` deliberately hands the caller `data.totp.uri` (the raw `otpauth://` URI) rather than
Supabase's own pre-rendered `qr_code` SVG string, and `TwoFactorSetupModalComponent` renders its own
QR image from that URI via the `qrcode` package's `QRCode.toDataURL()` — the exact same library and
technique `QrLabelModalComponent` already uses successfully elsewhere in this app for its own printable
item labels, producing a plain `data:image/png;base64,...` string that needs no `DomSanitizer` bypass
at all to bind to `<img src>`. This isn't the first thing that was tried: two earlier attempts at using
Supabase's own `qr_code` SVG string directly as a `data:image/svg+xml,...` URL (first raw, then
percent-encoded via `encodeURIComponent` to escape a literal `#` the SVG's own `fill="#000000"`
attributes would otherwise have a URL parser misread as a fragment separator) both rendered nothing in
a real browser, for a reason that was never conclusively identified — a `DomSanitizer.bypassSecurityTrustUrl`
theory (versus `...TrustResourceUrl`, on the reasoning that `<img src>` is registered under
`SecurityContext.URL` in Angular's own DOM security schema, not `RESOURCE_URL`) was tried and confirmed,
via reading Angular's own sanitizer source directly, to be a dead end too — Angular explicitly permits a
`ResourceUrl`-trusted value in a `URL` context as a documented compatibility carve-out, so that trust-type
mismatch was never actually the bug. Rather than continue debugging an unfamiliar third-party string
format blind, generating the QR ourselves via a library this codebase already trusts sidesteps the whole
class of doubt — worth remembering if a future "why won't this image render" bug looks similar: verify
the actual sanitizer/URL mechanics against Angular's own source before trusting a plausible-sounding
theory, and prefer a codebase's own already-proven rendering path over a third party's undocumented
string format when one's available.

A new `/mfa-verify` route (`MfaVerifyComponent`, plain `authGuard` — same reasoning
`/pending-approval` already gives for not guarding itself with the very check it exists to satisfy)
is where a two-factor account actually enters its code post-login. `approvedGuard` is the real
enforcement point on the client: it now checks `mfaService.isVerificationPending()` *before* even
looking at membership status, redirecting to `/mfa-verify?returnUrl=...` first — proving it's really
this person comes before telling them anything about their org access. `LoginComponent.attemptLogin()`
mirrors the same check right after a successful sign-in purely for UX (skips a flash of `/home` before
being bounced back out); `approvedGuard` would catch it regardless. Same chrome treatment as
`/pending-approval` — not added to `AppComponent.showChrome()`'s hide-list, since this is a real
already-authenticated session, not a pre-login page.

None of this is enforced only client-side, though — a locked-out attacker with a stolen password and
a raw API client (no browser, no guards) would sail straight past both of the checks above. The real
enforcement is a small addition to the same two choke-point functions every other fail-closed check in
this schema already funnels through (`add_mfa_enforcement` migration): `current_user_org_id()` now
also requires `auth.jwt() ->> 'aal' = 'aal2'` for any account with a verified TOTP factor (falling
through to its existing checks unchanged for an account that's never enrolled — this is genuinely
opt-in, zero behavior change until someone turns it on for themselves), and `is_platform_admin()` gets
the identical clause — a second, explicit gate rather than relying on `current_user_org_id()` alone,
since Studio's own RPCs (including the impersonation Edge Function) are gated by `is_platform_admin()`
directly with no dependency on the other function at all. Verified directly against the hosted
project before writing the migration (a rolled-back `begin`/`rollback` transaction via
`supabase db query -f`, not just reviewed for syntax) — both that reading `auth.mfa_factors` from a
`security definer` function works the same way this schema's existing `storage.objects` reads already
do (see `get_inventory_photo_storage_usage`), and that the two rewritten functions still resolve
correctly with zero factors enrolled anywhere, per this repo's own "a function compiling isn't enough,
run it for real" lesson.

Two things worth calling out before this goes further than one admin's own account. First, a real,
deliberately unsolved gap: Supabase's own TOTP factors have no backup/recovery-code mechanism, so
losing the authenticator device with no other platform admin around means recovery is a manual
`auth.mfa_factors` delete run directly against the hosted project — the same "real sensitive one-off,
not app-mediated" category `is_platform_admin` itself already sits in, not anything self-service.
Fine for a single-admin app today; worth a real answer (backup codes, or simply a second platform
admin as a recovery path) before this is ever *required* rather than opt-in. Second, making it
mandatory rather than opt-in had no single obvious lever yet at the time — the natural next steps,
roughly in order of how much this app's own conventions already anticipated them, were: (a) an
org-wide `site_settings.require_mfa_for_admins` (or `_for_all`) toggle in Settings > Workflow,
mirroring every other per-org policy switch already there, checked at sign-in/`approvedGuard` time to
route an unenrolled-but-required account to a "you must set up two-factor before continuing" version
of the Account page's own card rather than `/home`; or (b) requiring it platform-wide just for
`is_platform_admin` accounts specifically, which is arguably the single highest-value, lowest-effort
version of this given what that flag alone already grants (Studio, impersonation) — (b) remains
unbuilt, a natural extension of the same pieces already in place, but (a) has since shipped, as
described next.

An admin can now actually turn (a) on — `site_settings.require_mfa_for_all`
(`add_site_settings_require_mfa_for_all` migration), a new "Security" card on Settings > Workflow
alongside Retirement approval/Bulk edit/Price & supplier edits and Email notifications, same
local-selection/save-button/error pattern every other toggle on that tab already uses. Off by
default, so every existing org keeps two-factor purely opt-in per account until an admin turns this
on; once on, it applies to *every* approved member regardless of role, not just admins/managers — the
simpler, more literal reading of "org-wide" for a first pass, rather than a role-scoped variant.
Enforcement is the identical choke point `add_mfa_enforcement` already established:
`current_user_org_id()`'s existing "aal2, or no verified factor exists" escape hatch is narrowed to
also require the org not to have opted into this, so an unenrolled account in a requiring org fails
every org-scoped RLS check schema-wide, the same fail-closed shape `deleted_at`/`suspended_at`/
`account_locked_at` already have there. Deliberately does *not* touch `is_platform_admin()` — that
gate is for Studio's cross-org surface, which isn't scoped to any one org's `site_settings` row, so no
per-org toggle should reach it either way.

The one real wrinkle: `current_user_org_id()` is exactly what `site_settings`' own SELECT policy is
scoped by, so if the new check read that table directly, an org turning this on would make its own
`site_settings` row instantly unreadable to every member who hasn't enrolled yet — including the
person trying to find out *why*, the moment the toggle flips. `current_org_requires_mfa()`, a second,
narrower `SECURITY DEFINER` function added alongside, sidesteps this the same way
`current_user_role()`/`is_platform_admin()` already bypass RLS for their own controlled lookups — it
looks up the caller's own profile's org and `site_settings` row directly, independent of whether the
enforcement it feeds into has already kicked in for that same caller. The client calls it as a plain
RPC (`MfaService.isRequiredOrgWide()`) for the identical reason: a plain `site_settings.select()` on
the client would hit the same chicken-and-egg RLS wall. `SiteSettingsService`'s own
`requireMfaForAll` signal (loaded the normal way, alongside every other setting) is only safe for an
admin who's already past the gate, editing the setting itself on the Settings page — it is
deliberately *not* what any of the enforcement-adjacent checks below read.

Three client-side call sites read `isRequiredOrgWide()` (always paired with `isEnrolled()`, and
always short-circuited so the RPC only fires when actually needed): `approvedGuard` — right after its
existing `isVerificationPending()`/`/mfa-verify` check, since "never enrolled at all" is a different
case from "this session still owes a challenge against an already-verified factor" and has nowhere to
challenge against — redirects to `/account` instead, with an explicit exemption for navigation to
`/account` itself (otherwise the person could never reach the one page that lets them comply).
`LoginComponent.attemptLogin()` mirrors the identical check purely for UX, same "avoid a visible flash
of the wrong destination" reasoning its own `/mfa-verify` mirror already has — `approvedGuard` would
catch it regardless on the very next navigation. And `AccountComponent` itself, which shows a
prominent inline `error-message` banner on its two-factor card ("Your organization requires two-factor
authentication...") whenever this account is unenrolled and required — computed live from the same
RPC in `ngOnInit()` rather than a query param carried through the redirect, so it stays correct even
on a direct refresh of `/account` (a query param wouldn't survive that).

Two more small "fun design tweaks," same spirit as the confetti/loading-caption/party-mode pass
above but smaller in scope. First, the plain `.stat-value`/`.page-hero-pulse-value` tiles on
`manage/reports` and Studio's own hero now count up from their previous value rather than just
popping in, via a new shared `CountUpDirective` (`shared/directives/count-up.directive.ts` — this
app's first directive; every hand-rolled visual before this was a component). It writes straight to
the host element's `textContent` via `ElementRef` rather than through an Angular binding, so it never
touches anything change-detection-bound — the underlying component property each tile still reads
from is completely unaffected, which is why none of the existing specs for either page needed to
change. Deliberately `OnChanges`, not a plain `@Input() set value()`: a caller binds both
`[appCountUp]="value"` and `[countUpFormat]="someFormatter"` on the same element, and Angular applies
a directive's bound inputs in the *template's own attribute order*, not by property declaration order
in the class — a `value` setter reading `this.countUpFormat` synchronously could fire before
`countUpFormat` itself had been assigned that same change-detection pass, silently formatting with
the *previous* function for one render (caught exactly that way, via this directive's own spec).
`ngOnChanges` runs once per pass, after every `@Input()` on the directive has already been assigned
regardless of binding order, which is what actually fixes it. The rAF loop runs via
`NgZone.runOutsideAngular()` and never re-enters — same reasoning `LoadingCaptionComponent`/
`PartyModeService` already establish for their own timers, doubly true here since an in-zone rAF
would trigger a full app-wide change-detection pass on every animation frame for a value nothing
else is bound to — and skips straight to the final value under `prefers-reduced-motion`, same as
every other ambient animation in this app. `shared/utils/count-up-format.ts`'s `countUpNumber`/
`countUpCurrency` are the two formatters actually used (matching `| number`/`| currency`'s own
default precision exactly, so switching a tile onto the directive changes only how it *arrives* at
its resting value, not the value's own formatting); the directive's own default `countUpFormat` is
`countUpNumber`, so most tiles don't pass one at all. Deliberately scoped to tiles that render a
single plain figure — `manage/billing`'s own usage stats ("3 of 10", "42.3 of 500 MB") and Reports'
own "Completion rate"/"Avg. time to close" tiles are composite labels, not a bare number, and
Reports' donut/ring charts are a different (SVG, not text-node) rendering mechanism entirely — left
alone rather than reshaping either to fit.

Second, `HeaderComponent`'s light/dark toggle button — previously an instant swap between two
unrelated Material icon glyphs (`light_mode`/`dark_mode`) — now morphs a single icon between a sun
and a crescent moon, via a new `ThemeModeIconComponent` (`shared/components/theme-mode-icon`). Same
"no new runtime dependency" convention `DonutChartComponent`/`RingStatComponent`/`TrendChartComponent`
already establish for their own hand-rolled SVG — the crescent is the classic two-circle mask trick:
a second, invisible "cutout" circle slides over the icon's own body circle through an SVG `<mask>`,
parked far away and shrunk in light mode (no overlap, so the body renders as a full disc = sun) and
close/full-size in dark mode (overlaps enough to bite a crescent out of the body = moon), while eight
rays fade and shrink toward the center at the same time — driven entirely by a `.is-dark` class swap
plus CSS `transform`/`opacity` transitions (universally animatable, unlike animating raw `cx`/`r`
attributes directly), gated behind `prefers-reduced-motion` the same way as everything else. Each
instance gets its own generated mask id (a plain incrementing counter, not `Math.random()` — this
only ever needs to be unique within one page load) so two instances on the same page can't collide,
even though today there's only the one usage. Scoped to just this button — Account page's own
Appearance card is a `mat-button-toggle-group` of two separate, statically-iconed buttons (Light
always shows a sun glyph, Dark always shows a moon glyph), not one icon flipping identity, so a morph
doesn't apply there the same way.

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
- Unit tests: `npm test` — runs Karma/Jasmine, headless-or-not per whatever's passed through
  (`npm test -- --watch=false --browsers=ChromeHeadless`, matching CI's own invocation). This goes
  through `scripts/run-tests.js` rather than calling `ng test` directly — on a Windows machine with no
  real Chrome install (Edge only), Karma's `ChromeHeadless`/`Chrome` launchers fail outright with
  "Cannot find the binary... Please set env variable CHROME_BIN" instead of trying any other
  Chromium browser, so this wrapper auto-detects and sets `CHROME_BIN` to Edge in that one case
  (respecting an explicit `CHROME_BIN` already set, and never touching anything on a non-Windows
  machine). CI (`.github/workflows/ci.yml`) calls `npx ng test` directly, bypassing this wrapper
  entirely — its own `ubuntu-latest` runners ship Chrome preinstalled, so it never needed this fix
  and isn't affected by it either way. `ng test` itself still works directly too, same as always,
  for anyone who already has `CHROME_BIN` set or a real Chrome install.
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
    (`send-notification-email`, `impersonate-user`, `create-checkout-session`,
    `create-billing-portal-session`, or `stripe-webhook` — see Project Overview above for all five)
    to the linked project; no `npm run` wrapper for this yet since it's only been needed a handful of
    times so far. `send-notification-email`'s function secrets (`RESEND_API_KEY`, `WEBHOOK_SECRET`)
    are set via `npx supabase secrets set NAME=value` — not committed anywhere, and not visible again
    afterward (`supabase secrets list` shows a digest, not the value). `impersonate-user` needs no
    secrets of its own — it only ever uses the `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
    `SUPABASE_SERVICE_ROLE_KEY` every Edge Function already gets injected automatically.
    `create-checkout-session`/`create-billing-portal-session`/`stripe-webhook` all need
    `STRIPE_SECRET_KEY` (a **restricted** API key — Checkout Sessions/Customers/Billing-portal
    sessions: Write, Subscriptions: Read — never a full secret key); `stripe-webhook` additionally
    needs `STRIPE_WEBHOOK_SECRET`, obtained only after that function is deployed and a webhook
    endpoint registered against its real URL in the Stripe Dashboard (the same
    deploy-then-register-then-set-the-secret sequencing `send-notification-email`'s own
    `WEBHOOK_SECRET` history already established). Neither is ever committed.
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

`src/_headers` sets response headers on every route (Workers static-assets honors the same
`_headers`-at-the-root convention classic Pages does — this is a different mechanism than
`_redirects`, plain header injection rather than a redirect rule, so it wasn't affected by that
product's own redirect-loop rejection above): `X-Content-Type-Options`/`X-Frame-Options`/
`Referrer-Policy`/`Permissions-Policy`/`Strict-Transport-Security`, plus a real
`Content-Security-Policy` — see that file's own comment for the exact host allowlist (Supabase's
project host, Cloudflare Turnstile, Google Fonts) and why `style-src` alone still needs
`'unsafe-inline'` (Angular's per-component `ViewEncapsulation` styles and Material/CDK's own
overlay styles are both injected as runtime `<style>` tags, and a nonce-based CSP needs
per-request server templating this pure-static deploy doesn't have). Getting `script-src` down to
`'self'` plus just Turnstile's own host (no `'unsafe-inline'`/hash-pinning needed there) meant
moving `index.html`'s two inline `<head>` scripts (pre-boot theme + `scrollRestoration`) out to a
real external file, `assets/theme-init.js` — a plain `<script src="...">` with no `async`/`defer`
still blocks parsing and runs immediately in document order, so this changes nothing about when it
actually runs. `src/robots.txt`/`src/sitemap.xml` cover the handful of routes that are actually
public (`/`, `/pricing`, `/login`, `/register`, `/privacy`, `/terms` — see
`app-routing.module.ts`'s own unguarded allowlist) and disallow everything else, since an anonymous
crawler hitting a guarded route just gets bounced to `/login` client-side once the JS boots anyway
— this is a crawl-budget courtesy, not a security boundary (RLS already owns that). All three
files are wired into `angular.json`'s `assets` array as bare root-level entries (same shorthand
`src/favicon.ico` already used) rather than living under `src/assets/`, since `_headers`/
`robots.txt`/`sitemap.xml` all have to land at the dist root to be read at all.

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
  `manage` is a card hub (`ManageComponent`) linking to thirteen flat sibling routes —
  `manage/inventory`, `manage/tasks`, `manage/team`, `manage/activity`, `manage/error-log`,
  `manage/suppliers`, `manage/orders`, `manage/release-notes`, `manage/reports` (all `manageGuard`:
  admin OR manager), `manage/reservations`/`manage/audits` (`approvedGuard` only — every approved org
  member, not just admin/manager; see the Project Overview section above) and
  `manage/billing`/`manage/danger-zone`/`manage/settings` (`adminGuard`, stricter — financial info,
  org export/delete, and site-wide branding respectively) — rather than nested child routes,
  matching the rest of the app's flat routing. The hub itself (`ManageComponent`) groups these
  into four labeled sections — Inventory (Inventory/Suppliers/Orders/Reservations/Audits), Team & tasks
  (Tasks/Team), Insights (Activity Log/Release Notes/Reports/Error Log), and Admin
  (Billing/Settings/Danger Zone, Danger Zone deliberately last) — rather than one flat grid; with a
  dozen-plus cards, grouping by what they're actually for keeps the page scannable. The three Admin
  cards dropped their old individual "Admin" `permission-badge` pill once grouped under its own
  section header — redundant once the section itself already only renders for
  `authService.role() === 'admin'`.
  `manage/settings` lives under `manage` (not its own top-level `settings` route) for
  the same reason as every other admin/manager tool here — it's reachable only via the Manage hub's
  own Settings card, not a direct header nav link or Home card, matching Billing/Danger Zone's own
  precedent of being Manage-hub-only rather than duplicated elsewhere. `studio` and its flat
  sibling routes (`studio/feedback`, `studio/error-log`, `studio/organizations`, `studio/users`,
  `studio/usage`, `studio/email-log`, `studio/audit-log`, `studio/release-notes`)
  follow the exact same card-hub/flat-sibling-routes shape as `manage` — but guarded by
  `platformAdminGuard`, a genuinely different, cross-org audience (`profiles.is_platform_admin`,
  not any `role`) than every guard above; see the Project Overview section above for the full
  reasoning and why this is deliberately not nested under `manage` itself.
  `studio/organizations/:id` (`StudioOrgDetailComponent`) is this app's first parameterized
  detail-page route — see its own Project Overview paragraph below for why Studio's info
  drill-downs moved from a popup to a real page. `studio/users/:id` (`StudioUserDetailComponent`)
  is the second, following the same shape for a person rather than an org — see its own Project
  Overview paragraph for the account-lock feature it backs. Every route uses
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
  billing.service.ts     # BillingService — org's real Stripe subscription state; load(), startCheckout()/openBillingPortal() (call an Edge Function, redirect to the returned url)
  reservation-kit.service.ts # ReservationKitService — org's saved reservation-kit directory; load(itemNamesById)/create()/update()/remove()
  notification-center.service.ts # NotificationCenterService — HeaderComponent's bell dropdown; notifications signal + unreadCount, markAsRead()/markAllAsRead()
  command-palette.service.ts # CommandPaletteService — HeaderComponent's Ctrl/Cmd+K global search; lazily loads/caches searchable data, results(query) is a pure local filter
  confetti.service.ts     # ConfettiService — fires a hand-rolled confetti burst (shared/components/confetti-burst) for a genuine "just happened" celebration moment
  party-mode.service.ts   # PartyModeService — Konami-code easter egg: temporary 'party' theme + a confetti drizzle, both self-reverting
  impersonation.service.ts # ImpersonationService — platform-admin "impersonate as user" session swap; start()/stop(), isImpersonating signal backing ImpersonationBannerComponent
  item-edit-presence.service.ts # ItemEditPresenceService — Supabase Realtime Presence (not postgres_changes), who's mid-edit on which inventory item org-wide; backs Inventory's card/table border and ModalTableComponent's own "being edited" banner
  guards/auth.guard.ts    # CanActivateFn — awaits authService.getSession() directly
  guards/manage.guard.ts  # admin OR manager
  guards/admin.guard.ts   # admin only (manage/settings, manage/billing, manage/danger-zone)
  guards/platform-admin.guard.ts # is_platform_admin only — a different, cross-org audience from every guard above (studio/*)
  guards/unsaved-changes.guard.ts # CanDeactivateFn — confirms leaving a dirty create form (manage/inventory, manage/tasks)
header/, footer/                                           # standalone layout components; header has the logout button
login/                                                      # standalone login screen, real Supabase auth
register/                                                   # standalone signup screen, real Supabase auth
pricing/                                                    # standalone public pricing page, real Stripe checkout for a signed-in admin (see Project Overview above)
privacy/, terms/                                            # standalone legal pages, no session required (see Project Overview above)
home/                                                        # post-login landing hub: cards linking to the pages below
inventory/                                                  # standalone inventory page: filters, item table, opens modal
tasks/                                                      # standalone personal "My Tasks" list (row-styled task-card)
broadcasts/                                                  # every approved member: org-wide announcements feed, see Project Overview above
manage/                                                     # card hub (ManageComponent) linking to the pages below
  inventory/, tasks/, team/, activity/, suppliers/, orders/ # admin/manager only: inventory (+ CSV export), tasks, team administration, the cross-entity activity feed, the supplier directory, and restock orders
  reservations/                                             # every approved member: date-ranged reservations of an item's stock (single item, several at once, or from a saved kit); admin/manager also get a "Kits" tab to curate the kit directory
  audits/, audits/audit-detail/                              # every approved member: physical inventory audits ("cycle counts") plus recurring audit schedules, see Project Overview above
  release-notes/                                            # admin/manager only: "What's new" list, see Project Overview above
  error-log/                                                # admin/manager only: client_error_log viewer, see Supabase Schema section
  reports/                                                  # admin/manager only: inventory value/stock health, stock movement/loss, task throughput
  billing/                                                  # admin only: real Stripe subscription state + upgrade/manage-billing actions, see Project Overview above
  danger-zone/                                              # admin only: org data export + soft-delete (organizations.deleted_at)
  settings/                                                # admin-only: theme picker + logo upload (site_settings) — see Project Overview above
account/                                                    # profile info, avatar picker, light/dark mode toggle, quick-menu picker
help/                                                        # static in-app "how do I..." reference (see Project Overview above)
studio/                                                     # platform-admin only (is_platform_admin, not any org role): card hub (StudioComponent) linking to feedback/, error-log/, organizations/, users/, usage/, email-log/, audit-log/, release-notes/ — see Project Overview above
shared/
  components/modal-table/    # standalone Material dialog showing InventoryItem details
  components/bulk-action-toolbar/ # shared "N selected / select all / clear" chrome for every page with bulk actions
  components/bulk-reassign-modal/ # Inventory's bulk category/physical-location reassignment dialog
  components/supplier-form-modal/ # add/edit dialog backing manage/suppliers' directory CRUD
  components/place-order-modal/ # self-contained item picker + quantity/note dialog backing manage/orders' "Place order"
  components/import-inventory-modal/ # self-contained template-download + upload/preview/validate + bulk-create dialog backing manage/inventory's "Import" button
  components/place-reservation-modal/ # self-contained item picker (one item, several, or from a saved kit) + date-range/quantity dialog backing manage/reservations' "New reservation"
  components/reservation-kit-form-modal/ # add/edit dialog backing manage/reservations' "Kits" tab CRUD
  components/start-audit-modal/ # self-contained scope (physical_location)/note dialog calling start_inventory_audit(), backing manage/audits' "Start audit"
  components/audit-schedule-form-modal/ # self-contained scope/frequency/first-occurrence-date/note dialog calling create_audit_schedule()/update_audit_schedule(), backing manage/audits' "Recurring audits" section
  components/discard-modal/ # quantity ("Discard all" or a specific amount) + mandatory-reason dialog backing ModalTableComponent's "Discard" button
  components/turnstile-widget/ # Cloudflare Turnstile CAPTCHA, embedded on Login/Register/Forgot Password
  components/help-tooltip/ # small "?" matTooltip icon button explaining a non-obvious control inline
  components/page-intro/ # one-time dismissible orientation banner for a page's first-time visitor (Inventory, Tasks, Manage hub)
  components/donut-chart/ # hand-rolled SVG donut chart (no charting library) — backs manage/reports' "Value by category"
  components/ring-stat/ # hand-rolled SVG percentage ring gauge — backs manage/reports' completion-rate stat
  components/trend-chart/ # hand-rolled SVG line-chart sparkline (no charting library) — backs studio's own growth trend charts
  components/page-header/ # icon-chip + title/subtitle header, shared across most manage/* sub-pages
  components/feedback-modal/ # self-contained feedback-type + message dialog backing the Help page's "Send feedback" button
  components/broadcast-modal/ # self-contained title/message + member/item reference picker dialog backing /broadcasts, create and edit alike
  components/lock-user-account-modal/ # mandatory-reason dialog backing StudioUserDetailComponent's account-lock toggle
  components/reservation-calendar/ # hand-rolled CSS-grid month calendar (no calendar library) — backs manage/reservations' calendar view
  components/release-note-form-modal/ # self-contained title/description/severity/posted-date dialog backing studio/release-notes, create and edit alike
  components/confetti-burst/ # hand-rolled CSS confetti particles (no library) — created on demand by ConfettiService, never rendered from a template directly
  components/impersonate-user-modal/ # mandatory-reason dialog backing StudioUserDetailComponent's "Impersonate" button
  components/impersonation-banner/ # persistent, unmissable "you are impersonating someone" bar, rendered from AppComponent alongside the header
  components/loading-caption/ # rotating witty caption shown next to Inventory/Tasks' skeleton loading placeholders
  components/theme-mode-icon/ # hand-rolled SVG sun/moon-morph icon (no library) — backs HeaderComponent's light/dark toggle button
  directives/count-up.directive.ts # CountUpDirective — animates a stat tile counting up to its value rather than popping in; backs manage/reports and Studio's own hero
  models/inventory-item.model.ts   # InventoryItem class (constructor-based, no defaults)
  models/supplier.model.ts   # Supplier — a directory entry inventory_items.supplier_id can point at
  models/inventory-item-order.model.ts # InventoryItemOrder — one restock order against an item's linked supplier
  models/inventory-item-reservation.model.ts # InventoryItemReservation — a date-ranged booking of some quantity of an item's stock
  models/reservation-kit.model.ts # ReservationKit / ReservationKitItem — a saved multi-item template PlaceReservationModalComponent can prefill from
  models/inventory-audit.model.ts # InventoryAudit / InventoryAuditCount / isAuditDiscrepancy() / InventoryAuditSchedule / isAuditScheduleUpcoming() / isAuditScheduleLocked() — a physical inventory audit ("cycle count"), its per-item snapshot rows, and recurring audit schedules
  models/org-health.ts # OrgHealthTier / computeOrgHealthTier() — Bronze/Silver/Gold feature-adoption badge, backs studio/usage, studio/organizations, and studio/organizations/:id
  models/theme-preset.ts     # THEME_PRESETS — key must match a [data-theme] block in styles.scss
  models/inventory-table-column.ts # optional Inventory table-view columns admin can show/hide (Settings > Data)
  models/pricing-tier.ts     # PRICING_TIERS — shared by PricingComponent (/pricing) and ManageBillingComponent
  models/subscription.model.ts # OrgSubscription — an org's real Stripe subscription state, backs BillingService
  models/notification.model.ts # UserNotification / NotificationKind / notificationIcon() — backs HeaderComponent's bell dropdown
  models/release-note.model.ts # ReleaseNote / ReleaseNoteSeverity / RELEASE_NOTE_SEVERITY_LABELS — backs manage/release-notes and studio/release-notes
  models/help-faq.ts         # HELP_FAQ_SECTIONS — question/answer/links data backing the searchable Help page
  models/quick-menu.ts       # QUICK_MENU_OPTIONS / MAX_QUICK_MENU_ITEMS — backs AccountComponent's picker and HeaderComponent's own icon row
  models/feedback.ts         # FeedbackType / FEEDBACK_TYPE_LABELS — backs FeedbackModalComponent, mirrored by hand in the send-notification-email Edge Function
  models/broadcast.model.ts  # Broadcast / BroadcastReferencedMember / BroadcastReferencedItem — backs /broadcasts
  models/command-palette.ts  # CommandPaletteResult / COMMAND_PALETTE_DESTINATIONS — backs HeaderComponent's Ctrl/Cmd+K search
  models/database.types.ts   # generated via `npm run supabase:gen:types` — regenerate, don't hand-edit
  utils/count-up-format.ts   # countUpNumber()/countUpCurrency() — CountUpDirective's own formatters, matching | number/| currency's default precision
  utils/inventory-item.mapper.ts   # toInventoryItem(row, images, checkedOutToLabel, activityLog?, ..., supplierLabel?) — DB row -> InventoryItem
  utils/inventory-item-name.ts     # isDuplicateItemName() — shared by the CSV importer and the manual "Create item" form's own duplicate-name check
  utils/inventory-item-images.ts   # loadInventoryImagesByItemId() / uploadInventoryItemImages() / deleteInventoryItemImage()
  utils/image-compression.ts       # compressImageFile() — client-side downscale/re-encode run inside uploadInventoryItemImages() before every photo upload
  utils/inventory-item-activity.ts # loadInventoryActivityByItemId() / logInventoryItemActivity() — inventory_item_activity
  utils/inventory-item-discards.ts # logInventoryItemDiscard() / loadAllInventoryItemDiscards() — structured counterpart to the free-text discard activity line, backs manage/reports
  utils/inventory-item-orders.ts # loadAllInventoryItemOrders() — every org order, backs manage/orders
  utils/inventory-item-reservations.ts # loadAllInventoryItemReservations() / loadUpcomingReservationsForItem() — backs manage/reservations and ModalTableComponent's read-only summary
  utils/inventory-audits.ts # loadAuditSummaries() / loadAuditDetail() — backs manage/audits' list and its embedded AuditDetailComponent
  utils/inventory-audit-schedules.ts # loadAuditSchedules() — backs manage/audits' Upcoming section and its "Recurring audits" management list
  utils/broadcasts.ts        # loadBroadcasts() / createBroadcast() / updateBroadcast() / deleteBroadcast() — backs /broadcasts and BroadcastModalComponent
  utils/release-notes.ts     # loadReleaseNotes() / createReleaseNote() / updateReleaseNote() / deleteReleaseNote() — backs manage/release-notes and studio/release-notes
  utils/inventory-export.ts  # buildInventoryExportCsv() / downloadCsv() — backs manage/inventory's "Export" button
  utils/inventory-import.ts  # buildInventoryImportTemplateCsv() / parseAndValidateImportRows() / buildImportInsertPayload() — backs manage/inventory's "Import" button
  utils/activity-log.ts      # loadActivityLog() / logActivity() — org-wide activity_log, backs Manage > Activity Log
  utils/profile-label.ts     # profileDisplayName()/resolveProfileName() — shared profiles-array lookup
  utils/supplier-label.ts    # resolveSupplierName() — mirrors profile-label.ts for inventory_items.supplier_id
  utils/barcode.ts           # buildItemQrValue()/parseItemQrValue() — ShelfSync's own QR-label encoding
  utils/presence.ts          # isProfileOnline()/formatLastSeen() — reads profiles.last_active_at, backs Manage > Team's presence indicator
  utils/changelog.ts         # getUnseenChangelogCount()/markChangelogSeen() — localStorage-backed, backs Manage's and Studio's own Release Notes card badges
  utils/realtime.ts          # subscribeToTableChanges() — Supabase Realtime postgres_changes wrapper, see Project Overview above
  utils/debounce.ts          # debounce() — plain setTimeout debounce with .cancel(), backs the task pages' realtime reload handlers
  utils/flash-tracker.ts     # FlashTracker — tracks which ids show the .realtime-flash "someone else just changed this" pulse
  utils/highlight-row.ts     # flashAndScrollToHighlighted() — ?highlight= landing treatment for pages with no per-row deep link of their own (Suppliers/Orders/Reservations/Broadcasts), reusing FlashTracker/.realtime-flash
  utils/trend-buckets.ts     # bucketByWeek() — plain client-side reduce backing studio's own growth trend charts
  styles/_realtime-flash.scss # shared .realtime-flash keyframes, backing FlashTracker above
  styles/_legal-page.scss   # shared top-bar + prose layout for privacy/ and terms/ (see Project Overview above);
                             # login/register no longer share a partial like this — each owns its own layout now
  styles/_skeleton.scss     # .skeleton-line/-block/-circle shimmer placeholders, backing Inventory/Tasks' loading states
  styles/_stagger.scss      # .cascade-in fade+rise, staggered per-item via [style.animation-delay.ms] — Inventory cards, Tasks rows
  styles/_page-hero.scss    # .page-hero gradient/glow-blob band — Home, Inventory, Tasks, the Manage hub
  styles/_page-toolbar.scss # .page-toolbar (breadcrumb row) + .back-row, shared by every authenticated page
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
- `add_platform_org_suspension_and_retirement` — adds `organizations.suspended_at`/`suspended_by`/
  `suspension_reason` and four `SECURITY DEFINER` RPCs
  (`platform_suspend_organization`/`platform_unsuspend_organization`/`platform_retire_organization`/
  `platform_restore_organization`), all `is_platform_admin()`-gated, backing `StudioOrgDetailComponent`'s
  "Platform actions" section (see Project Overview above for the full suspend-vs-retire
  reasoning). Folds `suspended_at is null` into `current_user_org_id()` right alongside its existing
  `deleted_at is null` check (diffed against `fix_org_isolation_bugs`'s version, the latest at the
  time) — same single choke point, so a suspended org's members lose all data access schema-wide the
  moment they're suspended, no per-policy changes needed. No new grant/policy on `organizations`
  itself needed for the writes — all four are RPC-only, same "SECURITY DEFINER bypasses RLS, no
  table grant required" shape every other RPC-gated write in this schema already uses.
- `widen_realtime_to_child_tables` — adds `inventory_item_images`/`inventory_item_orders`/
  `inventory_item_reservations` to the `supabase_realtime` publication (same idempotent
  existence-check wrapper `enable_realtime_for_inventory_and_tasks` already established) plus
  `REPLICA IDENTITY FULL` on all three, backing the widened realtime coverage described in the
  Project Overview section above. All three tables' own SELECT policies are join-based (via
  `item_id` -> `inventory_items.organization_id`, not a flat `organization_id` column of their
  own) — still gates `postgres_changes` delivery correctly, but the join needs `item_id` present
  on a DELETE's old-row payload to evaluate at all, which is exactly what `REPLICA IDENTITY FULL`
  (not the default primary-key-only identity) provides.
- `add_broadcasts` — adds `broadcasts` (`organization_id`, `title`, `message`, `created_by`,
  `created_at`/`updated_at`) and `broadcast_references` (a polymorphic child table — `reference_type`
  `'member'`/`'inventory_item'`, exactly one of `member_id`/`item_id` set — same org-isolation-via-
  parent-join shape `inventory_item_containers`/`orders`/`discards` already use), backing
  `/broadcasts` (see the Project Overview section above for the full feature). Widens
  `notifications.kind`'s check constraint (`add_notifications`) to add `'broadcast'` and
  `activity_log.entity_type`'s (`add_activity_log`) to add `'broadcast'` — both check constraints,
  dropped and recreated same as `add_more_avatar_presets`/`add_inventory_item_discard_reasons`
  already do for theirs. No insert grant for `authenticated` on `broadcasts` at all — creation goes
  through `create_broadcast()` (`SECURITY DEFINER`, admin/manager gated like `create_reservation()`),
  since it has to atomically write the broadcast row, its references, and one `notifications` row
  per other approved org member, which a plain RLS `with check` can't express. `UPDATE`/`DELETE` on
  `broadcasts`, and `INSERT`/`DELETE` on `broadcast_references`, are plain RLS scoped to
  `created_by = auth.uid()` instead (no RPC needed for editing/deleting an existing post, unlike
  creation) — `UPDATE` is additionally column-scoped (`grant update (title, message)`, same shape
  `add_inventory_item_retirement` established for `inventory_items`) so only those two fields are
  ever editable this way. Adds `broadcasts` (not `broadcast_references`) to the `supabase_realtime`
  publication with `REPLICA IDENTITY FULL`, same two-part mechanism
  `enable_realtime_for_inventory_and_tasks` established — `broadcast_references` doesn't need its
  own subscription since every reference-row change happens alongside a `broadcasts` row write
  (creation or edit) that the parent subscription already catches.
- `add_platform_account_lock` — adds `profiles.account_locked_at`/`account_locked_by`/
  `account_locked_reason` (RPC/manual-only, same excluded-from-the-ordinary-column-grant shape
  `role`/`membership_status`/`is_platform_admin` already have) and
  `platform_lock_user_account()`/`platform_unlock_user_account()` (`SECURITY DEFINER`,
  `is_platform_admin()`-gated, mirroring `platform_suspend_organization()`/
  `platform_unsuspend_organization()`'s own shape), backing `StudioUserDetailComponent`'s account-lock
  toggle (see the Project Overview section above for the full feature). Folds
  `account_locked_at is null` into `current_user_org_id()` right alongside its existing
  `deleted_at`/`suspended_at`/`membership_status` checks (diffed against
  `add_platform_org_suspension_and_retirement`'s version, the latest at the time) — same single
  choke point, so a locked user's data access is blocked schema-wide the instant they're locked, no
  per-policy changes needed. `platform_lock_user_account()` also refuses to let a platform admin
  lock their own account (`target_id = auth.uid()`) — there'd be no way back in to undo it.
- `add_platform_organization_usage` — adds `platform_get_organization_usage()`, a `SECURITY DEFINER`
  RPC (`is_platform_admin()`-gated, modeled directly on `get_inventory_photo_storage_usage()`) that
  returns one row per active org — `member_count`/`item_count`/`storage_bytes`, each a `left join`
  aggregate rather than a raw cross-org SELECT policy on `inventory_items` — backing
  `studio/usage` (`StudioUsageComponent`, see its own Project Overview paragraph below). Deliberately
  aggregate-only: a platform admin gets counts to spot which orgs are driving Supabase storage/egress
  cost or already past a pricing tier's limits, not read access to any org's actual item contents.
- `fix_platform_organization_usage_ambiguity` / `fix_platform_organization_usage_storage_type` —
  two same-day follow-ups to `add_platform_organization_usage`, both caught live on `studio/usage`
  rather than at migration-push time (`create or replace function` never validates a plpgsql body's
  embedded SQL, only its execution does). First: `platform_get_organization_usage()`'s own
  `returns table (organization_id uuid, ...)` makes `organization_id` an implicit plpgsql variable
  for the whole function body, so the two subqueries that referenced a bare, unqualified
  `organization_id` (from `profiles`/`inventory_items`) collided with it — fixed by aliasing every
  table and qualifying every reference, the way the third (storage) subquery already had to.
  Second, once that resolved: `sum(bigint)` returns `numeric` in Postgres (only `sum(smallint)`/
  `sum(integer)` return `bigint`), so `coalesce(sc.storage_bytes, 0)` didn't match the function's
  declared `bigint` column — `return query` checks a query's column types strictly against the
  function signature, unlike a plain scalar `return expression` (see
  `get_inventory_photo_storage_usage()`, unaffected by either bug), which tolerates this via an
  implicit assignment cast. Fixed with one explicit `::bigint` cast. Worth remembering as a pattern:
  a `returns table` function's own output column names shadow same-named table columns everywhere
  in its body, and `return query`'s type-checking is stricter than a plain `return`'s — neither
  surfaces until the function actually runs, so a migration push succeeding is not enough signal
  that a new `RETURNS TABLE` function is correct; it has to be called for real (or at least
  simulated — `set_config('request.jwt.claims', ...)` plus a direct `select *` against the function
  via `supabase db query --linked` is enough to catch both of these without needing a browser).
- `add_notification_email_log` — adds `notification_email_log` (`kind`, `recipient_email`,
  `organization_id` nullable/`on delete set null`, `success`, `error_message`), backing
  `studio/email-log` (`StudioEmailLogComponent`). Same "service-role-only insert, platform-admin-only
  read" shape `notifications` already established — every row is written by
  `send-notification-email` itself (see that Edge Function's own updated doc comment), which now logs
  every Resend call's outcome (success or failure, with the response/exception text on failure)
  immediately after attempting it, rather than a failed send disappearing with nothing but a
  `console.error` only visible in the function's own logs.
- `add_platform_action_log` — adds `platform_action_log` (`actor_id`, `action` — one of
  `suspend`/`unsuspend`/`retire`/`restore`/`lock`/`unlock` —, `target_type` — `organization` or
  `user` —, `target_id`, `target_label`, `reason`), backing `studio/audit-log`
  (`StudioAuditLogComponent`) plus a "Recent platform actions" section on both
  `StudioOrgDetailComponent` and `StudioUserDetailComponent`. None of the six platform RPCs this
  logs (`platform_suspend_organization`/`platform_unsuspend_organization`/`platform_retire_organization`/
  `platform_restore_organization`/`platform_lock_user_account`/`platform_unlock_user_account`) had
  ever recorded who did what, when, or why — invisible with a single platform admin today, but a real
  gap the moment there's ever a second one. `target_label` is a point-in-time name snapshot (org name
  / `profile_display_name()`), same "outlive the thing it references" shape
  `inventory_item_orders.supplier_name` already established. Each of the six RPCs got a
  `create or replace function` here, diffed against its own current version (per this repo's own
  "diff against the previous version" rule), adding exactly one log insert at the end of each — the
  two "restore"-shaped functions (`platform_unsuspend_organization`/`platform_restore_organization`)
  needed their existing `exists`-only not-found check swapped for a `select name into` so the org's
  name was actually on hand to log, same not-found behavior either way.
- `add_inventory_audits` — adds `inventory_audits` (org-level — its own `organization_id`, unlike
  every child table this schema otherwise adds — `status` `'in_progress'|'completed'|'cancelled'`,
  `physical_location`, `note`, `started/completed/cancelled_by/at` triples) and `inventory_audit_counts`
  (a child of the audit — `audit_id`, `item_id`, `expected_quantity`, `counted_quantity`, `counted_by/at`,
  `note`, `applied_by/at`; `unique (audit_id, item_id)`), backing `manage/audits` (see Project Overview
  above for the full feature). Both join-scoped from day one (`inventory_audit_counts` through
  `audit_id -> inventory_audits.organization_id`), no direct INSERT/UPDATE/DELETE grant for
  `authenticated` at all — five new `SECURITY DEFINER` RPCs
  (`start_inventory_audit`/`submit_audit_count`/`apply_audit_count`/`complete_inventory_audit`/
  `cancel_inventory_audit`) are the only way either table is ever written. Widens
  `activity_log.entity_type`'s check constraint to add `'inventory_audit'` (drop + recreate, same as
  `add_broadcasts` did for `'broadcast'`), and adds both tables to the realtime publication +
  `replica identity full`, same two-part mechanism `widen_realtime_to_child_tables` established.
- `fix_apply_audit_count_double_apply` — a same-day follow-up, caught before any client code
  depended on the RPC it fixes: `apply_audit_count()` (from the migration directly above) had no
  guard against being called twice on the same already-applied row, which would have silently shifted
  `quantity_remaining`/`quantity_total` by the same delta a second time (a double-click, a stale
  render after a realtime reload, retrying a slow request). `create or replace function` here is
  diffed against that same migration's version (the only one that's ever existed) — adds exactly one
  `if v_count.applied_at is not null then raise exception ...` check, nothing else changed. Worth
  remembering alongside this repo's other "diff against the previous version" lessons: a
  double-application guard is easy to forget on any RPC that flips a row from "pending" to
  "done" as a side effect of a broader write, not just the ones that look like a state machine.
- `add_platform_organization_task_count` — extends `platform_get_organization_usage()` (from
  `add_platform_organization_usage`, fixed up by the two `2026091912...` migrations right after it)
  with a `task_count` column and an optional `p_organization_id` parameter (default `null`,
  preserving `StudioUsageComponent`'s own existing zero-arg leaderboard call unchanged), backing
  `StudioOrgDetailComponent`'s inventory/task counts — see the Project Overview paragraph above for
  the full reasoning on why extending this already-`SECURITY DEFINER` function was simpler than
  adding a new cross-org RLS policy pair on `inventory_items`/`tasks` the way `add_platform_admin`
  did for `feedback`/`client_error_log`/`profiles`. A table function's return columns can't change
  via `create or replace` (same constraint `20260919120100`'s own comment already documented for
  this exact function), so this drops the old signature before recreating it.
- `add_inventory_item_checkout_due_date` — adds `inventory_items.checkout_due_at` (plain `date`,
  same type `expiration_date` already uses) and `checkout_overdue_notified_at` (RPC/trigger-only,
  excluded from any column grant), backing the checkout due-date/overdue-reminder feature (see
  Project Overview above). `checkout_due_at` gets the same additive
  `grant update (checkout_due_at)` every new writable `inventory_items` column needs (same pattern
  `add_inventory_item_barcode` established). A new `BEFORE UPDATE` trigger,
  `clear_checkout_overdue_notification()`, resets `checkout_overdue_notified_at` to null whenever
  `checked_out_to`/`checkout_due_at` changes, so a resolved-then-newly-overdue item notifies again.
  `notify_overdue_checkouts()` — `SECURITY DEFINER` + `pg_cron`, directly modeled on
  `purge_expired_organizations()` — sweeps daily for anything overdue (re-checking every 3 days
  rather than notifying once and going silent) and calls `send-notification-email` via
  `net.http_post` the same way every trigger-driven webhook in this schema already does, just from
  a scheduled function instead of a row-change trigger. Also widens `notifications.kind`'s check
  constraint to add `'checkout_overdue'` (drop + recreate, same as `add_broadcasts` did for
  `'broadcast'`).
- `add_site_settings_notify_checkout_overdue` — adds `site_settings.notify_checkout_overdue`
  (`boolean not null default true`), the sixth per-org email-notification toggle in Settings >
  Workflow's "Email notifications" section, same shape/no-RLS-change reasoning every other toggle
  added this way already has.
- `add_notification_email_log_checkout_overdue_kind` — a same-day follow-up, caught via a manual
  `notify_overdue_checkouts()` test run against the hosted project before any real usage depended
  on it: `add_inventory_item_checkout_due_date` widened `notifications.kind`'s check constraint for
  the new kind but missed `notification_email_log.kind`'s own separate, identically-shaped one —
  every overdue email was sending successfully but silently failing to log itself (swallowed by
  `logEmailAttempt()`'s own best-effort `console.error`, the exact "never block/throw over a
  logging write" behavior its doc comment describes). Fixed by drop-and-recreating the second
  constraint the same way. Worth remembering alongside this repo's other "diff against the previous
  version"/double-apply lessons: a new notification *kind* touches two separate check constraints,
  not one, and only the second one's gap fails silently rather than as a visible error.
- `add_release_notes` — adds `release_notes` (`title`, `description`, `severity` — a plain checked
  `text` column, not a real Postgres enum, same shape `activity_log.entity_type`/`notifications.kind`
  already have — `posted_at`, `created_by`, `created_at`/`updated_at`), backing Studio's release-notes
  CRUD and Manage's read-only "What's new" list (see both components' own Project Overview paragraphs
  above). The first table in this schema with no `organization_id` column at all and no per-org join in
  any of its policies — every organization reads the exact same list, so there's nothing to scope.
  SELECT is any authenticated user (`using (true)`, no `anon` grant needed — both routes sit behind
  `approvedGuard`); INSERT/UPDATE/DELETE are each a flat `is_platform_admin()` check, no RPC needed
  (unlike `create_broadcast()`/`create_reservation()`, nothing here has an atomic side effect on
  another table) — the "same authenticated Postgres role" limitation the Important RLS constraint note
  below describes is specifically about column-level `GRANT`s; a row-level policy can reference a
  `SECURITY DEFINER` helper like `is_platform_admin()` freely, the same way `current_user_role()` is
  already used directly inside plenty of other tables' own insert/update/delete policies. Backfills
  every entry from the previously hand-maintained `CHANGELOG_ENTRIES` array
  (`shared/models/changelog.ts`, deleted by this same change) so switching to a DB-backed list didn't
  lose any shipped-feature history — every organization's "What's new" feed read identically the moment
  this shipped, all backfilled as `'standard'` severity (the tier concept didn't exist yet) and
  `created_by` left null (no single real actor to attribute historical entries to, same reasoning
  `seed.sql`'s own placeholder rows leave `checked_out_to`/`retired_by` null for).
- `add_inventory_audit_team` — adds `inventory_audits.lead_id` (plain nullable FK, `on delete set
  null`, same shape `started_by`/`completed_by`/`cancelled_by` already use) and
  `inventory_audit_supporters` (`audit_id`, `user_id`; `unique (audit_id, user_id)`), backing the
  lead/support claiming feature described in this audit's own Project Overview paragraph above. Same
  join-through-to-the-parent-audit SELECT policy shape `inventory_audit_counts` already established;
  no insert/update/delete grant for `authenticated` at all — `set_audit_team()` (new, `SECURITY
  DEFINER`, no role check beyond org membership — self-claimable, not admin/manager-gated) is the
  only way either changes. Strips the lead out of the support replacement set server-side regardless
  of what the caller sent, and silently drops any support id that doesn't resolve to an approved
  member of the audit's own org rather than rejecting the whole call over one bad id — same
  "server is what actually enforces it, the client hint is UX only" reasoning `is_locked`'s own RLS
  `with check` clause already established elsewhere in this schema. Added to the realtime publication
  with `replica identity full`, same two-part mechanism every other audit-adjacent table already uses.
- `allow_staff_complete_fully_counted_audit` — `create or replace function` on
  `complete_inventory_audit()`, diffed against its only previous version
  (`add_inventory_audits`) per this repo's own "diff against the previous version" rule. Widens who
  can complete an audit: still admin/manager unconditionally, but now any approved org member too
  once nothing in the audit is left uncounted (`select count(*) ... where counted_quantity is null`,
  gating the existing admin/manager-only `raise exception` on that count being nonzero rather than
  dropping the check outright) — see this audit feature's own Project Overview paragraph above for
  the full reasoning. No column/table changes, no grant changes — same signature, same `authenticated`
  grant, purely a body change.
- `fix_complete_inventory_audit_ambiguity` — same-day follow-up, caught live ("column reference
  \"audit_id\" is ambiguous") the first time an admin actually tried to complete an audit after the
  migration above shipped: its own new uncounted-count query left `audit_id` unqualified on the
  left-hand side of `where audit_id = v_audit.id`, and the function's own parameter is *also* named
  `audit_id` — a bare `audit_id` inside the query matches both the `inventory_audit_counts` column
  (via that query's own `from`) and the outer parameter, and plpgsql's default
  `variable_conflict = error` setting refuses to silently guess which one was meant. Fixed by
  aliasing the table and qualifying both column references (`v_audit.id` on the right-hand side was
  already unambiguous, a record field rather than a bare identifier). Diffed against that same
  migration's version (the only one that's ever existed) per this repo's own rule. Worth remembering
  alongside `fix_platform_organization_usage_ambiguity`/the `20260919...` `RETURNS TABLE` lessons: a
  migration push succeeding never validates a plpgsql function body's embedded SQL, only actually
  running it does — and a routine parameter that happens to share a name with a column it later
  queries against is exactly the kind of thing that passes review but fails every single call.
- `add_reservation_kits` — adds `reservation_kits` (`organization_id` defaulting to
  `current_user_org_id()`, `name`, `description`; `unique (organization_id, name)`) and
  `reservation_kit_items` (`kit_id`, `item_id`, `quantity`), backing the saved multi-item reservation
  templates described above. Mirrors `suppliers`' own RLS shape almost verbatim: any org member can
  read either table (needed for `PlaceReservationModalComponent`'s "Start from a kit" picker), only
  admin/manager can insert/update/delete. `reservation_kit_items` has no `organization_id` of its
  own — same join-through-`kit_id`-to-the-parent's-`organization_id` shape
  `inventory_item_orders`/`inventory_item_discards` already established as this schema's day-one-
  correct default for a child table (rather than `inventory_item_containers`' original no-join
  `using (true)`, which needed its own later retrofit). No RPC for either table — a plain admin/
  manager-gated insert/update/delete is enough, since nothing here has an atomic side effect on a
  second table the way `create_reservation()`/`create_broadcast()` do.
- `add_reservation_group_id` — adds `inventory_item_reservations.reservation_group_id` (plain
  nullable `uuid`, no foreign key — it names no row of its own, just a client-generated tag shared
  across sibling rows placed in the same submission) and a `create_reservation()` parameter to set
  it, backing the multi-item/kit reservation grouping described above. Dropped and recreated rather
  than a plain `create or replace` (see `add_platform_organization_task_count`'s own comment on why
  adding a parameter isn't always safe as a bare replace) — diffed against
  `prevent_reservations_on_locked_items`'s version (the latest at the time) per this repo's own
  "diff against the previous version" rule; the only changes are the new `group_id` parameter and
  passing it through to the insert, everything else (the `is_locked` check, the capacity check, both
  activity log writes) is unchanged.
- `add_platform_organization_feature_adoption` — extends `platform_get_organization_usage()` again
  (drop + recreate — table functions can't change return columns via `create or replace`, same
  constraint `20260919120100`/`add_platform_organization_task_count` already noted) with 5 more
  per-org `bigint` counts (`container_count`/`reservation_count`/`order_count`/`broadcast_count`/
  `completed_audit_count`), backing the "Org health" Bronze/Silver/Gold badge described above
  (`shared/models/org-health.ts`'s `computeOrgHealthTier()`). Same reasoning
  `add_platform_organization_task_count` already gives for extending this RPC rather than adding a
  new cross-org SELECT policy pair — it's already `SECURITY DEFINER` and already bypasses RLS for
  its own leaderboard use. `container_count`/`reservation_count`/`order_count` all join through
  `item_id -> inventory_items.organization_id`, the same shape this function's own `storage_bytes`
  subquery already uses (none of those three tables carry an `organization_id` column of their own);
  `broadcast_count`/`completed_audit_count` group directly on their own `organization_id` instead.
- `add_inventory_audit_schedules` — adds `inventory_audit_schedules` (org-level, its own
  `organization_id` — same shape `inventory_audits` itself uses, not a child-via-`item_id` table —
  `physical_location`, `frequency` checked to `weekly`/`monthly`/`quarterly`, `note`,
  `next_occurrence_date`, `active`, `created_by`/`created_at`) and `inventory_audits.schedule_id`
  (nullable FK back to it, `on delete set null`), backing recurring audit schedules (see Project
  Overview above for the full "Upcoming" / locked-while-imminent mechanism). SELECT is any approved
  org member, same open visibility real audits already have; **no INSERT/UPDATE/DELETE grant for
  `authenticated` at all**, same shape `inventory_audits` itself uses — every write goes through
  three new `SECURITY DEFINER` RPCs, all admin/manager-gated like `start_inventory_audit()`:
  `create_audit_schedule()` (validates frequency and that the first occurrence isn't in the past),
  `update_audit_schedule()` (refuses once `next_occurrence_date - current_date <= 7` — the "upcoming,
  locked" window), and `set_audit_schedule_active()` (pause/resume — deliberately **not** subject to
  that same lock check, so stopping the series stays possible right up to the day it fires). The
  actual daily sweep, `run_scheduled_inventory_audits()` (`SECURITY DEFINER` + `pg_cron`, `'0 6 * * *'`
  — same shape `notify_overdue_checkouts()`/`purge_expired_organizations()` already established for a
  scheduled job with no request/session context), reimplements `start_inventory_audit()`'s own
  snapshot-insert logic directly rather than calling that RPC (which is role/session-gated and always
  attributes to `auth.uid()`, null here) — a spawned audit is attributed to the schedule's own
  `created_by` instead. Each schedule's own attempt runs inside its own `begin/exception` block so
  one org's failure (most likely: nothing left in scope for that location) can't abort the rest of
  the run for every other org's schedule, same "one bad row can't block the batch" reasoning
  `notify_overdue_checkouts()`'s own per-item loop already relies on; `next_occurrence_date` always
  advances afterward, success or failure, so an org with a temporarily-empty scope retries at its
  *next* real occurrence instead of failing (and logging a skip) every single day forever.
- `fix_inventory_images_storage_policy_name_shadowing` — a severe, months-live bug caught via a real
  user report ("Item created, but image upload failed: new row violates row-level security policy")
  rather than by inspection: `fix_org_isolation_bugs`' own org-scoping fix for the `inventory-images`
  bucket's INSERT/DELETE policies used a bare `storage.foldername(name)` meant to reference
  `storage.objects.name` (the upload path), but the correlated subquery it sits inside also
  introduces `inventory_items i` — which *also* has a `name` column (the item's own display name) —
  making that the innermost scope. Unlike this schema's other ambiguous-name bugs (caught by
  PL/pgSQL's `variable_conflict = error` setting, e.g. `fix_platform_organization_usage_ambiguity`/
  `fix_complete_inventory_audit_ambiguity`), plain SQL name resolution has no such guard: it silently
  resolved `name` to `i.name` with no error at migration-push time, confirmed live via `pg_policies`
  already showing the persisted expression as `storage.foldername(i.name)`. A plain item name with
  no `/` in it makes `storage.foldername()` return an *empty* array, so indexing `[1]` is null and
  the `exists(...)` check was unconditionally false — every single inventory photo upload and delete
  had been silently rejected, for every org and every role, since the day that migration shipped.
  Fixed by qualifying the outer column explicitly (`storage.foldername(storage.objects.name)`)
  rather than leaving it bare, the only way to reference an outer column safely once a correlated
  subquery might introduce a same-named one — worth remembering as its own category alongside this
  schema's other "diff against the previous version" lessons: qualifying a column doesn't help if
  it's qualified against the *wrong* table, and this class of bug produces no error anywhere, ever,
  short of someone actually hitting the policy.
- `add_impersonation_sessions` — adds `impersonation_sessions` (`platform_admin_id`/`target_user_id`
  both nullable FKs with `on delete set null`, plus `target_label`/`target_organization_label` point-
  in-time snapshots — same "outlive what it references" shape `add_platform_action_log` established
  for its own `target_label` — `target_organization_id`, `reason`, `started_at`/`ended_at`), backing
  the impersonation feature described in Project Overview above. Same "service-role-only insert, no
  `authenticated` INSERT policy at all" shape `add_notifications` established (the `impersonate-user`
  Edge Function inserts this row using the `service_role` key every Edge Function already gets
  automatically); SELECT is platform-admin-only (`is_platform_admin()`), same shape
  `add_platform_action_log`'s own SELECT policy. Two `SECURITY DEFINER` RPCs:
  `end_current_impersonation()` (no args, plain `authenticated` grant — closes the *caller's own*
  open row, `where target_user_id = auth.uid()`, since this only ever runs while the caller is still
  authenticated as the target) and `platform_end_impersonation_session(session_id)`
  (`is_platform_admin()`-gated — the cleanup path for a session nobody explicitly stopped).
- `add_impersonation_started_notification` — adds `notify_on_impersonation_started` (`after insert on
  impersonation_sessions`, no `when (...)` clause, calling the existing `call_notification_webhook()`
  unchanged — same shape `add_feedback`'s own trigger already established), backing the impersonation
  transparency notification described in Project Overview above. Widens both `notifications.kind` and
  `notification_email_log.kind`'s check constraints to add `'impersonation_started'` (drop + recreate,
  same as every other kind widen in this schema) — both in the same migration, per
  `add_notification_email_log_checkout_overdue_kind`'s own "a new kind touches two constraints, and
  only the second one's gap is silent" lesson.
- `unify_notification_kind_enum` — a structural fix for that exact lesson rather than another
  instance of following it: `notifications.kind` and `notification_email_log.kind` both move from
  two independent plain-`text`-plus-CHECK-constraint columns onto one shared real Postgres enum,
  `notification_kind` (`create type ... as enum (...)`, then `alter column kind type
  public.notification_kind using kind::public.notification_kind` on both tables — **constraint
  dropped first, column altered second**, the reverse order the first push attempt used and a real
  bug caught immediately: Postgres revalidates an existing CHECK constraint's expression against a
  column's new type as part of `alter column ... type` itself, and there's no `=` defined between a
  brand-new enum type and the constraint's own text literals at that point
  (`operator does not exist: notification_kind = text`) — dropping the constraint first removes the
  thing being revalidated rather than needing to fix the comparison. Going forward, a new kind is one
  additive `alter type public.notification_kind add value 'x'` touching both tables at once, rather
  than two coupled drop-and-recreate edits someone has to remember to make together — the exact
  gap `add_notification_email_log_checkout_overdue_kind` already caught once, silently. Deliberate,
  explicitly-documented tradeoff: the two tables' old constraints didn't actually list identical
  values (`notifications` allows `'broadcast'` but not `'feedback'`; `notification_email_log` is the
  reverse), so sharing one type technically loosens each column to accept the other table's own
  edge-case kind too — accepted as safe since neither table has any INSERT grant for
  `authenticated`/`anon` at all, every row on both comes from specific hardcoded call sites, never
  generic/dynamic code that could plausibly conflate the two; the CHECK constraints were always a
  typo backstop, not a real security boundary, and the enum type itself still catches a genuinely
  invalid value. Bonus, not the point of the migration: `supabase gen types` represents a real
  Postgres enum as a literal TypeScript union (unlike a plain checked `text` column, which it can't
  introspect into one) — `NotificationKind` in `shared/models/notification.model.ts` gets real
  compile-time narrowing for free as a result, where it previously just resolved to `string`. Worth
  remembering for later: `alter type ... add value` can't be used in the same transaction that also
  *uses* the new value (a long-standing Postgres enum restriction) — fine for the normal case of
  widening the type and letting already-deployed application code reference it afterward, but a
  migration that both adds a value and backfills rows using it in the same file would need to split
  across two migrations instead.
- `tag_activity_via_impersonation` — adds `activity_log.via_impersonation`/
  `inventory_item_activity.via_impersonation` (`boolean not null default false`) plus a `before insert`
  trigger on each (`mark_activity_log_via_impersonation()`/`mark_inventory_item_activity_via_impersonation()`,
  both `security definer` — needed specifically to see `impersonation_sessions` at all, since that
  table's own SELECT policy is platform-admin-only and would otherwise leave an ordinary caller's
  subquery seeing zero rows) that sets the new column from whether an *open* `impersonation_sessions`
  row exists for `new.actor_id`/`new.user_id`, backing the tagging feature described in Project
  Overview above. A one-time backfill `update` (same correlation, applied retroactively via each
  session's own recorded `started_at`/`ended_at` window) covers rows that already existed. No grant
  changes needed on either table — neither has ever used column-scoped grants (see each table's own
  original migration), so a new plain column rides along under the existing table-level grant with no
  extra statement required, same reasoning every `site_settings` column added this way already relies
  on elsewhere in this schema.
- `fix_platform_admin_lock_bypass` — a follow-up `/security-review` pass (not live abuse) caught that
  `add_platform_account_lock`'s whole premise — locking out "a malicious individual" who happens to be
  a platform admin — didn't actually work: `is_platform_admin()` never consulted
  `account_locked_at`, only `current_user_org_id()` did, and that only gates ordinary org-scoped RLS,
  not the Studio RPCs or the `impersonate-user` Edge Function that are actually gated by
  `is_platform_admin()` directly. A locked platform admin therefore kept every platform-level
  capability, including starting a brand-new impersonation session against anyone, and could even
  self-unlock via `platform_unlock_user_account` (itself only gated by the same unqualified
  `is_platform_admin()`). Fixed the same way `current_user_org_id()` itself already fails closed for a
  deleted/suspended/locked caller: `account_locked_at is null` is now folded directly into
  `is_platform_admin()`'s own lookup, so every platform RPC and RLS policy that calls it picks up the
  fix for free. The `impersonate-user` Edge Function reads the `is_platform_admin` column directly via
  its service-role client rather than calling this SQL function, so it needed its own matching
  `account_locked_at` check added alongside it. A second, related gap fixed in the same migration:
  `platform_lock_user_account` only ever refused *self*-locking, unlike `impersonate-user`'s own
  explicit "cannot target another platform admin" guard — it now carries the identical guard, so
  locking a peer platform admin is refused the same way impersonating one already was.
- `add_mfa_enforcement` — optional, self-enrolled two-factor authentication (TOTP), enforced by
  folding an "aal2, or no verified factor exists" clause into both `current_user_org_id()` and
  `is_platform_admin()` (diffed against each one's own latest version at the time). Opt-in per
  account, zero behavior change for anyone who's never enrolled — see the Project Overview section
  above for the full feature, the client-side pieces (`MfaService`, `/mfa-verify`,
  `TwoFactorSetupModalComponent`), and the real `QRCode.toDataURL()`-vs-Supabase's-own-`qr_code`-string
  debugging story in `MfaService.enrollTotp()`'s own doc comment.
- `add_site_settings_require_mfa_for_all` — the org-wide "require two-factor for everyone" toggle
  `add_mfa_enforcement`'s own doc comment had flagged as a natural next step (see the Project
  Overview section above for the full feature and its own "site_settings is gated by the very
  function this toggle changes" chicken-and-egg reasoning). Adds
  `site_settings.require_mfa_for_all` (default `false`) and a new `current_org_requires_mfa()`
  `SECURITY DEFINER` function — a narrower, RLS-bypassing lookup the client also calls directly as
  an RPC (`MfaService.isRequiredOrgWide()`), separate from reading `site_settings` the normal way,
  specifically so an org that turns this on doesn't simultaneously make its own settings row
  unreadable to the very members it needs to explain the requirement to. Diffs `current_user_org_id()`
  against `add_mfa_enforcement`'s version (the latest at the time) to narrow its existing escape
  hatch; deliberately leaves `is_platform_admin()` untouched, since Studio's cross-org surface isn't
  scoped to any one org's `site_settings` row.
- `add_subscriptions` — real Stripe subscription billing (see the Project Overview section above for
  the full feature). Adds `subscriptions` (one row per org — `unique (organization_id)`, same
  upsert-friendly shape `site_settings` already uses — `tier`/`status` checked columns, Stripe
  customer/subscription/price ids, `current_period_end`, `cancel_at_period_end`). SELECT is any
  approved org member (`organization_id = current_user_org_id()`, plain `grant select`); **no
  insert/update/delete grant for `authenticated`/`anon` at all** — every write comes from the new
  `stripe-webhook` Edge Function's `service_role` client, the same "service-role-only insert" shape
  `add_notifications`/`add_notification_email_log` already establish, just extended to updates too
  here since a subscription's row is mutated repeatedly over its lifetime rather than only ever
  inserted once. No seed row anywhere (not even `handle_new_user()`) — a missing row is treated by
  the app as the implicit Free tier, purely additive to signup. `status`'s check constraint values
  (`active`/`trialing`/`past_due`/`canceled`/`incomplete`/`incomplete_expired`/`unpaid`/`paused`)
  mirror Stripe's own `Subscription.status` enum verbatim so the webhook can pass it straight
  through with no translation table of its own.

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
