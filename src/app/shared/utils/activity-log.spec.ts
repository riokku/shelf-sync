import { loadActivityLog, logActivity } from './activity-log';
import { createFakeProfile } from '../../testing/fakes';

/** Minimal chainable stand-in scoped to exactly the two query shapes this
 *  file's functions use (loadActivityLog's select/gte/lt/order, logActivity's
 *  insert) — createFakeSupabaseService (testing/fakes.ts) is deliberately
 *  too generic for this: it returns the same fixed result for every `.from()`
 *  call, which can't express "these particular rows came back". */
function createFakeSupabaseClient(options: { rows?: unknown[]; insertError?: { message: string } | null; selectError?: { message: string } | null } = {}) {
  const insertCalls: unknown[] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: { data: unknown; error: unknown }) => void) =>
      resolve({ data: options.selectError ? null : (options.rows ?? []), error: options.selectError ?? null }),
  };
  for (const method of ['select', 'gte', 'lt', 'order']) {
    builder[method] = () => builder;
  }
  builder['insert'] = (value: unknown) => {
    insertCalls.push(value);
    return { then: (resolve: (v: { error: unknown }) => void) => resolve({ error: options.insertError ?? null }) };
  };
  return { client: { from: () => builder }, insertCalls } as unknown as {
    client: { from: () => unknown };
    insertCalls: unknown[];
  };
}

describe('loadActivityLog', () => {
  const profiles = [
    createFakeProfile({ id: 'user-1', nickname: 'Kirsty', avatar_key: 'ocean' }),
  ];

  it('resolves a known actor to their display name and avatar', async () => {
    const fake = createFakeSupabaseClient({
      rows: [{
        created_at: '2026-08-19T10:00:00.000Z',
        actor_id: 'user-1',
        entity_type: 'task',
        message: 'Created task "Restock"',
        via_impersonation: false
      }]
    });

    const { entries } = await loadActivityLog(fake.client as never, profiles, { from: 'a', to: 'b' });

    expect(entries).toEqual([
      {
        timestamp: '2026-08-19T10:00:00.000Z',
        actor: 'Kirsty',
        actorAvatarKey: 'ocean',
        entityType: 'task',
        message: 'Created task "Restock"',
        viaImpersonation: false
      }
    ]);
  });

  it('carries via_impersonation through as viaImpersonation', async () => {
    const fake = createFakeSupabaseClient({
      rows: [{
        created_at: '2026-08-19T10:00:00.000Z',
        actor_id: 'user-1',
        entity_type: 'task',
        message: 'Signed in as this account',
        via_impersonation: true
      }]
    });

    const { entries } = await loadActivityLog(fake.client as never, profiles, { from: 'a', to: 'b' });

    expect(entries[0].viaImpersonation).toBeTrue();
  });

  it('labels a null actor_id as System rather than looking it up', async () => {
    const fake = createFakeSupabaseClient({
      rows: [{ created_at: '2026-08-19T10:00:00.000Z', actor_id: null, entity_type: 'member', message: 'Purged expired org' }]
    });

    const { entries } = await loadActivityLog(fake.client as never, profiles, { from: 'a', to: 'b' });

    expect(entries[0].actor).toBe('System');
    expect(entries[0].actorAvatarKey).toBeNull();
  });

  it('falls back to "Unknown user" when actor_id matches no loaded profile', async () => {
    const fake = createFakeSupabaseClient({
      rows: [{ created_at: '2026-08-19T10:00:00.000Z', actor_id: 'user-gone', entity_type: 'inventory_item', message: 'Created item "Widget"' }]
    });

    const { entries } = await loadActivityLog(fake.client as never, profiles, { from: 'a', to: 'b' });

    expect(entries[0].actor).toBe('Unknown user');
  });

  it('returns an empty array when there are no rows in range', async () => {
    const fake = createFakeSupabaseClient({ rows: [] });

    const { entries } = await loadActivityLog(fake.client as never, profiles, { from: 'a', to: 'b' });

    expect(entries).toEqual([]);
  });

  it('returns the error message and no entries when the query fails', async () => {
    const fake = createFakeSupabaseClient({ selectError: { message: 'connection reset' } });

    const { entries, error } = await loadActivityLog(fake.client as never, profiles, { from: 'a', to: 'b' });

    expect(error).toBe('connection reset');
    expect(entries).toEqual([]);
  });
});

describe('logActivity', () => {
  it('inserts with the given actor/entity/message, leaving organization_id to the column default', async () => {
    const fake = createFakeSupabaseClient();

    const result = await logActivity(fake.client as never, 'user-1', 'task', 'task-1', 'Created task "Restock"');

    expect(result).toBeNull();
    expect(fake.insertCalls).toEqual([
      { actor_id: 'user-1', entity_type: 'task', entity_id: 'task-1', message: 'Created task "Restock"' }
    ]);
  });

  it('returns the error message on failure rather than throwing', async () => {
    const fake = createFakeSupabaseClient({ insertError: { message: 'boom' } });

    const result = await logActivity(fake.client as never, 'user-1', 'task', null, 'Created task "Restock"');

    expect(result).toBe('boom');
  });
});
