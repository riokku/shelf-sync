import { TestBed } from '@angular/core/testing';
import { NotificationCenterService } from './notification-center.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { createFakeAuthService } from '../testing/fakes';
import { Database } from '../shared/models/database.types';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

function createTestNotificationRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'notif-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    kind: 'task_assigned',
    message: 'You\'ve been assigned "Restock shelves"',
    link: '/tasks',
    read_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

/** Hand-rolled rather than the shared createFakeSupabaseService() — this
 *  spec needs .from('notifications').update(...) to distinguish .eq() (one
 *  id) from .in() (several, for markAllAsRead()) and needs .channel().on()
 *  to actually capture the registered callback (subscribeToTableChanges'
 *  own onChange) so realtime INSERT/UPDATE/DELETE events can be simulated —
 *  the shared fake's channel is deliberately inert (see its own doc
 *  comment), which doesn't fit here. */
function createFakeSupabaseClient(notifications: NotificationRow[] = []) {
  const updateEqSpy = jasmine.createSpy('update.eq').and.returnValue(Promise.resolve({ error: null }));
  const updateInSpy = jasmine.createSpy('update.in').and.returnValue(Promise.resolve({ error: null }));
  const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: updateEqSpy, in: updateInSpy });

  let capturedOnChange: ((payload: unknown) => void) | null = null;
  const channelStub = {
    on: (_event: string, _filter: unknown, onChange: (payload: unknown) => void) => {
      capturedOnChange = onChange;
      return channelStub;
    },
    subscribe: () => channelStub
  };

  const client = {
    from: () => ({
      select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: notifications, error: null }) }) }),
      update: updateSpy
    }),
    channel: () => channelStub,
    removeChannel: async () => ({ status: 'ok' })
  };

  return {
    client: client as unknown as SupabaseService['client'],
    updateSpy,
    updateEqSpy,
    updateInSpy,
    emitChange: (payload: unknown) => capturedOnChange?.(payload)
  };
}

function setup(notifications: NotificationRow[] = [], hasSession = true) {
  const fakeSupabase = createFakeSupabaseClient(notifications);
  TestBed.configureTestingModule({
    providers: [
      { provide: SupabaseService, useValue: { client: fakeSupabase.client } },
      { provide: AuthService, useValue: createFakeAuthService(null, { hasSession }) }
    ]
  });
  const service = TestBed.inject(NotificationCenterService);
  TestBed.flushEffects();
  return { service, ...fakeSupabase };
}

describe('NotificationCenterService', () => {
  it('loads the signed-in user\'s notifications, newest first (as returned)', async () => {
    const rows = [createTestNotificationRow({ id: 'a' }), createTestNotificationRow({ id: 'b', read_at: '2026-01-02T00:00:00.000Z' })];
    const { service } = setup(rows);
    await Promise.resolve();

    expect(service.notifications().map(n => n.id)).toEqual(['a', 'b']);
  });

  it('stays empty when there is no session', async () => {
    const { service } = setup([createTestNotificationRow()], false);
    await Promise.resolve();

    expect(service.notifications()).toEqual([]);
  });

  it('unreadCount counts only rows with no read_at', async () => {
    const rows = [
      createTestNotificationRow({ id: 'a', read_at: null }),
      createTestNotificationRow({ id: 'b', read_at: '2026-01-02T00:00:00.000Z' }),
      createTestNotificationRow({ id: 'c', read_at: null })
    ];
    const { service } = setup(rows);
    await Promise.resolve();

    expect(service.unreadCount()).toBe(2);
  });

  describe('markAsRead()', () => {
    it('optimistically marks the row read locally and persists it', async () => {
      const { service, updateSpy, updateEqSpy } = setup([createTestNotificationRow({ id: 'a', read_at: null })]);
      await Promise.resolve();

      await service.markAsRead('a');

      expect(service.notifications()[0].readAt).toEqual(jasmine.any(String));
      expect(updateSpy).toHaveBeenCalledWith({ read_at: jasmine.any(String) });
      expect(updateEqSpy).toHaveBeenCalledWith('id', 'a');
    });

    it('is a no-op for an already-read notification', async () => {
      const { service, updateSpy } = setup([createTestNotificationRow({ id: 'a', read_at: '2026-01-02T00:00:00.000Z' })]);
      await Promise.resolve();

      await service.markAsRead('a');

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead()', () => {
    it('marks every unread notification read in one call', async () => {
      const rows = [
        createTestNotificationRow({ id: 'a', read_at: null }),
        createTestNotificationRow({ id: 'b', read_at: '2026-01-02T00:00:00.000Z' }),
        createTestNotificationRow({ id: 'c', read_at: null })
      ];
      const { service, updateInSpy } = setup(rows);
      await Promise.resolve();

      await service.markAllAsRead();

      expect(service.unreadCount()).toBe(0);
      expect(updateInSpy).toHaveBeenCalledWith('id', ['a', 'c']);
    });

    it('does nothing when nothing is unread', async () => {
      const { service, updateSpy } = setup([createTestNotificationRow({ id: 'a', read_at: '2026-01-02T00:00:00.000Z' })]);
      await Promise.resolve();

      await service.markAllAsRead();

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('realtime updates', () => {
    it('prepends a new notification on INSERT', async () => {
      const { service, emitChange } = setup([createTestNotificationRow({ id: 'existing' })]);
      await Promise.resolve();

      emitChange({ eventType: 'INSERT', new: createTestNotificationRow({ id: 'fresh' }) });

      expect(service.notifications().map(n => n.id)).toEqual(['fresh', 'existing']);
    });

    it('patches a notification in place on UPDATE (e.g. read elsewhere)', async () => {
      const { service, emitChange } = setup([createTestNotificationRow({ id: 'a', read_at: null })]);
      await Promise.resolve();

      emitChange({ eventType: 'UPDATE', new: createTestNotificationRow({ id: 'a', read_at: '2026-01-02T00:00:00.000Z' }) });

      expect(service.notifications()[0].readAt).toBe('2026-01-02T00:00:00.000Z');
    });

    it('removes a notification on DELETE', async () => {
      const { service, emitChange } = setup([createTestNotificationRow({ id: 'a' })]);
      await Promise.resolve();

      emitChange({ eventType: 'DELETE', old: { id: 'a' } });

      expect(service.notifications()).toEqual([]);
    });
  });
});
