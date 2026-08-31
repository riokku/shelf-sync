import { TestBed } from '@angular/core/testing';
import { CommandPaletteService } from './command-palette.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { createFakeAuthService, createFakeProfile } from '../testing/fakes';

interface PaletteFakeData {
  items?: { id: string; name: string; barcode: string | null }[];
  tasks?: { id: string; title: string }[];
  profiles?: { id: string; full_name: string | null; nickname: string | null; email: string; organization_id?: string }[];
  reservations?: { id: string; item_id: string; reserved_for: string }[];
  broadcasts?: { id: string; title: string }[];
  audits?: { id: string; physical_location: string | null; status: string }[];
  suppliers?: { id: string; name: string; contact_name: string | null }[];
  orders?: { id: string; item_id: string; supplier_name: string; status: string }[];
  organizations?: { id: string; name: string }[];
}

function createFakeSupabaseServiceForPalette(data: PaletteFakeData): SupabaseService {
  function builderFor(rows: unknown[]) {
    const builder: Record<string, unknown> = {
      then: (resolve: (value: { data: unknown[] }) => void) => resolve({ data: rows }),
    };
    for (const method of ['select', 'eq', 'order', 'limit']) {
      builder[method] = () => builder;
    }
    return builder;
  }

  const byTable: Record<string, unknown[]> = {
    tasks: data.tasks ?? [],
    profiles: data.profiles ?? [],
    inventory_item_reservations: data.reservations ?? [],
    broadcasts: data.broadcasts ?? [],
    inventory_audits: data.audits ?? [],
    suppliers: data.suppliers ?? [],
    inventory_item_orders: data.orders ?? [],
    organizations: data.organizations ?? []
  };

  const fake = {
    client: {
      from: (table: string) => builderFor(byTable[table] ?? data.items ?? [])
    }
  };
  return fake as unknown as SupabaseService;
}

async function createService(data: PaletteFakeData, profile = createFakeProfile()): Promise<CommandPaletteService> {
  // Reset even within a single `it` — a couple of tests below build two
  // services (e.g. staff vs. manager) to compare, and TestBed's injector is
  // finalized the moment the first one is TestBed.inject()-ed.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SupabaseService, useValue: createFakeSupabaseServiceForPalette(data) },
      { provide: AuthService, useValue: createFakeAuthService(profile) }
    ]
  });
  const service = TestBed.inject(CommandPaletteService);
  await service.ensureDataLoaded();
  return service;
}

describe('CommandPaletteService', () => {
  it('returns the destinations list for an empty query, filtered to what this viewer can reach', async () => {
    const service = await createService({}, createFakeProfile({ role: 'staff' }));
    const results = service.results('');

    expect(results.every(result => result.group === 'Pages')).toBeTrue();
    expect(results.some(result => result.label === 'Home')).toBeTrue();
    expect(results.some(result => result.label === 'Manage')).toBeFalse();
  });

  it('includes manage-only destinations for a manager', async () => {
    const service = await createService({}, createFakeProfile({ role: 'manager' }));
    const results = service.results('manage');

    expect(results.some(result => result.label === 'Manage')).toBeTrue();
  });

  it('matches inventory items by name or barcode and deep-links to ?item=', async () => {
    const service = await createService({
      items: [
        { id: 'item-1', name: 'Folding Chair', barcode: null },
        { id: 'item-2', name: 'Round Table', barcode: 'UPC-999' }
      ]
    });

    const byName = service.results('chair');
    expect(byName.find(r => r.group === 'Inventory')?.label).toBe('Folding Chair');
    expect(byName.find(r => r.group === 'Inventory')?.routerLink).toEqual(['/inventory']);
    expect(byName.find(r => r.group === 'Inventory')?.queryParams).toEqual({ item: 'item-1' });

    const byBarcode = service.results('upc-999');
    expect(byBarcode.find(r => r.group === 'Inventory')?.label).toBe('Round Table');
  });

  it('matches tasks by title and deep-links to ?task=', async () => {
    const service = await createService({ tasks: [{ id: 'task-1', title: 'Restock chairs' }] });
    const results = service.results('restock');

    const taskResult = results.find(r => r.group === 'Tasks');
    expect(taskResult?.routerLink).toEqual(['/tasks']);
    expect(taskResult?.queryParams).toEqual({ task: 'task-1' });
  });

  it('matches reservations by who they\'re for, and deep-links to manage/reservations ?highlight=', async () => {
    const service = await createService({
      items: [{ id: 'item-1', name: 'Chiavari Chairs', barcode: null }],
      reservations: [{ id: 'reservation-1', item_id: 'item-1', reserved_for: 'Smith wedding' }]
    });
    const results = service.results('smith');

    const reservationResult = results.find(r => r.group === 'Reservations');
    expect(reservationResult?.label).toBe('Smith wedding');
    expect(reservationResult?.sublabel).toBe('Chiavari Chairs');
    expect(reservationResult?.routerLink).toEqual(['/manage/reservations']);
    expect(reservationResult?.queryParams).toEqual({ highlight: 'reservation-1' });
  });

  it('matches audits by physical location, falling back to "Whole organization", and deep-links to manage/audits ?audit=', async () => {
    const service = await createService({
      audits: [
        { id: 'audit-1', physical_location: 'Warehouse A', status: 'in_progress' },
        { id: 'audit-2', physical_location: null, status: 'completed' }
      ]
    });

    const scoped = service.results('warehouse').find(r => r.group === 'Audits');
    expect(scoped?.label).toBe('Warehouse A');
    expect(scoped?.routerLink).toEqual(['/manage/audits']);
    expect(scoped?.queryParams).toEqual({ audit: 'audit-1' });

    const wholeOrg = service.results('whole organization').find(r => r.group === 'Audits');
    expect(wholeOrg?.label).toBe('Whole organization');
  });

  it('matches broadcasts by title, and deep-links to /broadcasts ?highlight=', async () => {
    const service = await createService({ broadcasts: [{ id: 'broadcast-1', title: 'Office closed Monday' }] });
    const result = service.results('office').find(r => r.group === 'Broadcasts');

    expect(result?.routerLink).toEqual(['/broadcasts']);
    expect(result?.queryParams).toEqual({ highlight: 'broadcast-1' });
  });

  it('only searches suppliers/orders/people for a manager, and deep-links each to its own ?highlight=/?search=', async () => {
    const data: PaletteFakeData = {
      items: [{ id: 'item-1', name: 'Chiavari Chairs', barcode: null }],
      suppliers: [{ id: 'supplier-1', name: 'Gatherwell Event Furniture Co.', contact_name: null }],
      orders: [{ id: 'order-1', item_id: 'item-1', supplier_name: 'Gatherwell Event Furniture Co.', status: 'ordered' }],
      profiles: [{ id: 'user-2', full_name: 'Alice Admin', nickname: null, email: 'alice@example.com' }]
    };

    const staffService = await createService(data, createFakeProfile({ role: 'staff' }));
    const staffResults = staffService.results('gatherwell');
    expect(staffResults.some(r => r.group === 'Suppliers')).toBeFalse();
    expect(staffResults.some(r => r.group === 'Orders')).toBeFalse();
    expect(staffService.results('alice').some(r => r.group === 'People')).toBeFalse();

    const managerService = await createService(data, createFakeProfile({ role: 'manager' }));
    const supplierResult = managerService.results('gatherwell').find(r => r.group === 'Suppliers');
    expect(supplierResult?.routerLink).toEqual(['/manage/suppliers']);
    expect(supplierResult?.queryParams).toEqual({ highlight: 'supplier-1' });

    const orderResult = managerService.results('gatherwell').find(r => r.group === 'Orders');
    expect(orderResult?.label).toBe('Chiavari Chairs');
    expect(orderResult?.routerLink).toEqual(['/manage/orders']);
    expect(orderResult?.queryParams).toEqual({ highlight: 'order-1' });

    const personResult = managerService.results('alice').find(r => r.group === 'People');
    expect(personResult?.routerLink).toEqual(['/manage/team']);
    expect(personResult?.queryParams).toEqual({ search: 'Alice Admin' });
  });

  it('only searches organizations/platform users for a platform admin, deep-linking straight to their own detail page', async () => {
    const data: PaletteFakeData = {
      organizations: [{ id: 'org-2', name: 'Acme Events' }],
      profiles: [{ id: 'user-3', full_name: 'Bob Manager', nickname: null, email: 'bob@example.com', organization_id: 'org-2' }]
    };

    const managerService = await createService(data, createFakeProfile({ role: 'manager', is_platform_admin: false }));
    expect(managerService.results('acme').some(r => r.group === 'Organizations')).toBeFalse();
    expect(managerService.results('bob').some(r => r.group === 'Users')).toBeFalse();

    const platformAdminService = await createService(data, createFakeProfile({ is_platform_admin: true }));
    const orgResult = platformAdminService.results('acme').find(r => r.group === 'Organizations');
    expect(orgResult?.routerLink).toEqual(['/studio/organizations', 'org-2']);

    const userResult = platformAdminService.results('bob').find(r => r.group === 'Users');
    expect(userResult?.label).toBe('Bob Manager');
    expect(userResult?.sublabel).toBe('Acme Events');
    expect(userResult?.routerLink).toEqual(['/studio/users', 'user-3']);
  });

  it('only searches people for a manager, and deep-links to manage/team ?search=', async () => {
    const staffService = await createService(
      { profiles: [{ id: 'user-2', full_name: 'Alice Admin', nickname: null, email: 'alice@example.com' }] },
      createFakeProfile({ role: 'staff' })
    );
    expect(staffService.results('alice').some(r => r.group === 'People')).toBeFalse();

    const managerService = await createService(
      { profiles: [{ id: 'user-2', full_name: 'Alice Admin', nickname: null, email: 'alice@example.com' }] },
      createFakeProfile({ role: 'manager' })
    );
    const personResult = managerService.results('alice').find(r => r.group === 'People');
    expect(personResult?.routerLink).toEqual(['/manage/team']);
    expect(personResult?.queryParams).toEqual({ search: 'Alice Admin' });
  });

  it('also matches an inventory item/task/person by their raw id (a pasted uuid, not just a display name)', async () => {
    const service = await createService(
      {
        items: [{ id: 'a1b2c3d4-item', name: 'Folding Chair', barcode: null }],
        tasks: [{ id: 'e5f6a7b8-task', title: 'Restock chairs' }],
        profiles: [{ id: 'c9d0e1f2-user', full_name: 'Alice Admin', nickname: null, email: 'alice@example.com' }]
      },
      createFakeProfile({ role: 'manager' })
    );

    expect(service.results('a1b2c3d4').find(r => r.group === 'Inventory')?.label).toBe('Folding Chair');
    expect(service.results('e5f6a7b8').find(r => r.group === 'Tasks')?.label).toBe('Restock chairs');
    expect(service.results('c9d0e1f2').find(r => r.group === 'People')?.label).toBe('Alice Admin');
  });

  it('caps each group at COMMAND_PALETTE_MAX_RESULTS_PER_GROUP', async () => {
    const service = await createService({
      items: Array.from({ length: 8 }, (_, i) => ({ id: `item-${i}`, name: `Widget ${i}`, barcode: null }))
    });

    expect(service.results('widget').filter(r => r.group === 'Inventory').length).toBe(5);
  });
});
