-- Lets any user pick one of 8 preset avatars for their own profile (Account
-- page). Purely cosmetic and self-service, same shape as full_name/nickname:
-- "Users can update their own profile" (create_profiles.sql) already scopes
-- UPDATE to auth.uid() = id at the row level, so extending the column-level
-- grant below is enough — no SECURITY DEFINER RPC needed, since (unlike
-- profiles.role) there's no privilege distinction to protect between roles.
alter table public.profiles add column avatar_key text
  constraint profiles_avatar_key_check check (avatar_key is null or avatar_key in (
    'sunrise', 'ocean', 'forest', 'berry', 'lavender', 'ember', 'sky', 'stone'
  ));

grant update (email, full_name, nickname, avatar_key) on public.profiles to authenticated;
