-- Add nickname alongside full_name, captured at signup like full_name already is.
alter table public.profiles add column nickname text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, nickname)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'nickname');
  return new;
end;
$$;

grant update (email, full_name, nickname) on public.profiles to authenticated;
