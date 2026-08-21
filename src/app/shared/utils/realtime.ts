import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/realtime-js';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';

/** Subscribes to every insert/update/delete on `table` and calls `onChange`
 *  for each one. Deliberately no client-side organization_id filter —
 *  every other read in this app (loadInventory(), loadTasks(), etc.) trusts
 *  RLS alone for org scoping rather than adding a redundant .eq(...)
 *  client-side, and postgres_changes delivery is already gated per
 *  connected client by the table's own RLS SELECT policy (see
 *  enable_realtime_for_inventory_and_tasks.sql's own comment) — the same
 *  boundary every other query already relies on, not a second one to keep
 *  in sync with it.
 *
 *  Returns the RealtimeChannel so the caller can pass it to
 *  supabase.removeChannel() from a DestroyRef.onDestroy() — the same
 *  interval-cleanup shape HeaderComponent/ManageTeamComponent already use
 *  for their own live-ish features, just for a channel instead of a timer.
 *  One channel per calling component instance is intentional, not a
 *  missed opportunity for a shared app-wide channel: this is a single-
 *  router-outlet SPA, so at most one of this helper's callers is ever
 *  mounted at a time. */
export function subscribeToTableChanges<T extends keyof Database['public']['Tables']>(
  supabase: SupabaseClient<Database>,
  table: T,
  onChange: (payload: RealtimePostgresChangesPayload<Database['public']['Tables'][T]['Row']>) => void
): RealtimeChannel {
  return supabase
    .channel(`${String(table)}-changes`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: table as string },
      onChange
    )
    .subscribe();
}
