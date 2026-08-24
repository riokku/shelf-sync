export const environment = {
  production: false,
  supabaseUrl: 'https://ailqjqjrzhzspofoslpa.supabase.co',
  supabaseAnonKey: 'sb_publishable_TQGjim7HxESW-PQwX4slYw_m-ONzeEa',
  // TODO: swap for the real Cloudflare Turnstile site key once one exists
  // (Cloudflare dashboard > Turnstile > Add site — a single widget can list
  // both the production hostname and `localhost`, so dev and prod can share
  // one key, same as they already share one Supabase project). This is
  // Cloudflare's own published "always passes" test key — safe to commit,
  // but provides zero actual bot protection; see CLAUDE.md's Turnstile
  // paragraph. The matching secret key, pasted into Supabase's Auth >
  // Attack Protection settings, is what actually turns captcha enforcement
  // on — until that's done, this key being real or fake makes no
  // difference either way.
  turnstileSiteKey: '1x00000000000000000000AA',
};
