import { computed, signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, Profile } from '../core/auth.service';
import { InventoryItem } from '../shared/models/inventory-item.model';
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
    organization_id: 'org-1',
    avatar_key: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** `profile: null` mirrors the signed-out/not-yet-loaded state. Pass a
 *  profile (see createFakeProfile) to simulate a signed-in user. */
export function createFakeAuthService(profile: Profile | null = null): AuthService {
  const profileSignal = signal(profile);
  const fake = {
    session: signal(null).asReadonly(),
    isAuthenticated: computed(() => false),
    profile: profileSignal.asReadonly(),
    role: computed(() => profileSignal()?.role ?? null),
    canManage: computed(() => {
      const role = profileSignal()?.role;
      return role === 'admin' || role === 'manager';
    }),
    organizationId: computed(() => profileSignal()?.organization_id ?? null),
    getSession: async () => null,
    getProfile: async () => profileSignal(),
    refreshProfile: async () => {},
    signIn: async () => null,
    signUp: async () => ({ error: null, needsEmailConfirmation: false }),
    resolveOrganizationBySlug: async () => null,
    signOut: async () => {},
  };
  return fake as unknown as AuthService;
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
  quantityRemaining: number;
  lowQuantityThreshold: number;
  isCheckedOut: boolean;
  checkedOutTo: string;
  checkedOutToId: string | null;
  checkedOutToAvatarKey: string | null;
}> = {}): InventoryItem {
  return new InventoryItem(
    overrides.id ?? 'item-1',
    overrides.name ?? 'Test Item',
    'A test item',
    '',
    [],
    'Category',
    'Warehouse A',
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
    []
  );
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
    related_item_name: null,
    organization_id: 'org-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
