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

  constructor() {
    this.supabase.auth.getSession().then(({ data }) => {
      this._session.set(data.session);
      this.loadProfile(data.session);
    });
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._session.set(session);
      this.loadProfile(session);
    });
  }

  private async loadProfile(session: Session | null) {
    if (!session) {
      this._profile.set(null);
      return;
    }
    const { data } = await this.supabase.from('profiles').select('*').eq('id', session.user.id).single();
    this._profile.set(data);
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

  async signIn(email: string, password: string) {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
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
    organization: { organizationName: string } | { inviteOrganizationId: string }
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
        }
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
    await this.supabase.auth.signOut();
  }
}
