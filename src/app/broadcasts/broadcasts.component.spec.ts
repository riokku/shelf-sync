import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { BroadcastsComponent } from './broadcasts.component';
import { SupabaseService } from '../core/supabase.service';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { BroadcastModalComponent } from '../shared/components/broadcast-modal/broadcast-modal.component';
import { createFakeAuthService, createFakeProfile, createFakeSupabaseService } from '../testing/fakes';
import { Broadcast } from '../shared/models/broadcast.model';

function createTestBroadcast(overrides: Partial<Broadcast> = {}): Broadcast {
  return {
    id: 'broadcast-1',
    title: 'Office closed Monday',
    message: 'The warehouse is closed for the holiday.',
    createdById: 'user-1',
    createdByLabel: 'Test User',
    createdByAvatarKey: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isEdited: false,
    referencedMembers: [],
    referencedItems: [],
    ...overrides,
  };
}

function createFakeDialogRef(result: unknown): MatDialogRef<unknown> {
  return { afterClosed: () => of(result) } as unknown as MatDialogRef<unknown>;
}

describe('BroadcastsComponent', () => {
  let component: BroadcastsComponent;
  let fixture: ComponentFixture<BroadcastsComponent>;

  async function setup(options: { error?: { message: string } | null; role?: 'admin' | 'manager' | 'staff' } = {}) {
    await TestBed.configureTestingModule({
      imports: [BroadcastsComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], error: options.error ?? null }) },
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ id: 'user-1', role: options.role ?? 'staff' })) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BroadcastsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('shows the empty state when the org has no broadcasts yet', async () => {
    await setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No broadcasts yet.');
  });

  it('sets loadError instead of silently rendering an empty list when the broadcasts query fails', async () => {
    await setup({ error: { message: 'Network error' } });
    fixture.detectChanges();

    expect(component.loadError).toBe('Network error');
    expect(component.broadcasts).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Couldn\'t load broadcasts. Network error');
  });

  it('retryLoad() clears loadError on a successful retry', async () => {
    await setup({ error: { message: 'Network error' } });
    expect(component.loadError).toBe('Network error');

    (component as unknown as { supabase: SupabaseService['client'] }).supabase =
      createFakeSupabaseService({ data: [], error: null }).client;

    component.retryLoad();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.loadError).toBeNull();
  });

  describe('canEdit()', () => {
    it('is true for a broadcast the signed-in user authored', async () => {
      await setup();
      expect(component.canEdit(createTestBroadcast({ createdById: 'user-1' }))).toBeTrue();
    });

    it('is false for someone else\'s broadcast', async () => {
      await setup();
      expect(component.canEdit(createTestBroadcast({ createdById: 'user-2' }))).toBeFalse();
    });

    it('is false for an orphaned broadcast (author removed, createdById null)', async () => {
      await setup();
      expect(component.canEdit(createTestBroadcast({ createdById: null }))).toBeFalse();
    });
  });

  describe('newBroadcast()', () => {
    it('opens the broadcast modal with no broadcast in its data (create mode)', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));

      component.newBroadcast();

      expect(openSpy).toHaveBeenCalledWith(BroadcastModalComponent, jasmine.objectContaining({
        data: jasmine.objectContaining({ broadcast: undefined })
      }));
    });

    it('reloads and toasts "Broadcast posted" on a truthy close', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      component.newBroadcast();
      await fixture.whenStable();

      expect(successSpy).toHaveBeenCalledWith('Broadcast posted');
    });
  });

  describe('editBroadcast()', () => {
    it('opens the broadcast modal with the broadcast in its data, and toasts "Broadcast updated" on save', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      const broadcast = createTestBroadcast();
      const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      component.editBroadcast(broadcast);
      await fixture.whenStable();

      expect(openSpy).toHaveBeenCalledWith(BroadcastModalComponent, jasmine.objectContaining({
        data: jasmine.objectContaining({ broadcast })
      }));
      expect(successSpy).toHaveBeenCalledWith('Broadcast updated');
    });
  });

  describe('removeBroadcast()', () => {
    it('deletes and toasts on confirmation', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      component.removeBroadcast(createTestBroadcast());
      // A real macrotask flush (rather than counting microtask hops) —
      // removeBroadcast()'s dialogRef.afterClosed() subscribe callback
      // chains multiple awaits (deleteBroadcast(), then
      // loadBroadcastsList()) against the fake Supabase client's own plain
      // thenables (see testing/fakes.ts's own createFakeQueryBuilder),
      // which whenStable() alone doesn't reliably wait all the way through.
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(component.deleteError).toBeNull();
      expect(successSpy).toHaveBeenCalledWith('Broadcast deleted');
    });

    it('does nothing when the confirmation is dismissed', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(false));
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      component.removeBroadcast(createTestBroadcast());
      await fixture.whenStable();

      expect(successSpy).not.toHaveBeenCalled();
    });

    it('surfaces a delete failure inline', async () => {
      await setup({ error: { message: 'delete failed' } });
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));

      component.removeBroadcast(createTestBroadcast());
      // See the "deletes and toasts on confirmation" test above for why a
      // real macrotask flush, not just whenStable(), is needed here.
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(component.deleteError).toBe('delete failed');
    });
  });
});

/** Table-aware and realtime-capturing at once — same reasoning
 *  ManageReservationsComponent's own identical local fake gives
 *  (createFakeSupabaseService() reuses one result for every `.from()` call
 *  and its fake channel never actually invokes a callback). */
function createRealtimeCapturingSupabaseService() {
  let capturedCallback: ((payload: unknown) => void) | null = null;
  let broadcastsSelectCount = 0;

  function builder(table: string) {
    const b: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
    };
    for (const method of ['select', 'eq', 'in', 'order']) {
      b[method] = () => {
        if (table === 'broadcasts' && method === 'select') {
          broadcastsSelectCount++;
        }
        return b;
      };
    }
    return b;
  }

  const channel: Record<string, unknown> = {
    on: (_type: string, _filter: unknown, callback: (payload: unknown) => void) => {
      capturedCallback = callback;
      return channel;
    },
    subscribe: () => channel,
  };

  const service = {
    client: {
      from: (table: string) => builder(table),
      channel: () => channel,
      removeChannel: async () => ({ status: 'ok' }),
    }
  } as unknown as SupabaseService;

  return {
    service,
    emitChange: (payload: unknown) => capturedCallback?.(payload),
    getBroadcastsSelectCount: () => broadcastsSelectCount,
  };
}

describe('BroadcastsComponent realtime updates', () => {
  function configure(service: SupabaseService) {
    TestBed.configureTestingModule({
      imports: [BroadcastsComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: service },
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) }
      ]
    });
    return TestBed.createComponent(BroadcastsComponent);
  }

  it('collapses a burst of postgres_changes events into a single reload, 300ms after the last one', fakeAsync(() => {
    const { service, emitChange, getBroadcastsSelectCount } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    fixture.detectChanges();
    tick();

    // ngOnInit's own initial loadBroadcastsList() call.
    expect(getBroadcastsSelectCount()).toBe(1);

    emitChange({ eventType: 'UPDATE', new: { id: 'broadcast-1' }, old: {} });
    emitChange({ eventType: 'UPDATE', new: { id: 'broadcast-1' }, old: {} });
    emitChange({ eventType: 'UPDATE', new: { id: 'broadcast-1' }, old: {} });

    tick(299);
    expect(getBroadcastsSelectCount()).toBe(1); // still within the debounce window

    tick(1);
    expect(getBroadcastsSelectCount()).toBe(2); // exactly one more loadBroadcastsList() call, not three
  }));

  it('cancels a pending debounced reload and removes the channel on destroy', fakeAsync(() => {
    const { service, emitChange, getBroadcastsSelectCount } = createRealtimeCapturingSupabaseService();
    const removeChannelSpy = spyOn(service.client, 'removeChannel').and.callThrough();
    const fixture = configure(service);
    fixture.detectChanges();
    tick();

    emitChange({ eventType: 'UPDATE', new: { id: 'broadcast-1' }, old: {} });
    fixture.destroy();
    tick(300);

    expect(removeChannelSpy).toHaveBeenCalled();
    expect(getBroadcastsSelectCount()).toBe(1); // the debounced reload never fired post-destroy
  }));

  it('flashes a changed broadcast only once the debounced reload actually reflects it, then clears the flash after it fades', fakeAsync(() => {
    const { service, emitChange } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    expect(component.isFlashing('broadcast-1')).toBeFalse();

    emitChange({ eventType: 'UPDATE', new: { id: 'broadcast-1' }, old: {} });
    // Not yet — still within the 300ms debounce window.
    expect(component.isFlashing('broadcast-1')).toBeFalse();

    tick(300);
    expect(component.isFlashing('broadcast-1')).toBeTrue();

    tick(1500);
    expect(component.isFlashing('broadcast-1')).toBeFalse();
  }));

  it('does not flash a deleted broadcast — there is nothing left to show it on', fakeAsync(() => {
    const { service, emitChange } = createRealtimeCapturingSupabaseService();
    const fixture = configure(service);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    tick();

    emitChange({ eventType: 'DELETE', new: {}, old: { id: 'broadcast-1' } });
    tick(300);

    expect(component.isFlashing('broadcast-1')).toBeFalse();
  }));
});
