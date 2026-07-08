import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;

  private readonly _session = signal<Session | null>(null);
  readonly session = this._session.asReadonly();
  readonly isAuthenticated = computed(() => this._session() !== null);

  constructor() {
    this.supabase.auth.getSession().then(({ data }) => this._session.set(data.session));
    this.supabase.auth.onAuthStateChange((_event, session) => this._session.set(session));
  }

  /** Reads the current session directly, for use in route guards (avoids
   *  races with the signal above, which only updates once the initial
   *  getSession() call in the constructor resolves). */
  async getSession(): Promise<Session | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session;
  }

  async signIn(email: string, password: string) {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    return error;
  }

  /** Returns `needsEmailConfirmation: true` when signup succeeded but Supabase
   *  didn't hand back a session — i.e. email confirmation is required before
   *  the account can log in. */
  async signUp(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signUp({ email, password });
    return { error, needsEmailConfirmation: !error && !data.session };
  }

  async signOut() {
    await this.supabase.auth.signOut();
  }
}
