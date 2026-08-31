import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Database } from '../shared/models/database.types';
import {
  COMMAND_PALETTE_DESTINATIONS,
  COMMAND_PALETTE_MAX_RESULTS_PER_GROUP,
  CommandPaletteDestination,
  CommandPaletteResult
} from '../shared/models/command-palette';

type InventoryItemRow = Pick<Database['public']['Tables']['inventory_items']['Row'], 'id' | 'name' | 'barcode'>;
type TaskRow = Pick<Database['public']['Tables']['tasks']['Row'], 'id' | 'title'>;
type ProfileRow = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'full_name' | 'nickname' | 'email'>;
type PlatformProfileRow = ProfileRow & { organization_id: string | null };
type ReservationRow = Pick<
  Database['public']['Tables']['inventory_item_reservations']['Row'],
  'id' | 'item_id' | 'reserved_for'
>;
type BroadcastRow = Pick<Database['public']['Tables']['broadcasts']['Row'], 'id' | 'title'>;
type SupplierRow = Pick<Database['public']['Tables']['suppliers']['Row'], 'id' | 'name' | 'contact_name'>;
type OrderRow = Pick<Database['public']['Tables']['inventory_item_orders']['Row'], 'id' | 'item_id' | 'supplier_name' | 'status'>;
type AuditRow = Pick<Database['public']['Tables']['inventory_audits']['Row'], 'id' | 'physical_location' | 'status'>;
type OrganizationRow = Pick<Database['public']['Tables']['organizations']['Row'], 'id' | 'name'>;

// A quick-jump tool doesn't need every item in a very large org, just enough
// to find the one you're typing toward — bounds the load rather than
// pulling an unbounded inventory_items table into memory.
const INVENTORY_LOAD_LIMIT = 500;

// How long a load is trusted before ensureDataLoaded() fetches again — see
// this class's own doc comment for why a cache, not a realtime
// subscription, is the right tradeoff here.
const CACHE_TTL_MS = 5 * 60_000;

/** Backs HeaderComponent's global Ctrl/Cmd+K command palette — owns the
 *  searchable data (destinations, plus a lazily-loaded, session-cached copy
 *  of the org's inventory items/tasks/reservations/audits/broadcasts, and —
 *  for the audiences who can actually reach their own destination pages —
 *  suppliers/orders/team members/organizations/platform-wide users), same
 *  NotificationCenterService/HeaderComponent split as the bell dropdown:
 *  this service owns data, HeaderComponent owns the panel's own open/close/
 *  keyboard-navigation UI state.
 *
 *  Deliberately no realtime subscription and no per-keystroke network call —
 *  this is a quick-jump tool, not a live view, so `ensureDataLoaded()` is a
 *  one-time (re-checked every CACHE_TTL_MS) fetch, and `results()` is a pure,
 *  instant, local filter over already-loaded arrays. Matches the same "load
 *  a bounded list once, filter client-side with term.trim().toLowerCase()
 *  .includes()" idiom ManageTeamComponent's team search and
 *  InventoryComponent's own search already use, rather than a per-keystroke
 *  `.ilike()`/`.or()` query — see StudioUsersComponent's own doc comment for
 *  why this codebase avoids building filter strings out of unsanitized
 *  search input.
 *
 *  Every group is gated to the same audience its own destination page
 *  already requires (Suppliers/Orders/People: manageGuard;
 *  Organizations/Users: platformAdminGuard; everything else: approvedGuard,
 *  i.e. always) — there's no point loading, let alone showing, a result a
 *  viewer couldn't open anyway, same fail-closed reasoning
 *  COMMAND_PALETTE_DESTINATIONS' own requiresManage/requiresPlatformAdmin
 *  flags already use for the Pages group. */
@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);

  private inventoryItems: InventoryItemRow[] = [];
  private tasks: TaskRow[] = [];
  private reservations: ReservationRow[] = [];
  private broadcasts: BroadcastRow[] = [];
  private audits: AuditRow[] = [];
  private people: ProfileRow[] = [];
  private suppliers: SupplierRow[] = [];
  private orders: OrderRow[] = [];
  private organizations: OrganizationRow[] = [];
  private platformProfiles: PlatformProfileRow[] = [];
  private loadedAt = 0;

  /** Called right before the panel opens, not eagerly at app start — most
   *  sessions may never use the palette. Reuses whatever's already cached
   *  within CACHE_TTL_MS rather than refetching on every open. */
  async ensureDataLoaded(): Promise<void> {
    if (Date.now() - this.loadedAt < CACHE_TTL_MS) {
      return;
    }

    const canManage = this.authService.canManage();
    const isPlatformAdmin = this.authService.isPlatformAdmin();
    const organizationId = this.authService.organizationId();

    const [
      itemsResult,
      tasksResult,
      reservationsResult,
      broadcastsResult,
      auditsResult,
      profilesResult,
      suppliersResult,
      ordersResult,
      organizationsResult,
      platformProfilesResult
    ] = await Promise.all([
      this.supabase.from('inventory_items').select('id, name, barcode').order('name').limit(INVENTORY_LOAD_LIMIT),
      this.supabase.from('tasks').select('id, title'),
      this.supabase.from('inventory_item_reservations').select('id, item_id, reserved_for'),
      this.supabase.from('broadcasts').select('id, title'),
      this.supabase.from('inventory_audits').select('id, physical_location, status'),
      canManage && organizationId
        ? this.supabase
            .from('profiles')
            .select('id, full_name, nickname, email')
            .eq('organization_id', organizationId)
            .eq('membership_status', 'approved')
        : Promise.resolve({ data: [] as ProfileRow[] }),
      canManage ? this.supabase.from('suppliers').select('id, name, contact_name').order('name') : Promise.resolve({ data: [] as SupplierRow[] }),
      canManage
        ? this.supabase.from('inventory_item_orders').select('id, item_id, supplier_name, status')
        : Promise.resolve({ data: [] as OrderRow[] }),
      // Cross-org reads, deliberately no organization_id filter — legitimate
      // only because these two are gated to isPlatformAdmin() below, the
      // same StudioOrganizationsComponent/StudioUsersComponent precedent
      // this mirrors (see add_platform_admin's own cross-org SELECT
      // policies, and the fix_org_isolation_bugs-adjacent "Studio Rio leak"
      // fix's own note on why every *other* plain query in this app carries
      // an explicit org filter instead).
      isPlatformAdmin ? this.supabase.from('organizations').select('id, name') : Promise.resolve({ data: [] as OrganizationRow[] }),
      isPlatformAdmin
        ? this.supabase.from('profiles').select('id, full_name, nickname, email, organization_id')
        : Promise.resolve({ data: [] as PlatformProfileRow[] })
    ]);

    this.inventoryItems = itemsResult.data ?? [];
    this.tasks = tasksResult.data ?? [];
    this.reservations = reservationsResult.data ?? [];
    this.broadcasts = broadcastsResult.data ?? [];
    this.audits = auditsResult.data ?? [];
    this.people = profilesResult.data ?? [];
    this.suppliers = suppliersResult.data ?? [];
    this.orders = ordersResult.data ?? [];
    this.organizations = organizationsResult.data ?? [];
    this.platformProfiles = platformProfilesResult.data ?? [];
    this.loadedAt = Date.now();
  }

  /** Pure and synchronous — every keystroke calls this directly against
   *  already-loaded data, no debounce/network round-trip needed. An empty
   *  query returns just the destinations list (so the palette doubles as a
   *  fast page-jump tool even before typing); a real query also searches
   *  every other loaded group, each capped at
   *  COMMAND_PALETTE_MAX_RESULTS_PER_GROUP. Every group also matches
   *  against its own raw id (a real, pastable uuid, not just its display
   *  name) — same "name or id" reach InventoryComponent's own search
   *  already has (item.name.includes(search) || item.id.includes(search)),
   *  extended here to every other entity so pasting an id copied from, say,
   *  a support ticket or another tab's URL works regardless of which kind
   *  of thing it points at. */
  results(query: string): CommandPaletteResult[] {
    const term = query.trim().toLowerCase();
    const pages = this.matchingDestinations(term);

    if (!term) {
      return pages;
    }

    return [
      ...pages,
      ...this.matchingInventoryItems(term),
      ...this.matchingTasks(term),
      ...this.matchingReservations(term),
      ...this.matchingAudits(term),
      ...this.matchingBroadcasts(term),
      ...this.matchingSuppliers(term),
      ...this.matchingOrders(term),
      ...this.matchingPeople(term),
      ...this.matchingOrganizations(term),
      ...this.matchingPlatformUsers(term)
    ];
  }

  private matchingDestinations(term: string): CommandPaletteResult[] {
    const canManage = this.authService.canManage();
    const isAdmin = this.authService.role() === 'admin';
    const isPlatformAdmin = this.authService.isPlatformAdmin();

    return COMMAND_PALETTE_DESTINATIONS
      .filter(destination => this.destinationVisible(destination, canManage, isAdmin, isPlatformAdmin))
      .filter(destination => !term || destination.label.toLowerCase().includes(term))
      .slice(0, COMMAND_PALETTE_MAX_RESULTS_PER_GROUP)
      .map(destination => ({
        id: `page:${destination.routerLink}`,
        group: 'Pages' as const,
        icon: destination.icon,
        label: destination.label,
        routerLink: [destination.routerLink]
      }));
  }

  private destinationVisible(
    destination: CommandPaletteDestination,
    canManage: boolean,
    isAdmin: boolean,
    isPlatformAdmin: boolean
  ): boolean {
    if (destination.requiresPlatformAdmin) {
      return isPlatformAdmin;
    }
    if (destination.requiresAdmin) {
      return isAdmin;
    }
    if (destination.requiresManage) {
      return canManage;
    }
    return true;
  }

  private matchingInventoryItems(term: string): CommandPaletteResult[] {
    return this.inventoryItems
      .filter(item =>
        item.name.toLowerCase().includes(term)
        || (item.barcode ?? '').toLowerCase().includes(term)
        || item.id.toLowerCase().includes(term)
      )
      .slice(0, COMMAND_PALETTE_MAX_RESULTS_PER_GROUP)
      .map(item => ({
        id: `inventory:${item.id}`,
        group: 'Inventory' as const,
        icon: 'inventory_2',
        label: item.name,
        sublabel: item.barcode ?? undefined,
        // Reuses InventoryComponent's own ?item= deep link (see
        // inventory.component.ts's ngOnInit) — no changes needed there.
        routerLink: ['/inventory'],
        queryParams: { item: item.id }
      }));
  }

  private matchingTasks(term: string): CommandPaletteResult[] {
    return this.tasks
      .filter(task => task.title.toLowerCase().includes(term) || task.id.toLowerCase().includes(term))
      .slice(0, COMMAND_PALETTE_MAX_RESULTS_PER_GROUP)
      .map(task => ({
        id: `task:${task.id}`,
        group: 'Tasks' as const,
        icon: 'checklist',
        label: task.title,
        // Reuses TasksComponent's own ?task= deep link, including its
        // existing fallback to /manage/tasks for a manager+ viewer when the
        // task isn't in their personal list (see tasks.component.ts's
        // ngOnInit) — no changes needed there.
        routerLink: ['/tasks'],
        queryParams: { task: task.id }
      }));
  }

  private matchingReservations(term: string): CommandPaletteResult[] {
    return this.reservations
      .filter(reservation => reservation.reserved_for.toLowerCase().includes(term) || reservation.id.toLowerCase().includes(term))
      .slice(0, COMMAND_PALETTE_MAX_RESULTS_PER_GROUP)
      .map(reservation => ({
        id: `reservation:${reservation.id}`,
        group: 'Reservations' as const,
        icon: 'event',
        label: reservation.reserved_for,
        sublabel: this.inventoryItems.find(item => item.id === reservation.item_id)?.name,
        // manage-reservations.component.ts reads this ?highlight= once in
        // ngOnInit to flash and scroll to the matching row — see
        // shared/utils/highlight-row.ts.
        routerLink: ['/manage/reservations'],
        queryParams: { highlight: reservation.id }
      }));
  }

  private matchingAudits(term: string): CommandPaletteResult[] {
    return this.audits
      // Mirrors ManageAuditsComponent's own template exactly
      // (audit.physicalLocation || 'Whole organization') — matched (and
      // later displayed) against this resolved label, not the raw column,
      // so typing "whole organization" actually finds an org-wide audit
      // whose physical_location is really just null.
      .map(audit => ({ ...audit, label: audit.physical_location || 'Whole organization' }))
      .filter(audit => audit.label.toLowerCase().includes(term) || audit.id.toLowerCase().includes(term))
      .slice(0, COMMAND_PALETTE_MAX_RESULTS_PER_GROUP)
      .map(audit => ({
        id: `audit:${audit.id}`,
        group: 'Audits' as const,
        icon: 'fact_check',
        label: audit.label,
        sublabel: audit.status,
        // Reuses ManageAuditsComponent's own existing ?audit= deep link —
        // no changes needed there (see app-routing.module.ts's own route
        // comment).
        routerLink: ['/manage/audits'],
        queryParams: { audit: audit.id }
      }));
  }

  private matchingBroadcasts(term: string): CommandPaletteResult[] {
    return this.broadcasts
      .filter(broadcast => broadcast.title.toLowerCase().includes(term) || broadcast.id.toLowerCase().includes(term))
      .slice(0, COMMAND_PALETTE_MAX_RESULTS_PER_GROUP)
      .map(broadcast => ({
        id: `broadcast:${broadcast.id}`,
        group: 'Broadcasts' as const,
        icon: 'campaign',
        label: broadcast.title,
        // BroadcastsComponent reads this ?highlight= once in ngOnInit —
        // same shape as Reservations above.
        routerLink: ['/broadcasts'],
        queryParams: { highlight: broadcast.id }
      }));
  }

  private matchingSuppliers(term: string): CommandPaletteResult[] {
    return this.suppliers
      .filter(supplier =>
        supplier.name.toLowerCase().includes(term)
        || (supplier.contact_name ?? '').toLowerCase().includes(term)
        || supplier.id.toLowerCase().includes(term)
      )
      .slice(0, COMMAND_PALETTE_MAX_RESULTS_PER_GROUP)
      .map(supplier => ({
        id: `supplier:${supplier.id}`,
        group: 'Suppliers' as const,
        icon: 'local_shipping',
        label: supplier.name,
        sublabel: supplier.contact_name ?? undefined,
        // ManageSuppliersComponent reads this ?highlight= once in ngOnInit —
        // same shape as Reservations/Broadcasts above.
        routerLink: ['/manage/suppliers'],
        queryParams: { highlight: supplier.id }
      }));
  }

  private matchingOrders(term: string): CommandPaletteResult[] {
    return this.orders
      .filter(order => order.supplier_name.toLowerCase().includes(term) || order.id.toLowerCase().includes(term))
      .slice(0, COMMAND_PALETTE_MAX_RESULTS_PER_GROUP)
      .map(order => ({
        id: `order:${order.id}`,
        group: 'Orders' as const,
        icon: 'shopping_cart',
        label: this.inventoryItems.find(item => item.id === order.item_id)?.name ?? order.supplier_name,
        sublabel: `${order.supplier_name} — ${order.status}`,
        // ManageOrdersComponent reads this ?highlight= once in ngOnInit —
        // same shape as Reservations/Broadcasts/Suppliers above.
        routerLink: ['/manage/orders'],
        queryParams: { highlight: order.id }
      }));
  }

  private matchingPeople(term: string): CommandPaletteResult[] {
    return this.people
      .map(person => ({ id: person.id, label: person.nickname || person.full_name || person.email }))
      .filter(person => person.label.toLowerCase().includes(term) || person.id.toLowerCase().includes(term))
      .slice(0, COMMAND_PALETTE_MAX_RESULTS_PER_GROUP)
      .map(person => ({
        id: `person:${person.id}`,
        group: 'People' as const,
        icon: 'person',
        label: person.label,
        // ManageTeamComponent reads this ?search= once in ngOnInit to
        // prefill its own team search field.
        routerLink: ['/manage/team'],
        queryParams: { search: person.label }
      }));
  }

  private matchingOrganizations(term: string): CommandPaletteResult[] {
    return this.organizations
      .filter(org => org.name.toLowerCase().includes(term) || org.id.toLowerCase().includes(term))
      .slice(0, COMMAND_PALETTE_MAX_RESULTS_PER_GROUP)
      .map(org => ({
        id: `org:${org.id}`,
        group: 'Organizations' as const,
        icon: 'apartment',
        label: org.name,
        // StudioOrgDetailComponent's own real per-id route — no query param
        // or page-side change needed, unlike the ?highlight= group above.
        routerLink: ['/studio/organizations', org.id]
      }));
  }

  private matchingPlatformUsers(term: string): CommandPaletteResult[] {
    const orgNameById = new Map(this.organizations.map(org => [org.id, org.name]));
    return this.platformProfiles
      .map(person => ({ id: person.id, label: person.nickname || person.full_name || person.email, organizationId: person.organization_id }))
      .filter(person => person.label.toLowerCase().includes(term) || person.id.toLowerCase().includes(term))
      .slice(0, COMMAND_PALETTE_MAX_RESULTS_PER_GROUP)
      .map(person => ({
        id: `platform-user:${person.id}`,
        group: 'Users' as const,
        icon: 'people',
        label: person.label,
        sublabel: person.organizationId ? orgNameById.get(person.organizationId) : undefined,
        // StudioUserDetailComponent's own real per-id route — same "no
        // page-side change needed" shape Organizations above already has.
        routerLink: ['/studio/users', person.id]
      }));
  }
}
