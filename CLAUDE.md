# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShelfSync (npm package name `inventory-app`) is an early-stage Angular inventory management app.
Auth is wired end-to-end against a hosted Supabase project: `LoginComponent` calls real
`signInWithPassword`, `RegisterComponent` calls real `signUp`, the `dashboard` route is protected
by an `authGuard`, and the header has a working logout button. The dashboard, Manage's inventory
tab, and Manage's tasks tab all query real Supabase tables (`inventory_items`, `tasks`,
`profiles`) — there is no hardcoded/local inventory or task data left in the app. `DashboardComponent`
and `ManageComponent` both convert `inventory_items` rows into the client-side `InventoryItem`
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
(the item detail popup opened from both the dashboard and Manage's inventory list) via an
Edit/Save/Cancel flow; saving writes the changes to `inventory_items` and logs a diffed,
human-readable summary ("Updated Quantity remaining (80 → 25), ...") to `inventory_item_activity`.
Editing does not cover photos (still the dedicated upload flow in Manage's create-item form) or
checkout state (`is_checked_out`/`checked_out_to` — deliberately deferred, see the Supabase Schema
section below).

## Tech Stack

- **Framework:** Angular 21 (see `package.json` for exact versions)
- **UI:** Angular Material + Angular CDK (migrated from PrimeNG — see git history)
- **Backend:** Supabase (Postgres, Auth, RLS), hosted project (ref `ailqjqjrzhzspofoslpa`),
  linked via the Supabase CLI. Auth, `inventory_items`, and `tasks` are all live and queried
  directly from the dashboard/tasks/manage UI — no hardcoded local data remains.
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
- Run a single test file: `ng test --include='**/dashboard.component.spec.ts'`
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

There is no configured lint script (`ng lint` is not wired up in `package.json`/`angular.json`).

## Architecture

The app mixes two Angular module styles, which is important to know before adding components:

- **Root shell (`app.module.ts`, `app.component.ts`, `app-routing.module.ts`) is `NgModule`-based.**
  `AppComponent` is explicitly `standalone: false` and is declared in `AppModule`, which imports
  the standalone `HeaderComponent`/`FooterComponent` directly into its `imports` array.
- **Everything else is a standalone component** (`LoginComponent`, `DashboardComponent`,
  `ModalTableComponent`, etc.), each declaring its own Material module imports in the
  `@Component({ imports: [...] })` array rather than through a shared `NgModule`.
- Routing (`app-routing.module.ts`) is flat — `''` → `LoginComponent`, `'register'` →
  `RegisterComponent`, `'dashboard'` → `DashboardComponent` guarded by `authGuard`. No lazy
  loading or resolvers exist yet.
- `app.component.html` hides the shared `<app-header>`/`<app-footer>` chrome on an explicit
  route allowlist (`router.url !== '/' && router.url !== '/register'`), not on a guard/data flag.
  **Any new unauthenticated/full-bleed page must be added to that condition too**, or it'll
  render with the dashboard header (including the Logout button) around it.

Directory layout under `src/app/`:
```
app.module.ts / app.component.* / app-routing.module.ts   # NgModule root shell
core/
  supabase.service.ts   # createClient<Database>() wrapper, providedIn: 'root'
  auth.service.ts        # session signal (isAuthenticated), signIn/signUp/signOut/getSession
  guards/auth.guard.ts    # CanActivateFn — awaits authService.getSession() directly
header/, footer/                                           # standalone layout components; header has the logout button
login/                                                      # standalone login screen, real Supabase auth
register/                                                   # standalone signup screen, real Supabase auth
dashboard/                                                  # standalone dashboard: filters, item table, opens modal
shared/
  components/modal-table/    # standalone Material dialog showing InventoryItem details
  models/inventory-item.model.ts   # InventoryItem class (constructor-based, no defaults)
  models/database.types.ts   # generated via `npm run supabase:gen:types` — regenerate, don't hand-edit
  utils/inventory-item.mapper.ts   # toInventoryItem(row, images, checkedOutToLabel, activityLog?) — DB row -> InventoryItem
  utils/inventory-item-images.ts   # loadInventoryImagesByItemId() — batch-loads inventory_item_images, resolves public URLs
  utils/inventory-item-activity.ts # loadInventoryActivityByItemId() / logInventoryItemActivity() — inventory_item_activity
  utils/profile-label.ts     # profileDisplayName()/resolveProfileName() — shared profiles-array lookup
  styles/_auth-shell.scss   # shared full-page video-background shell; login/register `@use` it
                             # rather than duplicating — add new shared auth-page styles here
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
yet on a hard refresh of `/dashboard`.

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
  server-side backstop behind the client-side cap in `ManageComponent`. This migration also
  creates the public `inventory-images` Storage bucket and matching `storage.objects` policies
  (public read; `admin`/`manager`-only insert/delete).
- `add_inventory_item_activity_and_edit_access` — widens `inventory_items` UPDATE from
  admin/manager-only to any authenticated user (insert/delete are unchanged, still
  admin/manager-only), and adds `inventory_item_activity` (`item_id`, `user_id`, `message`,
  `created_at`) — readable by any authenticated user, insertable by any authenticated user but
  only ever attributed to themselves (`with check (user_id = auth.uid())`).

`supabase/seed.sql` ports the dashboard's hardcoded dummy items into `inventory_items` inserts
for local dev (`checked_out_to` is left `null` since it's a real FK to `profiles` now and the
seed doesn't create fake auth users).

**Important RLS constraint:** every signed-in user maps to the same Postgres role
(`authenticated`) in Supabase — there's no separate DB role per app role. That means
column-level `GRANT`s can't be used to say "admins can edit column X, other users can't": the
grant applies to `authenticated` as a whole. Where that distinction matters (e.g. `profiles.role`),
the fix is a `SECURITY DEFINER` RPC that checks `current_user_role()` internally, not a raw
table `UPDATE` gated by RLS alone. Follow `admin_set_user_role()` as the template. Two spots are
flagged as deliberately deferred with this same issue: staff self-checkout on `inventory_items`
and status-only updates on `tasks` — both currently allow the assignee/staff user to edit the
whole row via RLS, not just the intended column(s).

Regenerate `src/app/shared/models/database.types.ts` after any schema change with
`npm run supabase:gen:types` (requires the project to be linked — see Commands above).

**Signup requires email confirmation.** This hosted project has email confirmation enabled, and
uses Supabase's default shared email sender, which is rate-limited to a couple of emails/hour
until custom SMTP is configured in the dashboard. `AuthService.signUp()` returns
`needsEmailConfirmation: true` when `signUp()` succeeds but no session comes back, and
`RegisterComponent` shows a "check your email" message in that case rather than navigating to
`/dashboard`. When testing signup repeatedly, expect to hit `over_email_send_rate_limit`
(surfaces as a normal `error.message`) — that's the shared sender's limit, not a bug.

## Coding Conventions (from `.editorconfig`)

- 2-space indentation, single quotes in `.ts` files, final newline required, trailing whitespace
  trimmed (except in `.md` files).

## Known Issues

- `README.md` has an unresolved git merge conflict (`<<<<<<< HEAD` / `=======` /
  `>>>>>>> origin/main` markers are committed as-is). Flag this if you touch the README rather
  than silently working around it.
