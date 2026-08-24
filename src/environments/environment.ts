export const environment = {
  production: false,
  supabaseUrl: 'https://ailqjqjrzhzspofoslpa.supabase.co',
  supabaseAnonKey: 'sb_publishable_TQGjim7HxESW-PQwX4slYw_m-ONzeEa',
  // The real Cloudflare Turnstile site key (public, safe to commit — see
  // CLAUDE.md's Turnstile paragraph). Dev and prod share one Turnstile
  // widget, same as they already share one Supabase project, so this value
  // is identical in environment.prod.ts. The matching *secret* key never
  // goes in this repo at all — it's pasted directly into Supabase's Auth >
  // Attack Protection dashboard setting, which is what actually turns
  // captcha enforcement on; until that's done, this real key still renders
  // and gates the form correctly but doesn't provide real bot protection.
  turnstileSiteKey: '0x4AAAAAAEam0AH1M1kDoJci',
};
