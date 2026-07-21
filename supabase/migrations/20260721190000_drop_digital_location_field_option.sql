-- Digital location reverted to a plain free-text field; only category and
-- physical_location remain admin-managed dropdown fields.
delete from public.inventory_field_options where field_name = 'digital_location';

do $$
declare
  existing_constraint text;
begin
  select conname into existing_constraint
  from pg_constraint
  where conrelid = 'public.inventory_field_options'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%field_name%';

  if existing_constraint is not null then
    execute format('alter table public.inventory_field_options drop constraint %I', existing_constraint);
  end if;
end $$;

alter table public.inventory_field_options
  add constraint inventory_field_options_field_name_check
  check (field_name in ('category', 'physical_location'));
