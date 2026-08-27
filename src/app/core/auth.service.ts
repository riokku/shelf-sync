import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { Database } from '../shared/models/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;

  private readonly _session = signal<Session | null>(null);
  readonly session = this._session.asReadonly();
  readonly isAuthenticated = computed(() => this._session() !== null);

  /** Populated asynchronously alongside `session` — same first-render lag
   *  caveat applies. Route guards should call `getProfile()` instead. */
  private readonly _profile = signal<Profile | null>(null);
  readonly profile = this._profile.asReadonly();
  readonly role = computed(() => this._profile()?.role ?? null);
  readonly canManage = computed(() => this.role() === 'admin' || this.role() === 'manager');
  readonly organizationId = computed(() => this._profile()?.organization_id ?? null);
  /** True only for the app's own maintainer, not any org's own admin — see
   *  platformAdminGuard/StudioComponent. Set once, manually, directly
   *  against the hosted project (see the add_platform_admin migration's
   *  own doc comment for why); nothing in this app ever writes it. */
  readonly isPlatformAdmin = computed(() => this._profile()?.is_platform_admin ?? false);

  /** Loaded alongside `profile` (same lifecycle: populated once the
   *  profile's own organization_id is known, cleared together on sign-out)
   *  rather than each caller querying `organizations` for itself — unlike
   *  this app's small per-page count badges (restock/pending-approvals),
   *  which do each load independently, this is core identity info tied
   *  directly to the signed-in profile, the same category `role`/
   *  `organizationId` above already are. Backs HeaderComponent's brand
   *  area (see its own template). */
  private readonly _organizationName = signal<string | null>(null);
  readonly organizationName = this._organizationName.asReadonly();

  constructor() {
    this.supabase.auth.getSession().then(({ data }) => {
      this._session.set(data.session);
      this.loadProfile(data.session);
      this.syncHeartbeat(data.session);
    });
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._session.set(session);
      this.loadProfile(session);
      this.syncHeartbeat(session);
    });
  }

  // How often the heartbeat below touches last_active_at while a session is
  // open — see shared/utils/presence.ts's ONLINE_THRESHOLD_MS for the
  // (comfortably wider) staleness window the read side tolerates before
  // considering a user offline.
  private static readonly HEARTBEAT_INTERVAL_MS = 60_000;
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;

  /** Starts/stops the heartbeat to match whether a session now exists —
   *  called from both getSession() and onAuthStateChange above so this
   *  covers a session already active on load as well as one starting or
   *  ending afterward, without duplicating the start/stop logic at each
   *  call site. */
  private syncHeartbeat(session: Session | null) {
    if (session) {
      this.startHeartbeat(session.user.id);
    } else {
      this.stopHeartbeat();
    }
  }

  private startHeartbeat(userId: string) {
    // Clears any previous interval first rather than checking "already
    // running" — onAuthStateChange fires on more than just sign-in (e.g. a
    // token refresh), and if the user changed (switching accounts in the
    // same tab) the old interval would otherwise keep touching the wrong
    // profile alongside the new one.
    this.stopHeartbeat();
    void this.touchLastActive(userId);
    this.heartbeatIntervalId = setInterval(() => void this.touchLastActive(userId), AuthService.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatIntervalId !== null) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  /** Best-effort — a missed heartbeat just means this user's last_active_at
   *  reads slightly stale until the next tick; nothing worth surfacing or
   *  retrying for what's ultimately a cosmetic presence indicator. */
  private async touchLastActive(userId: string): Promise<void> {
    await this.supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', userId);
  }

  private async loadProfile(session: Session | null) {
    if (!session) {
      this._profile.set(null);
      this._organizationName.set(null);
      return;
    }
    const { data } = await this.supabase.from('profiles').select('*').eq('id', session.user.id).single();
    this._profile.set(data);

    if (!data) {
      this._organizationName.set(null);
      return;
    }
    const { data: org } = await this.supabase.from('organizations').select('name').eq('id', data.organization_id).single();
    this._organizationName.set(org?.name ?? null);
  }

  /** Reads the current session directly, for use in route guards (avoids
   *  races with the signal above, which only updates once the initial
   *  getSession() call in the constructor resolves). */
  async getSession(): Promise<Session | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session;
  }

  /** Fetches the caller's own profile directly, for use in route guards and
   *  anywhere else that can't rely on the `profile` signal having settled. */
  async getProfile(): Promise<Profile | null> {
    const session = await this.getSession();
    if (!session) {
      return null;
    }
    const { data } = await this.supabase.from('profiles').select('*').eq('id', session.user.id).single();
    return data;
  }

  /** Re-fetches the caller's profile and updates the `profile` signal — for
   *  self-service edits (e.g. picking an avatar on the Account page) so the
   *  change shows up immediately anywhere else in the app that reads the
   *  signal, without waiting for the next auth state change. */
  async refreshProfile(): Promise<void> {
    const session = await this.getSession();
    await this.loadProfile(session);
  }

  /** `captchaToken` is optional only in the type sense — LoginComponent
   *  always has a real one by the time this is reachable (its Turnstile
   *  widget gates the submit button itself). Supabase's own captcha
   *  protection is turned on for the hosted project (Auth > Attack
   *  Protection dashboard setting — see CLAUDE.md), so an `undefined` here
   *  isn't actually a supported path in production; the type stays optional
   *  mainly so a test can call this without needing a real token. */
  async signIn(email: string, password: string, captchaToken?: string) {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
    return error;
  }

  /** Returns `needsEmailConfirmation: true` when signup succeeded but Supabase
   *  didn't hand back a session — i.e. email confirmation is required before
   *  the account can log in. `fullName`/`nickname`/organization fields land in
   *  `raw_user_meta_data` and are consumed by the `handle_new_user` trigger,
   *  which either creates a new organization (caller becomes its admin) or
   *  joins an existing one via `organization.inviteOrganizationId` (caller
   *  becomes staff). */
  async signUp(
    email: string,
    password: string,
    fullName: string,
    nickname: string,
    organization: { organizationName: string } | { inviteOrganizationId: string },
    captchaToken?: string
  ) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          nickname,
          ...('organizationName' in organization
            ? { organization_name: organization.organizationName }
            : { invite_organization_id: organization.inviteOrganizationId })
        },
        captchaToken
      }
    });
    return { error, needsEmailConfirmation: !error && !data.session };
  }

  /** Resolves an invite link's org slug to `{ id, name }` pre-signup.
   *  `organizations` is readable by `anon`, so this works before auth. */
  async resolveOrganizationBySlug(slug: string) {
    const { data } = await this.supabase.from('organizations').select('id, name').eq('slug', slug).maybeSingle();
    return data;
  }

  async signOut() {
    // One last touch before the session actually ends, so "last seen"
    // reads as fresh as possible right away rather than up to
    // HEARTBEAT_INTERVAL_MS stale until whatever the last tick happened to
    // catch.
    const session = await this.getSession();
    if (session) {
      await this.touchLastActive(session.user.id);
    }
    this.stopHeartbeat();
    await this.supabase.auth.signOut();
  }

  /** Sends a password-recovery email whose link lands on `/reset-password`
   *  with a Supabase-issued recovery token in the URL — supabase-js's
   *  `detectSessionInUrl` (on by default) picks that up into a real, if
   *  short-lived, session before `ResetPasswordComponent` ever calls
   *  `getSession()`. Deliberately reports success even when the email isn't
   *  registered (the caller can't distinguish either way — see
   *  ForgotPasswordComponent) so this can't be used to enumerate accounts. */
  async requestPasswordReset(email: string, captchaToken?: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken
    });
    return error;
  }

  /** Only succeeds with the short-lived recovery session a password-reset
   *  link establishes (or any other currently-signed-in session) —
   *  ResetPasswordComponent is responsible for checking `getSession()`
   *  first and not offering this form at all otherwise. */
  async updatePassword(password: string) {
    const { error } = await this.supabase.auth.updateUser({ password });
    return error;
  }
}
