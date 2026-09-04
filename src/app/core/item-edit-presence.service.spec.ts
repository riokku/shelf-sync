import { TestBed } from '@angular/core/testing';
import { ItemEditPresenceService } from './item-edit-presence.service';
import { SupabaseService } from './supabase.service';
import { AuthService, Profile } from './auth.service';
import { createFakeAuthService, createFakeProfile } from '../testing/fakes';

/** Hand-rolled rather than the shared createFakeSupabaseService() — this
 *  spec needs .channel() to capture the requested name/config, needs
 *  .on('presence', ...) to actually capture the registered 'sync' callback
 *  so a presence sync can be simulated, and needs .track()/.untrack() as
 *  real spies to assert against — the shared fake's channel is deliberately
 *  inert (see its own doc comment), which doesn't fit a spec actually
 *  exercising presence behavior. */
function createFakeSupabaseClient() {
  const trackSpy = jasmine.createSpy('track').and.returnValue(Promise.resolve({ status: 'ok' }));
  const untrackSpy = jasmine.createSpy('untrack').and.returnValue(Promise.resolve({ status: 'ok' }));
  let capturedSync: (() => void) | null = null;
  let presenceState: Record<string, unknown[]> = {};
  let channelName: string | null = null;
  let channelConfig: unknown = null;

  const channelStub = {
    on: (_type: string, _filter: { event: string }, callback: () => void) => {
      capturedSync = callback;
      return channelStub;
    },
    subscribe: () => channelStub,
    track: trackSpy,
    untrack: untrackSpy,
    presenceState: () => presenceState,
  };

  const client = {
    channel: (name: string, config: unknown) => {
      channelName = name;
      channelConfig = config;
      return channelStub;
    },
    removeChannel: async () => ({ status: 'ok' }),
  };

  return {
    client: client as unknown as SupabaseService['client'],
    trackSpy,
    untrackSpy,
    getChannelName: () => channelName,
    getChannelConfig: () => channelConfig,
    /** Simulates the channel's own presence state changing (someone else
     *  tracking/untracking) followed by the 'sync' event it fires. */
    emitPresenceSync: (state: Record<string, unknown[]>) => {
      presenceState = state;
      capturedSync?.();
    },
  };
}

function setup(profileOverrides: Partial<Profile> = {}, hasSession = true) {
  const fakeSupabase = createFakeSupabaseClient();
  const profile = hasSession ? createFakeProfile(profileOverrides) : null;
  TestBed.configureTestingModule({
    providers: [
      { provide: SupabaseService, useValue: { client: fakeSupabase.client } },
      { provide: AuthService, useValue: createFakeAuthService(profile, { hasSession }) },
    ],
  });
  const service = TestBed.inject(ItemEditPresenceService);
  TestBed.flushEffects();
  return { service, ...fakeSupabase };
}

describe('ItemEditPresenceService', () => {
  it('opens a presence channel scoped to the org, keyed by the caller\'s own id', () => {
    const { getChannelName, getChannelConfig } = setup({ id: 'user-1', organization_id: 'org-1' });

    expect(getChannelName()).toBe('item-editing:org-1');
    expect(getChannelConfig()).toEqual({ config: { presence: { key: 'user-1' } } });
  });

  it('does not open a channel when there is no session', () => {
    const { getChannelName } = setup({}, false);

    expect(getChannelName()).toBeNull();
  });

  it('editorFor() returns null for an item nobody is editing', () => {
    const { service } = setup();

    expect(service.editorFor('item-1')).toBeNull();
  });

  describe('startEditing()', () => {
    it('tracks the item id alongside the caller\'s own name/avatar', () => {
      const { service, trackSpy } = setup({ id: 'user-1', full_name: 'Ada Lovelace', nickname: null, avatar_key: 'shape-1' });

      service.startEditing('item-1');

      expect(trackSpy).toHaveBeenCalledWith({ itemId: 'item-1', userId: 'user-1', name: 'Ada Lovelace', avatarKey: 'shape-1' });
    });

    it('is a safe no-op when there is no session (no channel to track on)', () => {
      const { service, trackSpy } = setup({}, false);

      expect(() => service.startEditing('item-1')).not.toThrow();
      expect(trackSpy).not.toHaveBeenCalled();
    });
  });

  describe('stopEditing()', () => {
    it('untracks the caller\'s own presence entry', () => {
      const { service, untrackSpy } = setup();

      service.stopEditing();

      expect(untrackSpy).toHaveBeenCalled();
    });

    it('is a safe no-op when there is no session', () => {
      const { service, untrackSpy } = setup({}, false);

      expect(() => service.stopEditing()).not.toThrow();
      expect(untrackSpy).not.toHaveBeenCalled();
    });
  });

  describe('presence sync -> editorFor()', () => {
    it('surfaces another user editing an item', () => {
      const { service, emitPresenceSync } = setup({ id: 'viewer' });

      emitPresenceSync({
        'editor-1': [{ presence_ref: 'ref-1', itemId: 'item-1', userId: 'editor-1', name: 'Grace Hopper', avatarKey: 'people-2' }],
      });

      expect(service.editorFor('item-1')).toEqual({ userId: 'editor-1', name: 'Grace Hopper', avatarKey: 'people-2' });
    });

    it('excludes the caller\'s own presence entry — never reflects your own edit back at you', () => {
      const { service, emitPresenceSync } = setup({ id: 'viewer' });

      emitPresenceSync({
        viewer: [{ presence_ref: 'ref-1', itemId: 'item-1', userId: 'viewer', name: 'Me', avatarKey: null }],
      });

      expect(service.editorFor('item-1')).toBeNull();
    });

    it('drops an item once its editor untracks (no longer present in synced state)', () => {
      const { service, emitPresenceSync } = setup({ id: 'viewer' });

      emitPresenceSync({
        'editor-1': [{ presence_ref: 'ref-1', itemId: 'item-1', userId: 'editor-1', name: 'Grace Hopper', avatarKey: null }],
      });
      expect(service.editorFor('item-1')).not.toBeNull();

      emitPresenceSync({});

      expect(service.editorFor('item-1')).toBeNull();
    });

    it('tracks multiple editors on different items independently', () => {
      const { service, emitPresenceSync } = setup({ id: 'viewer' });

      emitPresenceSync({
        'editor-1': [{ presence_ref: 'ref-1', itemId: 'item-1', userId: 'editor-1', name: 'Grace Hopper', avatarKey: null }],
        'editor-2': [{ presence_ref: 'ref-2', itemId: 'item-2', userId: 'editor-2', name: 'Katherine Johnson', avatarKey: null }],
      });

      expect(service.editorFor('item-1')?.name).toBe('Grace Hopper');
      expect(service.editorFor('item-2')?.name).toBe('Katherine Johnson');
    });
  });
});
