import { computed, signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, Profile } from '../core/auth.service';
import { InventoryFieldName, InventoryFieldOptionsService } from '../core/inventory-field-options.service';
import { SiteSettingsService } from '../core/site-settings.service';
import { SupabaseService } from '../core/supabase.service';
import { SupplierService } from '../core/supplier.service';
import { ReservationKitService } from '../core/reservation-kit.service';
import { ImpersonationService } from '../core/impersonation.service';
import { InventoryItem, InventoryItemStatus } from '../shared/models/inventory-item.model';
import { Supplier } from '../shared/models/supplier.model';
import { ReservationKit } from '../shared/models/reservation-kit.model';
import { DEFAULT_INVENTORY_TABLE_COLUMNS, InventoryTableColumnKey } from '../shared/models/inventory-table-column';
import { DEFAULT_INVENTORY_FORM_FIELDS, InventoryFormFieldKey } from '../shared/models/inventory-form-field';
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
    is_platform_admin: false,
    avatar_key: null,
    last_active_at: null,
    quick_menu_enabled: false,
    quick_menu_items: [],
    account_locked_at: null,
    account_locked_by: null,
    account_locked_reason: null,
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
  options: { hasSession?: boolean; organizationName?: string | null } = {}
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
    isPlatformAdmin: computed(() => profileSignal()?.is_platform_admin ?? false),
    organizationId: computed(() => profileSignal()?.organization_id ?? null),
    organizationName: signal(options.organizationName ?? null).asReadonly(),
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
  inventoryFormFields: InventoryFormFieldKey[];
  requireRetirementApproval: boolean;
  bulkEditFeatureEnabled: boolean;
  restrictPriceSupplierEdits: boolean;
  notifyTaskAssigned: boolean;
  notifyTaskTransfer: boolean;
  notifyRetirementRequest: boolean;
  notifyJoinRequest: boolean;
  notifyCheckoutOverdue: boolean;
}> = {}): SiteSettingsService {
  const fake = {
    theme: signal(overrides.theme ?? 'default').asReadonly(),
    logoUrl: signal(overrides.logoUrl ?? null).asReadonly(),
    inventoryTableColumns: signal(overrides.inventoryTableColumns ?? DEFAULT_INVENTORY_TABLE_COLUMNS).asReadonly(),
    inventoryFormFields: signal(overrides.inventoryFormFields ?? DEFAULT_INVENTORY_FORM_FIELDS).asReadonly(),
    requireRetirementApproval: signal(overrides.requireRetirementApproval ?? true).asReadonly(),
    bulkEditFeatureEnabled: signal(overrides.bulkEditFeatureEnabled ?? true).asReadonly(),
    restrictPriceSupplierEdits: signal(overrides.restrictPriceSupplierEdits ?? false).asReadonly(),
    notifyTaskAssigned: signal(overrides.notifyTaskAssigned ?? true).asReadonly(),
    notifyTaskTransfer: signal(overrides.notifyTaskTransfer ?? true).asReadonly(),
    notifyRetirementRequest: signal(overrides.notifyRetirementRequest ?? true).asReadonly(),
    notifyJoinRequest: signal(overrides.notifyJoinRequest ?? true).asReadonly(),
    notifyCheckoutOverdue: signal(overrides.notifyCheckoutOverdue ?? true).asReadonly(),
    load: async () => {},
    applyTheme: () => {},
    updateTheme: async () => null,
    uploadLogo: async () => null,
    removeLogo: async () => null,
    updateInventoryTableColumns: async () => null,
    updateInventoryFormFields: async () => null,
    updateRequireRetirementApproval: async () => null,
    updateBulkEditFeatureEnabled: async () => null,
    updateRestrictPriceSupplierEdits: async () => null,
    updateEmailNotifications: async () => null,
    loadLogoUrlForOrganization: async () => null,
  };
  return fake as unknown as SiteSettingsService;
}

/** Covers both InventoryFieldOptionsService's own consumers and
 *  FieldOptionsEditorComponent (a SettingsComponent child that injects the
 *  same service directly) — Angular DI satisfies both from this one
 *  provider, so a component test doesn't need to fake each separately. */
export function createFakeInventoryFieldOptionsService(
  options: Partial<Record<InventoryFieldName, string[]>> = {}
): InventoryFieldOptionsService {
  const resolved: Record<InventoryFieldName, string[]> = {
    category: options.category ?? [],
    physical_location: options.physical_location ?? [],
    discard_reason: options.discard_reason ?? []
  };
  const fake = {
    optionsFor: (field: InventoryFieldName) => resolved[field],
    load: async () => {},
    addOption: async () => null,
    loadUsedValues: async () => [],
    removeOption: async () => null,
  };
  return fake as unknown as InventoryFieldOptionsService;
}

/** Mirrors createFakeInventoryFieldOptionsService's shape above — a signal-
 *  backed list plus no-op writes, for any component that injects
 *  SupplierService (the supplier picker on the item create/edit forms, and
 *  manage/suppliers itself). */
export function createFakeSupplierService(suppliers: Supplier[] = [], loadError: string | null = null): SupplierService {
  const fake = {
    suppliers: signal(suppliers).asReadonly(),
    loadError: signal(loadError).asReadonly(),
    load: async () => {},
    create: async () => null,
    update: async () => null,
    remove: async () => null,
  };
  return fake as unknown as SupplierService;
}

export function createFakeReservationKitService(kits: ReservationKit[] = [], loadError: string | null = null): ReservationKitService {
  const fake = {
    kits: signal(kits).asReadonly(),
    loadError: signal(loadError).asReadonly(),
    load: async () => {},
    create: async () => null,
    update: async () => null,
    remove: async () => null,
  };
  return fake as unknown as ReservationKitService;
}

/** Backs ImpersonationBannerComponent and any other consumer that just
 *  reads ImpersonationService's own state rather than exercising its real
 *  start()/stop() flow (see impersonation.service.spec.ts for the real
 *  service's own dedicated tests, which need finer control over the
 *  Supabase client than this shared fake is shaped for). `state: null`
 *  mirrors "not currently impersonating anyone". */
export function createFakeImpersonationService(state: {
  targetLabel: string;
  targetOrgLabel: string;
  startedAt: string;
} | null = null): ImpersonationService {
  const fake = {
    isImpersonating: signal(state !== null).asReadonly(),
    targetLabel: signal(state?.targetLabel ?? null).asReadonly(),
    targetOrgLabel: signal(state?.targetOrgLabel ?? null).asReadonly(),
    startedAt: signal(state?.startedAt ?? null).asReadonly(),
    start: async () => null,
    stop: async () => {},
  };
  return fake as unknown as ImpersonationService;
}

export function createFakeActivatedRoute(queryParams: Record<string, string> = {}, pathParams: Record<string, string> = {}): ActivatedRoute {
  return {
    snapshot: {
      queryParamMap: convertToParamMap(queryParams),
      paramMap: convertToParamMap(pathParams),
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
 *  avoids constructing the real AuthService above. Exported (rather than
 *  module-private) so a spec that needs a *table-aware* fake — e.g. a
 *  realtime change handler test that needs `.from()` to behave differently
 *  per call — can build its own narrower fake on top of this instead of
 *  re-implementing the same chainable-builder shape from scratch (see
 *  auth.service.spec.ts's own hand-rolled fake for the pattern this is
 *  meant to support). */
export function createFakeQueryBuilder(result: { data?: unknown; count?: number; error?: unknown } = { data: [], count: 0, error: null }) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  for (const method of ['select', 'eq', 'neq', 'not', 'in', 'is', 'gte', 'lt', 'order', 'limit', 'single', 'maybeSingle', 'insert', 'update', 'delete', 'upsert']) {
    builder[method] = () => builder;
  }
  return builder;
}

/** Inert — `.on()` never invokes its callback, `.subscribe()` is just a
 *  no-op chain terminator. Exists purely so a component that opens a
 *  realtime channel in ngOnInit (see shared/utils/realtime.ts) doesn't
 *  throw "...channel is not a function" in a spec built on the plain
 *  createFakeSupabaseService() below; it never simulates an actual change
 *  event. A spec that needs a change event to actually fire builds its own
 *  narrower fake locally (see auth.service.spec.ts's emitAuthStateChange
 *  for the capture-the-callback pattern to mirror) rather than this one
 *  growing logic it otherwise wouldn't need.
 *
 *  Also covers Presence's own methods (track/untrack/presenceState) as the
 *  same kind of inert no-op, for the identical reason — ItemEditPresenceService
 *  calls these from ModalTableComponent's startEdit()/cancelEdit()/saveEdit(),
 *  and plenty of existing specs for components that embed
 *  ModalTableComponent call those methods directly against this same inert
 *  fake, with no interest in presence behavior at all. */
function createFakeRealtimeChannel() {
  const channel: Record<string, unknown> = {
    on: () => channel,
    subscribe: () => channel,
    track: async () => ({ status: 'ok' }),
    untrack: async () => ({ status: 'ok' }),
    presenceState: () => ({}),
  };
  return channel;
}

export function createFakeSupabaseService(result?: { data?: unknown; count?: number; error?: unknown }): SupabaseService {
  const fake = {
    client: {
      from: () => createFakeQueryBuilder(result),
      rpc: () => createFakeQueryBuilder(result),
      channel: () => createFakeRealtimeChannel(),
      removeChannel: async () => ({ status: 'ok' }),
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

/** InventoryItem's constructor is positional (28 args, no defaults) rather
 *  than an options object, so this helper — with overrides for whatever a
 *  given test actually cares about — keeps specs readable and resilient to
 *  new fields being added later (this file has already had to be updated
 *  several times this project for exactly that reason). */
export function createTestInventoryItem(overrides: Partial<{
  id: string;
  name: string;
  barcode: string;
  category: string;
  physicalLocation: string;
  supplierId: string | null;
  supplierName: string;
  quantityRemaining: number;
  lowQuantityThreshold: number;
  isCheckedOut: boolean;
  checkedOutTo: string;
  checkedOutToId: string | null;
  checkedOutToAvatarKey: string | null;
  checkedOutDueAt: string;
  status: InventoryItemStatus;
  retirementRequestedById: string | null;
  isLocked: boolean;
  lockedByLabel: string;
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
    overrides.supplierName ?? '',
    overrides.supplierId ?? null,
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
    overrides.checkedOutDueAt ?? '',
    [],
    overrides.status ?? 'active',
    overrides.retirementRequestedById ?? null,
    '',
    '',
    '',
    '',
    '',
    overrides.isLocked ?? false,
    overrides.lockedByLabel ?? '',
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
    supplier_id: null,
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
    checkout_due_at: null,
    checkout_overdue_notified_at: null,
    activity_log: null,
    organization_id: 'org-1',
    status: 'active',
    retirement_requested_by: null,
    retirement_requested_at: null,
    retirement_request_note: null,
    retired_by: null,
    retired_at: null,
    is_locked: false,
    locked_by: null,
    locked_at: null,
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

/** Every spec that mounts LoginComponent/RegisterComponent/
 *  ForgotPasswordComponent embeds a live `<app-turnstile-widget>` — without
 *  `window.turnstile` already set before `fixture.detectChanges()` runs,
 *  that child component's own `ngOnInit()` would append a real
 *  `<script src="https://challenges.cloudflare.com/...">` tag and fire off
 *  an actual network request. Call this in `beforeEach` (and
 *  `delete window.turnstile` in `afterEach`, so it can't leak into some
 *  unrelated spec file run later in the same browser tab) — specs that need
 *  a captcha token typically set `component.captchaToken` directly instead
 *  of driving the widget's own UI, the same way they already bypass every
 *  other piece of template UI to call a component method directly. */
export function installFakeTurnstile() {
  window.turnstile = {
    render: () => 'fake-widget-id',
    reset: () => {},
    remove: () => {}
  };
}
