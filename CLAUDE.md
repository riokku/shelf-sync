# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShelfSync (npm package name `inventory-app`) is an early-stage Angular inventory management app.
On the frontend: a login screen and a dashboard that renders a hardcoded list of `InventoryItem`
records in a table, with a modal for viewing item details. `LoginComponent.attemptLogin()` only
logs to the console and `DashboardComponent` seeds `inventoryList` from an inline array — neither
is wired to Supabase yet. The Supabase **schema** (migrations, RLS) exists (see below); the
Angular app has no `SupabaseService`, no `environments/` config, and no auth guards yet.

## Tech Stack

- **Framework:** Angular 21 (see `package.json` for exact versions)
- **UI:** Angular Material + Angular CDK (migrated from PrimeNG — see git history)
- **Backend:** Supabase (Postgres, Auth, RLS) — schema/migrations only so far, not yet wired
  into the Angular app
- **Language:** TypeScript in strict mode (`tsconfig.json`: `strict`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `strictTemplates`, etc.)
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
- Supabase local dev (requires Docker Desktop running):
  - `npm run supabase:start` / `npm run supabase:stop` — start/stop local Postgres, Studio, Auth
  - `npm run supabase:reset` — reapply all migrations + `supabase/seed.sql` from scratch
  - `npm run supabase:migration:new <name>` — scaffold a new timestamped migration file
  - `npm run supabase:gen:types` — regenerate `src/app/models/database.types.ts` from the local schema

There is no configured lint script (`ng lint` is not wired up in `package.json`/`angular.json`).

## Architecture

The app mixes two Angular module styles, which is important to know before adding components:

- **Root shell (`app.module.ts`, `app.component.ts`, `app-routing.module.ts`) is `NgModule`-based.**
  `AppComponent` is explicitly `standalone: false` and is declared in `AppModule`, which imports
  the standalone `HeaderComponent`/`FooterComponent` directly into its `imports` array.
- **Everything else is a standalone component** (`LoginComponent`, `DashboardComponent`,
  `ModalTableComponent`, etc.), each declaring its own Material module imports in the
  `@Component({ imports: [...] })` array rather than through a shared `NgModule`.
- Routing (`app-routing.module.ts`) is flat and eager — `''` → `LoginComponent`,
  `'dashboard'` → `DashboardComponent`. No lazy loading, guards, or resolvers exist yet.

Directory layout under `src/app/`:
```
app.module.ts / app.component.* / app-routing.module.ts   # NgModule root shell
header/, footer/                                           # standalone layout components
login/                                                      # standalone login screen (no real auth)
dashboard/                                                  # standalone dashboard: filters, item table, opens modal
shared/
  components/modal-table/    # standalone Material dialog showing InventoryItem details
  models/inventory-item.model.ts   # InventoryItem class (constructor-based, no defaults)
```

There are no `core/`, `features/`, or `environments/` directories, no services beyond Angular's
own `MatDialog`, and no state management layer — component state is plain class fields, not
signals or RxJS streams.

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

Regenerate `src/app/models/database.types.ts` after any schema change with
`npm run supabase:gen:types` (requires the local Supabase stack running).

## Coding Conventions (from `.editorconfig`)

- 2-space indentation, single quotes in `.ts` files, final newline required, trailing whitespace
  trimmed (except in `.md` files).

## Known Issues

- `README.md` has an unresolved git merge conflict (`<<<<<<< HEAD` / `=======` /
  `>>>>>>> origin/main` markers are committed as-is). Flag this if you touch the README rather
  than silently working around it.
