import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';
import { Profile } from '../../core/auth.service';
import { Broadcast, BroadcastReferencedItem, BroadcastReferencedMember } from '../models/broadcast.model';
import { resolveProfileAvatarKey, resolveProfileName } from './profile-label';

type BroadcastRow = Database['public']['Tables']['broadcasts']['Row'];
type BroadcastReferenceRow = Database['public']['Tables']['broadcast_references']['Row'];

function toBroadcast(
  row: BroadcastRow,
  references: BroadcastReferenceRow[],
  profiles: Profile[],
  itemNamesById: Map<string, string>
): Broadcast {
  const referencedMembers: BroadcastReferencedMember[] = references
    .filter((reference): reference is BroadcastReferenceRow & { member_id: string } =>
      reference.reference_type === 'member' && reference.member_id !== null
    )
    .map(reference => ({
      id: reference.member_id,
      name: resolveProfileName(reference.member_id, profiles) || 'Unknown user',
      avatarKey: resolveProfileAvatarKey(reference.member_id, profiles)
    }));

  const referencedItems: BroadcastReferencedItem[] = references
    .filter((reference): reference is BroadcastReferenceRow & { item_id: string } =>
      reference.reference_type === 'inventory_item' && reference.item_id !== null
    )
    .map(reference => ({
      id: reference.item_id,
      name: itemNamesById.get(reference.item_id) ?? 'Unknown item'
    }));

  return {
    id: row.id,
    title: row.title,
    message: row.message,
    createdById: row.created_by,
    createdByLabel: row.created_by ? (resolveProfileName(row.created_by, profiles) || 'Unknown user') : 'Unknown user',
    createdByAvatarKey: resolveProfileAvatarKey(row.created_by, profiles),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isEdited: row.updated_at !== row.created_at,
    referencedMembers,
    referencedItems
  };
}

/** Every broadcast for the caller's org, most recent first, plus its
 *  member/item references resolved to display names — backs /broadcasts.
 *  RLS (broadcasts' own SELECT policy) is what actually scopes this to the
 *  caller's org, same "no explicit organization_id filter, trust RLS alone"
 *  convention every other unfiltered query in this app already follows.
 *  itemNamesById is the same plain client-side id->name join convention
 *  loadAllInventoryItemOrders() already uses, not a PostgREST
 *  embedded-resource select.
 *
 *  Returns `{ broadcasts, error }` rather than a bare array — this is the
 *  page's own primary content load, so its caller needs to distinguish a
 *  genuine fetch failure from "no broadcasts yet," same reasoning
 *  loadAllInventoryItemReservations() gives for its own identical shape. */
export async function loadBroadcasts(
  supabase: SupabaseClient<Database>,
  profiles: Profile[],
  itemNamesById: Map<string, string>
): Promise<{ broadcasts: Broadcast[]; error: string | null }> {
  const { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { broadcasts: [], error: error.message };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return { broadcasts: [], error: null };
  }

  const { data: referenceRows } = await supabase
    .from('broadcast_references')
    .select('*')
    .in('broadcast_id', rows.map(row => row.id));

  const referencesByBroadcastId = new Map<string, BroadcastReferenceRow[]>();
  for (const reference of referenceRows ?? []) {
    const list = referencesByBroadcastId.get(reference.broadcast_id) ?? [];
    list.push(reference);
    referencesByBroadcastId.set(reference.broadcast_id, list);
  }

  return {
    broadcasts: rows.map(row =>
      toBroadcast(row, referencesByBroadcastId.get(row.id) ?? [], profiles, itemNamesById)
    ),
    error: null
  };
}

export interface BroadcastInput {
  title: string;
  message: string;
  memberIds: string[];
  itemIds: string[];
}

/** Creates a broadcast via the create_broadcast() RPC — see that function's
 *  own doc comment (add_broadcasts migration) for why this can't be a plain
 *  insert: it has to fan out to broadcast_references and notifications as
 *  one atomic unit, admin/manager gated. Returns the error message on
 *  failure, or null on success. */
export async function createBroadcast(supabase: SupabaseClient<Database>, input: BroadcastInput): Promise<string | null> {
  const { error } = await supabase.rpc('create_broadcast', {
    p_title: input.title,
    p_message: input.message,
    p_member_ids: input.memberIds,
    p_item_ids: input.itemIds
  });
  return error?.message ?? null;
}

/** Updates an existing broadcast's title/message (plain RLS, author-only —
 *  see the add_broadcasts migration) and replaces its reference set
 *  wholesale: delete every existing broadcast_references row for this
 *  broadcast, then insert the new set — simpler than diffing add/remove,
 *  same delete-then-insert convention that migration's own RLS comment
 *  already establishes for editing this table. */
export async function updateBroadcast(
  supabase: SupabaseClient<Database>,
  id: string,
  input: BroadcastInput
): Promise<string | null> {
  const { error: updateError } = await supabase
    .from('broadcasts')
    .update({ title: input.title, message: input.message })
    .eq('id', id);
  if (updateError) {
    return updateError.message;
  }

  const { error: deleteError } = await supabase.from('broadcast_references').delete().eq('broadcast_id', id);
  if (deleteError) {
    return deleteError.message;
  }

  const references = [
    ...input.memberIds.map(memberId => ({ broadcast_id: id, reference_type: 'member' as const, member_id: memberId })),
    ...input.itemIds.map(itemId => ({ broadcast_id: id, reference_type: 'inventory_item' as const, item_id: itemId }))
  ];
  if (references.length === 0) {
    return null;
  }

  const { error: insertError } = await supabase.from('broadcast_references').insert(references);
  return insertError?.message ?? null;
}

/** Deletes a broadcast (plain RLS, author-only) — cascades away its own
 *  broadcast_references rows via the FK, no separate delete needed. */
export async function deleteBroadcast(supabase: SupabaseClient<Database>, id: string): Promise<string | null> {
  const { error } = await supabase.from('broadcasts').delete().eq('id', id);
  return error?.message ?? null;
}
