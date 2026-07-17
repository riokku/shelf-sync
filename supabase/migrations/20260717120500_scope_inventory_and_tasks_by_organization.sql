-- Give inventory_items and tasks a tenant boundary. Default to the caller's
-- own org so existing insert code (ManageComponent, create-task-modal, etc.)
-- doesn't need to change to start populating this column.
alter table public.inventory_items
  add column organization_id uuid references public.organizations (id)
  default public.current_user_org_id();

update public.inventory_items
  set organization_id = (select id from public.organizations where slug = 'legacy-organization')
  where organization_id is null;

alter table public.inventory_items
  alter column organization_id set not null;

alter table public.tasks
  add column organization_id uuid references public.organizations (id)
  default public.current_user_org_id();

update public.tasks
  set organization_id = (select id from public.organizations where slug = 'legacy-organization')
  where organization_id is null;

alter table public.tasks
  alter column organization_id set not null;

-- inventory_items: AND organization scoping into every existing policy.
drop policy "Authenticated users can view inventory items" on public.inventory_items;
create policy "Authenticated users can view inventory items"
  on public.inventory_items for select
  to authenticated
  using (organization_id = public.current_user_org_id());

drop policy "Admins and managers can insert inventory items" on public.inventory_items;
create policy "Admins and managers can insert inventory items"
  on public.inventory_items for insert
  to authenticated
  with check (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

drop policy "Authenticated users can update inventory items" on public.inventory_items;
create policy "Authenticated users can update inventory items"
  on public.inventory_items for update
  to authenticated
  using (organization_id = public.current_user_org_id())
  with check (organization_id = public.current_user_org_id());

drop policy "Admins and managers can delete inventory items" on public.inventory_items;
create policy "Admins and managers can delete inventory items"
  on public.inventory_items for delete
  to authenticated
  using (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

-- tasks: AND organization scoping into every existing policy.
drop policy "Admins and managers can view all tasks" on public.tasks;
create policy "Admins and managers can view all tasks"
  on public.tasks for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

drop policy "Users can view tasks assigned to or created by them" on public.tasks;
create policy "Users can view tasks assigned to or created by them"
  on public.tasks for select
  to authenticated
  using (
    (assigned_to = auth.uid() or created_by = auth.uid())
    and organization_id = public.current_user_org_id()
  );

drop policy "Admins and managers can create tasks for anyone" on public.tasks;
create policy "Admins and managers can create tasks for anyone"
  on public.tasks for insert
  to authenticated
  with check (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

drop policy "Staff can create tasks for themselves" on public.tasks;
create policy "Staff can create tasks for themselves"
  on public.tasks for insert
  to authenticated
  with check (
    public.current_user_role() = 'staff'
    and created_by = auth.uid()
    and assigned_to = auth.uid()
    and organization_id = public.current_user_org_id()
  );

drop policy "Admins and managers can update any task" on public.tasks;
create policy "Admins and managers can update any task"
  on public.tasks for update
  to authenticated
  using (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  )
  with check (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

drop policy "Assignees can update their own tasks" on public.tasks;
create policy "Assignees can update their own tasks"
  on public.tasks for update
  to authenticated
  using (assigned_to = auth.uid() and organization_id = public.current_user_org_id())
  with check (assigned_to = auth.uid() and organization_id = public.current_user_org_id());

drop policy "Admins and managers can delete tasks" on public.tasks;
create policy "Admins and managers can delete tasks"
  on public.tasks for delete
  to authenticated
  using (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

-- inventory_item_images / inventory_item_activity have no owner column of
-- their own; scope via their parent inventory_items row instead of
-- denormalizing a second organization_id column onto each.
drop policy "Authenticated users can view inventory item images" on public.inventory_item_images;
create policy "Authenticated users can view inventory item images"
  on public.inventory_item_images for select
  to authenticated
  using (exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_images.item_id
      and i.organization_id = public.current_user_org_id()
  ));

drop policy "Admins and managers can insert inventory item images" on public.inventory_item_images;
create policy "Admins and managers can insert inventory item images"
  on public.inventory_item_images for insert
  to authenticated
  with check (
    public.current_user_role() in ('admin', 'manager')
    and exists (
      select 1 from public.inventory_items i
      where i.id = inventory_item_images.item_id
        and i.organization_id = public.current_user_org_id()
    )
  );

drop policy "Admins and managers can delete inventory item images" on public.inventory_item_images;
create policy "Admins and managers can delete inventory item images"
  on public.inventory_item_images for delete
  to authenticated
  using (
    public.current_user_role() in ('admin', 'manager')
    and exists (
      select 1 from public.inventory_items i
      where i.id = inventory_item_images.item_id
        and i.organization_id = public.current_user_org_id()
    )
  );

drop policy "Authenticated users can view inventory item activity" on public.inventory_item_activity;
create policy "Authenticated users can view inventory item activity"
  on public.inventory_item_activity for select
  to authenticated
  using (exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_activity.item_id
      and i.organization_id = public.current_user_org_id()
  ));

drop policy "Authenticated users can log their own inventory item activity" on public.inventory_item_activity;
create policy "Authenticated users can log their own inventory item activity"
  on public.inventory_item_activity for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.inventory_items i
      where i.id = inventory_item_activity.item_id
        and i.organization_id = public.current_user_org_id()
    )
  );
