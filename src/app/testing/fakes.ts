import { computed, signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, Profile } from '../core/auth.service';
import { SiteSettingsService } from '../core/site-settings.service';
import { SupabaseService } from '../core/supabase.service';
import { InventoryItem, InventoryItemStatus } from '../shared/models/inventory-item.model';
import { DEFAULT_INVENTORY_TABLE_COLUMNS, InventoryTableColumnKey } from '../shared/models/inventory-table-column';
import { Database } from '../shared/models/database.types';

type Task = Database['public']['Tables']['tasks']['Row'];

/** Shared test doubles for the app's cross-cutting services/tokens, so
 *  individual specs don't have to hand-roll them (and don't accidentally
 *  construct the real AuthService, whose constructor calls
 *  supabase.auth.getSession()/onAuthStateChange() — real network activity
 *  that's slow, flaky, and pointless in a unit test). */

export function createFakeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    email: 'test@example.com',
    full_name: 'Test User',
    nickname: null,
    role: 'staff',
    membership_status: 'approved',
    organization_id: 'org-1',
    avatar_key: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** `profile: null` mirrors the signed-out/not-yet-loaded state. Pass a
 *  profile (see createFakeProfile) to simulate a signed-in user.
 *
 *  `hasSession` defaults to "true iff a profile was given" — the common
 *  case — but can be set independently, since AuthService's own real
 *  session/profile lag (see its own doc comment) means "has a session but
 *  no profile yet" is a real state guards need to handle, not just
 *  "signed in" vs "signed out". */
export function createFakeAuthService(
  profile: Profile | null = null,
  options: { hasSession?: boolean } = {}
): AuthService {
  const profileSignal = signal(profile);
  const hasSession = options.hasSession ?? profile !== null;
  const fakeSession = hasSession ? { user: { id: profile?.id ?? 'user-1' } } : null;
  const fake = {
    session: signal(fakeSession).asReadonly(),
    isAuthenticated: computed(() => hasSession),
    profile: profileSignal.asReadonly(),
    role: computed(() => profileSignal()?.role ?? null),
    canManage: computed(() => {
      const role = profileSignal()?.role;
      return role === 'admin' || role === 'manager';
    }),
    organizationId: computed(() => profileSignal()?.organization_id ?? null),
    getSession: async () => fakeSession,
    getProfile: async () => profileSignal(),
    refreshProfile: async () => {},
    signIn: async () => null,
    signUp: async () => ({ error: null, needsEmailConfirmation: false }),
    resolveOrganizationBySlug: async () => null,
    signOut: async () => {},
    requestPasswordReset: async () => null,
    updatePassword: async () => null,
  };
  return fake as unknown as AuthService;
}

/** SiteSettingsService.load() (and its underlying real AuthService, which
 *  the real service also depends on) query Supabase — same reasoning as
 *  createFakeAuthService above, so any component that just reads a signal
 *  off this service (e.g. InventoryComponent's tableColumns) can use this
 *  instead of constructing the real thing. */
export function createFakeSiteSettingsService(overrides: Partial<{
  theme: string;
  logoUrl: string | null;
  inventoryTableColumns: InventoryTableColumnKey[];
}> = {}): SiteSettingsService {
  const fake = {
    theme: signal(overrides.theme ?? 'default').asReadonly(),
    logoUrl: signal(overrides.logoUrl ?? null).asReadonly(),
    inventoryTableColumns: signal(overrides.inventoryTableColumns ?? DEFAULT_INVENTORY_TABLE_COLUMNS).asReadonly(),
    load: async () => {},
    applyTheme: () => {},
    updateTheme: async () => null,
    uploadLogo: async () => null,
    removeLogo: async () => null,
    updateInventoryTableColumns: async () => null,
    loadLogoUrlForOrganization: async () => null,
  };
  return fake as unknown as SiteSettingsService;
}

export function createFakeActivatedRoute(queryParams: Record<string, string> = {}): ActivatedRoute {
  return {
    snapshot: {
      queryParamMap: convertToParamMap(queryParams),
      paramMap: convertToParamMap({}),
      data: {},
    },
  } as unknown as ActivatedRoute;
}

/** Minimal chainable stand-in for supabase-js's query/RPC builders — every
 *  method just returns itself, so `.from(...).select(...).eq(...)` etc.
 *  chains freely no matter which methods a given component happens to
 *  call, and the whole thing is awaitable (thenable), always resolving to
 *  `result`. Not a real fake of query behavior (nothing here inspects which
 *  table/filters were used) — it exists purely so a component that queries
 *  Supabase from its constructor or ngOnInit (e.g. for a nav badge count)
 *  doesn't hit the real hosted project during a unit test that isn't
 *  actually exercising that query, the same reasoning createFakeAuthService
 *  avoids constructing the real AuthService above. */
function createFakeQueryBuilder(result: { data?: unknown; count?: number; error?: unknown } = { data: [], count: 0, error: null }) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  for (const method of ['select', 'eq', 'neq', 'not', 'in', 'order', 'limit', 'single', 'maybeSingle', 'insert', 'update', 'delete', 'upsert']) {
    builder[method] = () => builder;
  }
  return builder;
}

export function createFakeSupabaseService(result?: { data?: unknown; count?: number; error?: unknown }): SupabaseService {
  const fake = {
    client: {
      from: () => createFakeQueryBuilder(result),
      rpc: () => createFakeQueryBuilder(result),
    },
  };
  return fake as unknown as SupabaseService;
}

export function createFakeMatDialogRef() {
  return {
    close: (_result?: unknown) => {},
    afterClosed: () => of(undefined),
    addPanelClass: (_class?: string | string[]) => {},
    removePanelClass: (_class?: string | string[]) => {},
  };
}

/** InventoryItem's constructor is positional (25 args, no defaults) rather
 *  than an options object, so this helper — with overrides for whatever a
 *  given test actually cares about — keeps specs readable and resilient to
 *  new fields being added later (this file has already had to be updated
 *  twice this project for exactly that reason). */
export function createTestInventoryItem(overrides: Partial<{
  id: string;
  name: string;
  barcode: string;
  category: string;
  physicalLocation: string;
  quantityRemaining: number;
  lowQuantityThreshold: number;
  isCheckedOut: boolean;
  checkedOutTo: string;
  checkedOutToId: string | null;
  checkedOutToAvatarKey: string | null;
  status: InventoryItemStatus;
  retirementRequestedById: string | null;
}> = {}): InventoryItem {
  return new InventoryItem(
    overrides.id ?? 'item-1',
    overrides.name ?? 'Test Item',
    overrides.barcode ?? '',
    'A test item',
    '',
    [],
    overrides.category ?? 'Category',
    overrides.physicalLocation ?? 'Warehouse A',
    '',
    '2024',
    '',
    '',
    '',
    '',
    100,
    10,
    0,
    overrides.quantityRemaining ?? 50,
    overrides.lowQuantityThreshold ?? 10,
    0,
    0,
    overrides.isCheckedOut ?? false,
    overrides.checkedOutTo ?? '',
    overrides.checkedOutToId ?? null,
    overrides.checkedOutToAvatarKey ?? null,
    [],
    overrides.status ?? 'active',
    overrides.retirementRequestedById ?? null,
    '',
    '',
    '',
    '',
    ''
  );
}

type InventoryItemRow = Database['public']['Tables']['inventory_items']['Row'];

export function createTestInventoryItemRow(overrides: Partial<InventoryItemRow> = {}): InventoryItemRow {
  return {
    id: 'item-1',
    name: 'Test Item',
    barcode: null,
    description: null,
    image: null,
    category: null,
    physical_location: null,
    digital_location: null,
    applicable_year: null,
    expiration_date: null,
    supplier_name: null,
    supplier_lead_time: null,
    order_link: null,
    quantity_total: 100,
    quantity_per_container: null,
    quantity_allocated: 0,
    quantity_remaining: 50,
    low_quantity_threshold: null,
    price_per_unit: null,
    price_per_container: null,
    is_checked_out: false,
    checked_out_to: null,
    activity_log: null,
    organization_id: 'org-1',
    status: 'active',
    retirement_requested_by: null,
    retirement_requested_at: null,
    retirement_request_note: null,
    retired_by: null,
    retired_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    description: null,
    status: 'todo',
    assigned_to: null,
    created_by: 'user-1',
    due_date: null,
    pending_transfer_to: null,
    related_item_name: null,
    organization_id: 'org-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
