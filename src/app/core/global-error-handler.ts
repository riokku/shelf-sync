import { ErrorHandler, Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';

/** Catches every uncaught exception (component/template errors, rejected
 *  promises Angular's zone surfaces, etc.) app-wide and fire-and-forgets it
 *  to the client_error_log table via log_client_error() — see that
 *  migration's own doc comment for why this is a Supabase RPC rather than a
 *  third-party error-tracking service. Registered as the ErrorHandler
 *  provider in AppModule so it replaces (not supplements) Angular's default
 *  console-only handler; still console.errors first so local dev behavior
 *  is unchanged. */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private supabase = inject(SupabaseService).client;

  handleError(error: unknown): void {
    // Preserves Angular's default (console-only) visibility during dev.
    console.error(error);

    const { message, stack } = normalizeError(error);

    // Fire-and-forget: logging the error must never itself throw or block
    // on a signed-out user's next action. log_client_error() also swallows
    // its own failures server-side for the same reason (see migration).
    this.supabase
      .rpc('log_client_error', {
        p_message: message,
        p_stack: stack,
        p_url: window.location.href,
        p_user_agent: navigator.userAgent,
        p_app_env: environment.production ? 'production' : 'development'
      })
      .then(() => undefined, () => undefined);
  }
}

/** Angular can hand handleError() anything a component/template/promise
 *  threw — a real Error, a string, or occasionally some other thrown
 *  value — so this normalizes all of those into a plain message/stack pair
 *  rather than assuming an Error instance. `stack` is `undefined` (not
 *  `null`) when there isn't one, matching log_client_error()'s generated
 *  RPC arg type (an optional param, not a nullable one). */
function normalizeError(error: unknown): { message: string; stack: string | undefined } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack };
  }
  if (typeof error === 'string') {
    return { message: error, stack: undefined };
  }
  try {
    return { message: JSON.stringify(error), stack: undefined };
  } catch {
    return { message: String(error), stack: undefined };
  }
}
