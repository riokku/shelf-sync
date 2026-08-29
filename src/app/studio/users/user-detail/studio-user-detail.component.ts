import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggle, MatSlideToggleModule, MatSlideToggleChange } from '@angular/material/slide-toggle';
import { SupabaseService } from '../../../core/supabase.service';
import { AuthService, Profile } from '../../../core/auth.service';
import { NotificationService } from '../../../core/notification.service';
import { Database } from '../../../shared/models/database.types';
import { profileDisplayName } from '../../../shared/utils/profile-label';
import { isProfileOnline, formatLastSeen } from '../../../shared/utils/presence';
import { BreadcrumbParent, BreadcrumbsComponent } from '../../../shared/components/breadcrumbs/breadcrumbs.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { UserAvatarComponent } from '../../../shared/components/user-avatar/user-avatar.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LockUserAccountModalComponent } from '../../../shared/components/lock-user-account-modal/lock-user-account-modal.component';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];

/** A dedicated page for one person, reached via a `studio/users/:id` route
 *  from either StudioUsersComponent's own search results or a clickable
 *  member row on StudioOrgDetailComponent — the counterpart to that page for
 *  a person rather than an org, same "convert Studio's info drill-downs to
 *  a real page" shape that page's own doc comment describes (this is a
 *  second instance of that pattern, not the first — it never went through a
 *  popup phase itself). Everything here comes from tables a platform admin
 *  already has cross-org read on (profiles/organizations, see
 *  add_platform_admin) — profiles' own extra cross-org SELECT policy is
 *  what makes loading an arbitrary person's row (not just the caller's own
 *  org) work at all.
 *
 *  Also where a platform admin actually locks/unlocks this person's account
 *  (add_platform_account_lock) — a mat-slide-toggle rather than
 *  StudioOrgDetailComponent's own plain buttons, since a single boolean
 *  ("can this person use ShelfSync at all right now") reads more naturally
 *  as a toggle than an org's own three-state suspend/retire ladder does.
 *  Locking opens LockUserAccountModalComponent for a mandatory reason (same
 *  "consequential but reversible" shape SuspendOrganizationModalComponent
 *  already establishes); unlocking is a plain ConfirmDialogComponent, same
 *  asymmetry StudioOrgDetailComponent's own suspend/unsuspend pair already
 *  has. onLockToggleChange() reverts the toggle's own visual state
 *  synchronously before either dialog opens, rather than letting Material's
 *  own optimistic click-flip stand, and lockAccount()/unlockAccount() each
 *  set it again explicitly once their own RPC actually succeeds — both
 *  direct writes to the toggle instance itself (not left to the parent's
 *  own [checked]="isLocked" binding to notice the change and re-push it),
 *  since that indirect round-trip is what let the toggle drift out of sync
 *  with the real, already-committed lock state in practice.
 *
 *  The page header's own icon chip is this person's chosen avatar (see
 *  UserAvatarComponent, projected via PageHeaderComponent's [headerFigure]
 *  slot) rather than a fixed glyph — it used to also sit again, redundantly,
 *  inline with the meta list below; that duplicate copy is gone now. The
 *  breadcrumb trail gets an extra, genuinely linkable hop once the org has
 *  loaded (organizationBreadcrumbParent, via BreadcrumbsComponent's own
 *  secondaryParent input) — Home / Studio / Users / {org name} / {user
 *  name} — so this page always reads as belonging to a specific org, not
 *  just a specific person, without needing a second lookup to find out
 *  which. */
@Component({
  selector: 'app-studio-user-detail',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    BreadcrumbsComponent,
    PageHeaderComponent,
    EmptyStateComponent,
    UserAvatarComponent
  ],
  templateUrl: './studio-user-detail.component.html',
  styleUrl: './studio-user-detail.component.scss',
})
export class StudioUserDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private supabase = inject(SupabaseService).client;
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);
  protected authService = inject(AuthService);

  isLoading = true;
  loadError: string | null = null;
  notFound = false;

  profile: Profile | null = null;
  organization: OrganizationRow | null = null;
  /** Resolved separately from the profile above — the platform admin who
   *  locked this account is almost certainly a different person. */
  lockedByName: string | null = null;

  isActionPending = false;
  actionError: string | null = null;

  get isLocked(): boolean {
    return !!this.profile?.account_locked_at;
  }

  get isOnline(): boolean {
    return isProfileOnline(this.profile?.last_active_at ?? null);
  }

  get lastSeenLabel(): string {
    return formatLastSeen(this.profile?.last_active_at ?? null);
  }

  get displayName(): string {
    return this.profile ? profileDisplayName(this.profile) : '';
  }

  /** Backs the breadcrumb trail's own extra hop — Home / Studio / Users /
   *  {org name} / {user name} — once the org has loaded; null (rendering
   *  nothing) until then, same "no org known yet" gap StudioOrgDetailComponent's
   *  own suspendedByName has while its own load is still in flight. */
  get organizationBreadcrumbParent(): BreadcrumbParent | null {
    if (!this.organization) {
      return null;
    }
    return { label: this.organization.name, link: `/studio/organizations/${this.organization.id}` };
  }

  /** The signed-in platform admin can't lock their own account — mirrors
   *  platform_lock_user_account()'s own server-side guard; disabled here
   *  too so the toggle doesn't just bounce off an RPC error when clicked. */
  get isViewingOwnAccount(): boolean {
    return !!this.profile && this.profile.id === this.authService.profile()?.id;
  }

  async ngOnInit() {
    // Read once — a new navigation into this page from either
    // StudioUsersComponent or StudioOrgDetailComponent always recreates the
    // component regardless of Angular's default route-reuse behavior, same
    // reasoning StudioOrgDetailComponent's own identical ngOnInit comment
    // already gives.
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound = true;
      this.isLoading = false;
      return;
    }
    await this.loadUser(id);
  }

  retryLoad() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      void this.loadUser(id);
    }
  }

  private async loadUser(id: string) {
    this.isLoading = true;
    this.loadError = null;
    this.notFound = false;

    const { data: profile, error } = await this.supabase.from('profiles').select('*').eq('id', id).maybeSingle();

    if (error) {
      this.loadError = error.message;
      this.isLoading = false;
      return;
    }
    if (!profile) {
      this.notFound = true;
      this.isLoading = false;
      return;
    }
    this.profile = profile;

    const { data: organization } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('id', profile.organization_id)
      .maybeSingle();
    this.organization = organization;

    if (profile.account_locked_by) {
      const { data: locker } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', profile.account_locked_by)
        .maybeSingle();
      this.lockedByName = locker ? profileDisplayName(locker) : null;
    } else {
      this.lockedByName = null;
    }

    this.isLoading = false;
  }

  /** The toggle's own visual state is reverted synchronously here (rather
   *  than left to Material's optimistic click-flip) *and* re-synced
   *  explicitly on success below (lockAccount()/unlockAccount() both take
   *  the same `toggle` reference for that) — isLocked (also bound to
   *  [checked]) reflects the real state correctly either way, but setting
   *  `toggle.checked` directly here removes any dependency on that indirect
   *  parent-template-binding round-trip actually re-firing after the async
   *  RPC resolves, which is what let this drift out of sync with the real
   *  state in practice. */
  onLockToggleChange(event: MatSlideToggleChange) {
    const wantsLocked = event.checked;
    const toggle = event.source;
    toggle.checked = this.isLocked;

    if (wantsLocked) {
      this.lockAccount(toggle);
    } else {
      this.unlockAccount(toggle);
    }
  }

  private lockAccount(toggle: MatSlideToggle) {
    if (this.isActionPending || !this.profile) {
      return;
    }
    const profile = this.profile;
    const dialogRef = this.dialog.open(LockUserAccountModalComponent, {
      data: { userName: this.displayName },
      width: 'clamp(28rem, 50vw, 34rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe(async (reason?: string) => {
      if (!reason) {
        return;
      }
      this.isActionPending = true;
      this.actionError = null;

      const { error } = await this.supabase.rpc('platform_lock_user_account', { target_id: profile.id, reason });

      this.isActionPending = false;
      if (error) {
        this.actionError = error.message;
        return;
      }

      Object.assign(profile, { account_locked_at: new Date().toISOString(), account_locked_reason: reason });
      toggle.checked = true;
      this.lockedByName = 'you';
      this.notification.success('Account locked.');
    });
  }

  private unlockAccount(toggle: MatSlideToggle) {
    if (this.isActionPending || !this.profile) {
      return;
    }
    const profile = this.profile;
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Unlock this account?',
        message: `${this.displayName} will immediately regain access to ShelfSync.`,
        confirmLabel: 'Unlock account'
      },
      width: 'clamp(24rem, 40vw, 30rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe(async (confirmed?: boolean) => {
      if (!confirmed) {
        return;
      }
      this.isActionPending = true;
      this.actionError = null;

      const { error } = await this.supabase.rpc('platform_unlock_user_account', { target_id: profile.id });

      this.isActionPending = false;
      if (error) {
        this.actionError = error.message;
        return;
      }

      Object.assign(profile, { account_locked_at: null, account_locked_by: null, account_locked_reason: null });
      toggle.checked = false;
      this.lockedByName = null;
      this.notification.success('Account unlocked.');
    });
  }
}
