import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';
import { Profile } from '../../core/auth.service';
import { resolveProfileAvatarKey, resolveProfileName } from './profile-label';

export type ActivityEntityType = Database['public']['Tables']['activity_log']['Row']['entity_type'];

export interface OrgActivityLogEntry {
  timestamp: string;
  actor: string;
  actorAvatarKey: string | null;
  entityType: ActivityEntityType;
  message: string;
}

/** Loads every activity_log row for the caller's organization within
 *  [from, to) (ISO timestamps), newest first — RLS already scopes this to
 *  one organization, so no explicit org filter is needed here. Mirrors
 *  loadInventoryActivityByItemId()'s shape (shared/utils/inventory-item-activity.ts):
 *  resolve each actor_id against an already-loaded profiles array rather
 *  than joining, same reasoning (profiles is cheap to load once up front).
 *
 *  Returns `{ entries, error }` rather than a bare array — this is the
 *  page's own primary content load, so its caller needs to distinguish a
 *  genuine fetch failure from "no activity today," same reasoning
 *  loadAllInventoryItemReservations() gives for its own identical shape. */
export async function loadActivityLog(
  supabase: SupabaseClient<Database>,
  profiles: Profile[],
  range: { from: string; to: string }
): Promise<{ entries: OrgActivityLogEntry[]; error: string | null }> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .gte('created_at', range.from)
    .lt('created_at', range.to)
    .order('created_at', { ascending: false });

  if (error) {
    return { entries: [], error: error.message };
  }

  return {
    entries: (data ?? []).map(row => ({
      timestamp: row.created_at,
      actor: row.actor_id ? (resolveProfileName(row.actor_id, profiles) || 'Unknown user') : 'System',
      actorAvatarKey: row.actor_id ? resolveProfileAvatarKey(row.actor_id, profiles) : null,
      entityType: row.entity_type,
      message: row.message
    })),
    error: null
  };
}

/** Thin insert wrapper, same shape as logInventoryItemActivity() — organization_id
 *  is left to the column's default (the caller's own org), so it's never
 *  passed explicitly here. Returns the error message on failure (matching
 *  logInventoryItemActivity's callers, none of which hard-fail the primary
 *  action over a log write failing) or null on success. */
export async function logActivity(
  supabase: SupabaseClient<Database>,
  userId: string,
  entityType: ActivityEntityType,
  entityId: string | null,
  message: string
): Promise<string | null> {
  const { error } = await supabase.from('activity_log').insert({
    actor_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    message
  });
  return error?.message ?? null;
}
