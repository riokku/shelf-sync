import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';
import { ActivityLogEntry } from '../models/inventory-item.model';
import { Profile } from '../../core/auth.service';
import { resolveProfileName } from './profile-label';

export async function loadInventoryActivityByItemId(
  supabase: SupabaseClient<Database>,
  itemIds: string[],
  profiles: Profile[]
): Promise<Map<string, ActivityLogEntry[]>> {
  const activityByItemId = new Map<string, ActivityLogEntry[]>();
  if (itemIds.length === 0) {
    return activityByItemId;
  }

  const { data } = await supabase
    .from('inventory_item_activity')
    .select('*')
    .in('item_id', itemIds)
    .order('created_at', { ascending: false });

  for (const row of data ?? []) {
    const entry: ActivityLogEntry = {
      timestamp: row.created_at,
      user: row.user_id ? (resolveProfileName(row.user_id, profiles) || 'Unknown user') : 'System',
      message: row.message
    };
    const existing = activityByItemId.get(row.item_id) ?? [];
    existing.push(entry);
    activityByItemId.set(row.item_id, existing);
  }

  return activityByItemId;
}

export async function logInventoryItemActivity(
  supabase: SupabaseClient<Database>,
  itemId: string,
  userId: string,
  message: string
): Promise<string | null> {
  const { error } = await supabase.from('inventory_item_activity').insert({
    item_id: itemId,
    user_id: userId,
    message
  });
  return error?.message ?? null;
}
