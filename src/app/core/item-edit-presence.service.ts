import { Injectable, effect, inject, signal } from '@angular/core';
import { RealtimeChannel, RealtimePresenceState } from '@supabase/realtime-js';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { profileDisplayName } from '../shared/utils/profile-label';

/** Who's currently mid-edit on a given inventory item, and what to render
 *  for them — userId is only used to filter out the viewer's own session
 *  (see editorFor() below), name/avatarKey are what's actually shown. */
export interface ItemEditor {
  userId: string;
  name: string;
  avatarKey: string | null;
}

type ItemEditPresencePayload = ItemEditor & { itemId: string };

/** Tracks, org-wide and for the life of the authenticated session, who is
 *  currently mid-edit on which inventory item — backs the "someone's
 *  already in here" border on Inventory's card/table view
 *  (InventoryComponent) and the matching name+icon banner in
 *  ModalTableComponent's own detail view. Root-provided and session-scoped
 *  (same shape as NotificationCenterService), not routed-page-scoped, since
 *  the same live state needs to be visible from whichever of
 *  InventoryComponent/ManageInventoryComponent/ModalTableComponent happens
 *  to be mounted, not just whichever one happened to start tracking.
 *
 *  Built on Supabase Realtime *Presence* — the first thing in this app to
 *  use it, rather than the postgres_changes wrapper every other realtime
 *  feature here is built on (see subscribeToTableChanges()). Presence is
 *  the right primitive specifically because it's ephemeral, per-connection
 *  state with automatic cleanup on disconnect: a closed tab, a crash, or a
 *  lost connection all clear themselves the instant the socket drops, no
 *  separate "nobody's touched this row in N minutes, assume it's stale"
 *  fallback needed the way profiles.last_active_at's own heartbeat (see
 *  shared/utils/presence.ts) needs one for account-level presence. A
 *  "someone's editing" flag that can get permanently stuck on (e.g. a
 *  crashed tab that never got to call stopEditing()) would be worse than
 *  one that's simply ephemeral by construction.
 *
 *  One channel per organization — not one per item, and not one per routed
 *  page. Every visible inventory card/row needs to know who's editing it,
 *  and opening a Presence channel per visible card doesn't scale the way a
 *  single shared channel carrying "userId -> which item, if any" does. The
 *  presence key is the user's own id (not Presence's own default,
 *  random-per-join key) so a second tab/device for the same person
 *  collapses onto the same entry rather than appearing as two distinct
 *  editors.
 *
 *  Channel names aren't RLS-protected the way postgres_changes delivery is
 *  (see subscribeToTableChanges()'s own doc comment) — this schema has no
 *  Realtime Authorization policies set up, so scoping the channel name by
 *  organization id is a practical, not a cryptographic, boundary. Accepted
 *  here the same way this schema accepts a few other low-sensitivity
 *  tradeoffs elsewhere: the only thing exposed to someone who guessed
 *  another org's id is who's currently editing which item there, nothing
 *  about the item's own data. */
@Injectable({ providedIn: 'root' })
export class ItemEditPresenceService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);

  private readonly _editingByItemId = signal<Map<string, ItemEditor>>(new Map());
  readonly editingByItemId = this._editingByItemId.asReadonly();

  private channel: RealtimeChannel | null = null;
  private subscribedOrgId: string | null = null;

  constructor() {
    effect(() => {
      const orgId = this.authService.organizationId();
      if (this.authService.isAuthenticated() && orgId) {
        this.subscribe(orgId);
      } else {
        this._editingByItemId.set(new Map());
        this.unsubscribe();
      }
    });
  }

  private subscribe(organizationId: string) {
    if (this.channel && this.subscribedOrgId === organizationId) {
      return;
    }
    // Covers an org change mid-session (e.g. impersonating into a different
    // org) — tears down the previous org's channel before opening the new
    // one rather than leaving two open at once.
    this.unsubscribe();
    this.subscribedOrgId = organizationId;
    const profileId = this.authService.profile()!.id;
    this.channel = this.supabase.channel(`item-editing:${organizationId}`, {
      config: { presence: { key: profileId } }
    });
    this.channel
      .on('presence', { event: 'sync' }, () => this.syncFromPresenceState())
      .subscribe();
  }

  private unsubscribe() {
    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.subscribedOrgId = null;
  }

  /** Rebuilds editingByItemId from the channel's own current presence
   *  state — a map keyed by presence key (this viewer's own id included),
   *  each entry an array of tracked payloads. Only the most recent tracked
   *  payload per key can ever matter (track() replaces, it doesn't append),
   *  so the last element is the only one read. */
  private syncFromPresenceState() {
    if (!this.channel) {
      return;
    }
    const state: RealtimePresenceState<ItemEditPresencePayload> = this.channel.presenceState<ItemEditPresencePayload>();
    const next = new Map<string, ItemEditor>();
    for (const presences of Object.values(state)) {
      const latest = presences[presences.length - 1];
      if (latest) {
        next.set(latest.itemId, { userId: latest.userId, name: latest.name, avatarKey: latest.avatarKey });
      }
    }
    this._editingByItemId.set(next);
  }

  /** Called by ModalTableComponent the moment it enters edit mode. */
  startEditing(itemId: string) {
    const profile = this.authService.profile();
    if (!this.channel || !profile) {
      return;
    }
    const payload: ItemEditPresencePayload = {
      itemId,
      userId: profile.id,
      name: profileDisplayName(profile),
      avatarKey: profile.avatar_key
    };
    void this.channel.track(payload);
  }

  /** Called by ModalTableComponent on Save, Cancel, or being destroyed
   *  (closing the item's detail view) — clears this viewer's own presence
   *  entry immediately rather than waiting on Presence's own disconnect-
   *  based cleanup, which only fires for a dropped connection, not a normal
   *  Cancel click. */
  stopEditing() {
    if (!this.channel) {
      return;
    }
    void this.channel.untrack();
  }

  /** The editor currently on this item, if any — null both when nobody's
   *  editing it and when the only "editor" is the caller's own session
   *  (no reason to show someone their own edit reflected back at them, same
   *  "no toast/flash for your own action" reasoning this app's realtime
   *  features already follow elsewhere). */
  editorFor(itemId: string): ItemEditor | null {
    const editor = this._editingByItemId().get(itemId);
    if (!editor || editor.userId === this.authService.profile()?.id) {
      return null;
    }
    return editor;
  }
}
