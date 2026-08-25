import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/realtime-js';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Database } from '../shared/models/database.types';
import { UserNotification } from '../shared/models/notification.model';
import { subscribeToTableChanges } from '../shared/utils/realtime';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

/** Most recent notifications shown in HeaderComponent's bell dropdown —
 *  enough to browse without pagination, matching this app's other
 *  small-list badges rather than a full history view. */
const NOTIFICATION_LIST_LIMIT = 30;

function toUserNotification(row: NotificationRow): UserNotification {
  return {
    id: row.id,
    kind: row.kind,
    message: row.message,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at
  };
}

/** Backs HeaderComponent's bell dropdown — the unread count badge and the
 *  list itself. Root-provided (like AuthService/SiteSettingsService) rather
 *  than scoped to HeaderComponent, so its state survives HeaderComponent
 *  never actually being destroyed/recreated across navigation anyway, and
 *  so a future second consumer (e.g. a full "all notifications" page)
 *  could read the same signals without re-fetching.
 *
 *  Loads/subscribes and clears/unsubscribes purely off `authService.session`
 *  via `effect()`, the same reactive-to-session-changes shape
 *  HeaderComponent's own constructor already uses for its badge counts —
 *  not DestroyRef, since this is a root singleton with no real "destroy"
 *  during the app's lifetime, unlike a routed page component.
 *
 *  Subscribes to the `notifications` table via subscribeToTableChanges() —
 *  see that helper's own doc comment for why one channel per *page
 *  component* is normally enough in this single-router-outlet SPA; this is
 *  the one deliberate exception, since a root service (not a routed page)
 *  needs to stay subscribed for as long as a session exists, independent of
 *  whatever page happens to be mounted. No client-side user_id filter on
 *  the subscription, same "trust RLS alone" reasoning every other
 *  subscription in this app already follows — notifications' own SELECT
 *  policy (user_id = auth.uid()) already scopes delivery to just this
 *  user's own rows. */
@Injectable({ providedIn: 'root' })
export class NotificationCenterService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);

  private readonly _notifications = signal<UserNotification[]>([]);
  readonly notifications = this._notifications.asReadonly();
  readonly unreadCount = computed(() => this._notifications().filter(n => n.readAt === null).length);

  private channel: RealtimeChannel | null = null;

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        void this.load();
        this.subscribe();
      } else {
        this._notifications.set([]);
        this.unsubscribe();
      }
    });
  }

  private async load() {
    const { data } = await this.supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(NOTIFICATION_LIST_LIMIT);
    this._notifications.set((data ?? []).map(toUserNotification));
  }

  private subscribe() {
    if (this.channel) {
      return;
    }
    this.channel = subscribeToTableChanges(this.supabase, 'notifications', payload => {
      if (payload.eventType === 'INSERT') {
        this._notifications.update(list => [toUserNotification(payload.new), ...list].slice(0, NOTIFICATION_LIST_LIMIT));
      } else if (payload.eventType === 'UPDATE') {
        const updated = toUserNotification(payload.new);
        this._notifications.update(list => list.map(n => n.id === updated.id ? updated : n));
      } else {
        const removedId = payload.old.id;
        if (removedId) {
          this._notifications.update(list => list.filter(n => n.id !== removedId));
        }
      }
    });
  }

  private unsubscribe() {
    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  /** Optimistic — updates locally first so the badge/row reflects the click
   *  immediately, same pattern this app otherwise reserves for toggles
   *  rather than data mutations, justified here since this is a low-stakes,
   *  narrowly-scoped self-service update (mirrors profiles.last_active_at's
   *  own reasoning) where waiting on a round-trip would just make the
   *  dropdown feel laggy for no real benefit. */
  async markAsRead(id: string) {
    const alreadyRead = this._notifications().find(n => n.id === id)?.readAt !== null;
    if (alreadyRead) {
      return;
    }
    const now = new Date().toISOString();
    this._notifications.update(list => list.map(n => n.id === id ? { ...n, readAt: now } : n));
    await this.supabase.from('notifications').update({ read_at: now }).eq('id', id);
  }

  async markAllAsRead() {
    const unreadIds = this._notifications().filter(n => n.readAt === null).map(n => n.id);
    if (unreadIds.length === 0) {
      return;
    }
    const now = new Date().toISOString();
    this._notifications.update(list => list.map(n => unreadIds.includes(n.id) ? { ...n, readAt: now } : n));
    await this.supabase.from('notifications').update({ read_at: now }).in('id', unreadIds);
  }
}
