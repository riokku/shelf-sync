import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseService } from '../core/supabase.service';
import { AuthService, Profile } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../shared/components/empty-state/empty-state.component';
import { UserAvatarComponent } from '../shared/components/user-avatar/user-avatar.component';
import { ConfirmDialogComponent } from '../shared/components/confirm-dialog/confirm-dialog.component';
import { BroadcastModalComponent, BroadcastModalData } from '../shared/components/broadcast-modal/broadcast-modal.component';
import { Broadcast } from '../shared/models/broadcast.model';
import { deleteBroadcast, loadBroadcasts } from '../shared/utils/broadcasts';
import { subscribeToTableChanges } from '../shared/utils/realtime';
import { FlashTracker } from '../shared/utils/flash-tracker';
import { flashAndAnnounceChanges } from '../shared/utils/realtime-announce';
import { flashAndScrollToHighlighted } from '../shared/utils/highlight-row';
import { debounce } from '../shared/utils/debounce';

/** /broadcasts — org-wide announcements. approvedGuard only, not manageGuard
 *  (same tier as manage/reservations, see that route's own comment): every
 *  approved org member can read the feed, but posting one is gated to
 *  admin/manager both here (the "New broadcast" button, @if (authService.canManage()))
 *  and server-side (create_broadcast() itself — see the add_broadcasts
 *  migration). Editing/deleting an existing post is narrower still: only
 *  its own author, enforced purely by RLS (created_by = auth.uid()), so
 *  canEdit() below is a UX nicety (hiding buttons that would just fail) —
 *  never the actual access check. */
@Component({
  selector: 'app-broadcasts',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    RouterLink,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent,
    UserAvatarComponent
  ],
  templateUrl: './broadcasts.component.html',
  styleUrl: './broadcasts.component.scss',
})
export class BroadcastsComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  protected authService = inject(AuthService);
  private notification = inject(NotificationService);
  private dialog = inject(MatDialog);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private liveAnnouncer = inject(LiveAnnouncer);

  isLoading = true;
  /** Repeat-count for the loading-state skeleton cards — see
   *  InventoryComponent.skeletonCards' own identical doc comment. */
  readonly skeletonRows = [1, 2, 3];
  /** Set when loadBroadcastsList()'s own query fails — see InventoryComponent's
   *  identical loadError field for the full reasoning. */
  loadError: string | null = null;
  deleteError: string | null = null;

  private profiles: Profile[] = [];
  private allItems: { id: string; name: string }[] = [];
  broadcasts: Broadcast[] = [];

  // Which cards should currently show the brief "someone else just posted/
  // edited this" pulse — see ManageReservationsComponent's own identical
  // flashTracker/pendingFlashIds/debouncedReload trio for the full
  // reasoning; this page mirrors it exactly.
  private flashTracker = new FlashTracker();
  private pendingFlashIds = new Set<string>();
  private readonly debouncedReloadBroadcasts = debounce(() => void this.reloadAndFlashChangedBroadcasts(), 300);

  /** Approved org members only — a pending join request can't see this page
   *  yet, so referencing one wouldn't mean anything (same filter
   *  ManageTasksComponent's own approvedAssignableProfiles applies). */
  get approvedProfiles(): Profile[] {
    return this.profiles.filter(profile => profile.membership_status === 'approved');
  }

  async ngOnInit() {
    const [{ data: profiles }, { data: items }] = await Promise.all([
      this.supabase.from('profiles').select('*').eq('organization_id', this.authService.organizationId()!).order('full_name'),
      this.supabase.from('inventory_items').select('id, name').order('name')
    ]);

    this.profiles = profiles ?? [];
    this.allItems = items ?? [];
    await this.loadBroadcastsList();
    this.isLoading = false;

    // Landed here from the command palette's own "Broadcasts" result (see
    // CommandPaletteService) — same ?highlight= + flashTracker/
    // .realtime-flash stand-in ManageOrdersComponent's own identical call
    // already uses, since this page has no per-broadcast deep link either.
    flashAndScrollToHighlighted(
      this.route.snapshot.queryParamMap.get('highlight'),
      this.broadcasts.map(broadcast => broadcast.id),
      id => `broadcast-${id}`,
      this.flashTracker
    );

    // Live updates from other users/tabs — someone else posting, editing, or
    // deleting a broadcast shows up here without a manual reload. Reuses
    // loadBroadcastsList() itself (debounced), same "full reload rather
    // than a single-row patch" reasoning ManageOrdersComponent's own
    // identical subscription already uses.
    const channel = subscribeToTableChanges(this.supabase, 'broadcasts', payload => {
      if (payload.eventType !== 'DELETE' && payload.new.id) {
        this.pendingFlashIds.add(payload.new.id);
      }
      this.debouncedReloadBroadcasts();
    });
    this.destroyRef.onDestroy(() => {
      this.debouncedReloadBroadcasts.cancel();
      this.flashTracker.clear();
      void this.supabase.removeChannel(channel);
    });
  }

  isFlashing(broadcastId: string): boolean {
    return this.flashTracker.isFlashing(broadcastId);
  }

  private async reloadAndFlashChangedBroadcasts() {
    await this.loadBroadcastsList();
    flashAndAnnounceChanges(
      this.pendingFlashIds,
      this.flashTracker,
      this.liveAnnouncer,
      id => this.broadcasts.find(broadcast => broadcast.id === id)?.title ?? null,
      title => `${title} updated`
    );
    this.pendingFlashIds.clear();
  }

  /** Re-runs loadBroadcastsList() after a failed load — the Retry button's
   *  handler (see the template's own loadError branch). A failed
   *  *background* refresh (e.g. after the realtime subscription above fires)
   *  leaves whatever was already loaded in place rather than clearing it —
   *  same "don't lose what the user was already looking at" reasoning
   *  ManageTeamComponent's own loadError paragraph in CLAUDE.md describes. */
  retryLoad() {
    void this.loadBroadcastsList();
  }

  private async loadBroadcastsList() {
    const itemNamesById = new Map(this.allItems.map(item => [item.id, item.name]));
    const { broadcasts, error } = await loadBroadcasts(this.supabase, this.profiles, itemNamesById);
    if (error) {
      this.loadError = error;
      return;
    }
    this.loadError = null;
    this.broadcasts = broadcasts;
  }

  /** Only the author sees Edit/Delete on their own post — a UX nicety, not
   *  the real access check (see this component's own doc comment above). */
  canEdit(broadcast: Broadcast): boolean {
    const userId = this.authService.profile()?.id;
    return !!userId && broadcast.createdById === userId;
  }

  private openBroadcastForm(broadcast?: Broadcast) {
    const data: BroadcastModalData = {
      profiles: this.approvedProfiles,
      items: this.allItems,
      broadcast
    };
    const dialogRef = this.dialog.open(BroadcastModalComponent, {
      data,
      width: 'clamp(28rem, 50vw, 36rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((saved: boolean | undefined) => {
      if (!saved) {
        return;
      }
      // The realtime subscription above will also pick this up and reload,
      // but not reliably before this callback runs — reloading here too
      // means the acting user sees their own change immediately rather than
      // waiting on the debounce.
      void this.loadBroadcastsList();
      this.notification.success(broadcast ? 'Broadcast updated' : 'Broadcast posted');
    });
  }

  newBroadcast() {
    this.openBroadcastForm();
  }

  editBroadcast(broadcast: Broadcast) {
    this.openBroadcastForm(broadcast);
  }

  removeBroadcast(broadcast: Broadcast) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete broadcast?',
        message: `Delete "${broadcast.title}"? This can't be undone.`,
        confirmLabel: 'Delete',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(async confirmed => {
      if (!confirmed) {
        return;
      }
      this.deleteError = null;
      const error = await deleteBroadcast(this.supabase, broadcast.id);
      if (error) {
        this.deleteError = error;
        return;
      }
      await this.loadBroadcastsList();
      this.notification.success('Broadcast deleted');
    });
  }
}
