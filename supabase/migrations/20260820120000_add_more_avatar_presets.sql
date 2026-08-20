-- Widens the original 8-shape avatar set (add_avatar_to_profiles) with 4
-- "people" and 3 "animal" options — same purely-cosmetic, self-service
-- column, no RLS/grant changes needed. A check constraint can't be altered
-- in place, so this drops and recreates it with the expanded key list; see
-- shared/models/avatar-preset.ts for the matching client-side list.
alter table public.profiles drop constraint profiles_avatar_key_check;

alter table public.profiles add constraint profiles_avatar_key_check check (avatar_key is null or avatar_key in (
  'sunrise', 'ocean', 'forest', 'berry', 'lavender', 'ember', 'sky', 'stone',
  'smiley', 'face', 'wanderer', 'buddy',
  'paws', 'bunny', 'ladybug'
));
