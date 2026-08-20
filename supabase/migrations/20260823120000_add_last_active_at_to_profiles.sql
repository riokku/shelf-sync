-- Tracks when a user was last seen active in the app, updated periodically
-- by a client-side heartbeat (AuthService) while a session is open. Backs
-- Manage > Team's "online now" pulsing indicator / "last seen" text: a
-- profile whose last_active_at falls within a short rolling window (see
-- shared/utils/presence.ts) reads as online, otherwise its last_active_at
-- is shown as a relative "last seen" time. Nullable, no backfill — an
-- existing row simply reads as "Never signed in" until that user's next
-- sign-in after this ships.
--
-- Purely cosmetic and self-service, same reasoning full_name/nickname/
-- avatar_key already have (see add_avatar_to_profiles.sql's own note):
-- "Users can update their own profile" (create_profiles.sql) already scopes
-- UPDATE to auth.uid() = id at the row level, so extending the column-level
-- grant below is enough — no SECURITY DEFINER RPC needed, since (unlike
-- profiles.role/membership_status) there's no privilege distinction to
-- protect here. A user resetting their own last_active_at to some arbitrary
-- value is a harmless cosmetic curiosity (spoofing your own presence to
-- teammates), not a privilege-escalation concern.
alter table public.profiles add column last_active_at timestamptz;

grant update (email, full_name, nickname, avatar_key, last_active_at) on public.profiles to authenticated;
