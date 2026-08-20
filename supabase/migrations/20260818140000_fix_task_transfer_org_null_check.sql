-- Security fix: the previous migration (require_approved_task_transfer_target)
-- did a full `create or replace` of request_task_transfer() to add the
-- target-approval check, and in doing so silently dropped the
-- `public.current_user_org_id() is null or` null-safety guard that
-- fix_org_isolation_bugs.sql had specifically added to this function three
-- days earlier. current_user_org_id() legitimately returns null for a
-- caller whose own org is soft-deleted (or who is pending approval); in
-- PL/pgSQL `uuid != null` is null, and `if null then` does not raise — so
-- both org-ownership checks below were failing *open* again for exactly the
-- callers that fix existed to reject, letting e.g. an admin of a
-- soft-deleted org tamper with a task belonging to a completely unrelated,
-- active organization. Restores the guard on both checks; matches
-- cancel_task_transfer/accept_task_transfer/decline_task_transfer, which
-- were untouched by the regressing migration and still have it.
create or replace function public.request_task_transfer(task_id uuid, target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_target public.profiles;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or public.current_user_org_id() is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.assigned_to != auth.uid() and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only the current assignee (or an admin/manager) can transfer this task';
  end if;

  select * into v_target from public.profiles where id = target_id;
  if v_target is null or public.current_user_org_id() is null or v_target.organization_id != public.current_user_org_id() then
    raise exception 'target user not found in your organization';
  end if;

  if v_target.membership_status != 'approved' then
    raise exception 'target user has not been approved to join this organization yet';
  end if;

  if target_id = v_task.assigned_to then
    raise exception 'task is already assigned to that person';
  end if;

  update public.tasks set pending_transfer_to = target_id where id = task_id;
end;
$$;
