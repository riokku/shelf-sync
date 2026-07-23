-- Invite links (/register?org=<slug>) resolve a specific organization before
-- signup, so — unlike the general pre-login case — there IS a known org to
-- brand for. Add a separate anon-only policy (not touching the existing
-- authenticated, own-org-only policy) so the register page can show that
-- org's logo. Theme/logo aren't sensitive data — this mirrors the original
-- pre-multi-tenant design where site_settings was anon-readable outright.
create policy "Anyone can view site settings"
  on public.site_settings for select
  to anon
  using (true);
