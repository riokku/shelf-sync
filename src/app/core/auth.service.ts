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

  async signIn(email: string, password: string) {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    return error;
  }

  /** Returns `needsEmailConfirmation: true` when signup succeeded but Supabase
   *  didn't hand back a session — i.e. email confirmation is required before
   *  the account can log in. `fullName`/`nickname` land in `raw_user_meta_data`
   *  and are copied onto the new `profiles` row by the `handle_new_user` trigger. */
  async signUp(email: string, password: string, fullName: string, nickname: string) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, nickname } }
    });
    return { error, needsEmailConfirmation: !error && !data.session };
  }

  async signOut() {
    await this.supabase.auth.signOut();
  }
}
