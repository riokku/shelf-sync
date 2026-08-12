-- Task transfers: anyone (not just admin/manager) can hand a task off to
-- someone else, but it doesn't leave the sender's queue until the recipient
-- accepts. pending_transfer_to is the proposed new assignee; assigned_to
-- itself only ever changes via accept_task_transfer() below.
alter table public.tasks
  add column pending_transfer_to uuid references public.profiles (id) on delete set null;

-- The recipient needs to see a task pending transfer to them even though
-- they're neither its assignee nor its creator yet.
drop policy "Users can view tasks assigned to or created by them" on public.tasks;
create policy "Users can view tasks assigned to, created by, or pending transfer to them"
  on public.tasks for select
  to authenticated
  using (
    (assigned_to = auth.uid() or created_by = auth.uid() or pending_transfer_to = auth.uid())
    and organization_id = public.current_user_org_id()
  );

-- assigned_to/pending_transfer_to are pulled out of the ordinary column
-- grant (same technique as profiles.role in create_profiles) so no UPDATE —
-- from an assignee, an admin/manager, anyone — can move a task into someone
-- else's queue directly. The four RPCs below are the only way either column
-- changes, and accept_task_transfer() is the only one that ever touches
-- assigned_to, which is what actually enforces "must accept". This also
-- resolves the column-scoping gap the original create_tasks migration
-- flagged ("Assignees can update their own tasks... permits editing any
-- column... revisit with a dedicated RPC if it matters before a real
-- task-editing UI exists") — this is that UI.
revoke update on public.tasks from authenticated;
grant update (title, description, status, due_date, related_item_name)
  on public.tasks to authenticated;

-- Callable by the task's current assignee, or an admin/manager (mirrors who
-- can already update a task via the two existing UPDATE policies). Replaces
-- any transfer already pending for this task rather than stacking them —
-- there's only ever one recipient in flight at a time.
create or replace function public.request_task_transfer(task_id uuid, target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_target_org uuid;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.assigned_to != auth.uid() and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only the current assignee (or an admin/manager) can transfer this task';
  end if;

  select organization_id into v_target_org from public.profiles where id = target_id;
  if v_target_org is null or v_target_org != public.current_user_org_id() then
    raise exception 'target user not found in your organization';
  end if;

  if target_id = v_task.assigned_to then
    raise exception 'task is already assigned to that person';
  end if;

  update public.tasks set pending_transfer_to = target_id where id = task_id;
end;
$$;

grant execute on function public.request_task_transfer(uuid, uuid) to authenticated;

-- Lets the sender (or an admin/manager) retract a transfer before the
-- recipient responds to it.
create or replace function public.cancel_task_transfer(task_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.assigned_to != auth.uid() and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only the current assignee (or an admin/manager) can cancel this transfer';
  end if;

  update public.tasks set pending_transfer_to = null where id = task_id;
end;
$$;

grant execute on function public.cancel_task_transfer(uuid) to authenticated;

-- The only place assigned_to is ever written outside of task creation.
create or replace function public.accept_task_transfer(task_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.pending_transfer_to is null or v_task.pending_transfer_to != auth.uid() then
    raise exception 'no pending transfer to you for this task';
  end if;

  update public.tasks
    set assigned_to = auth.uid(), pending_transfer_to = null
    where id = task_id;
end;
$$;

grant execute on function public.accept_task_transfer(uuid) to authenticated;

-- Recipient turns the transfer down; the task stays put with its current
-- assignee, same as if it had never been offered.
create or replace function public.decline_task_transfer(task_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.pending_transfer_to is null or v_task.pending_transfer_to != auth.uid() then
    raise exception 'no pending transfer to you for this task';
  end if;

  update public.tasks set pending_transfer_to = null where id = task_id;
end;
$$;

grant execute on function public.decline_task_transfer(uuid) to authenticated;
