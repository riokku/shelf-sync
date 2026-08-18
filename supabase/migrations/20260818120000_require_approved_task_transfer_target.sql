-- request_task_transfer() only checked that the target profile belonged to
-- the caller's organization, not that they were an approved member of it —
-- a pending join request (add_member_approval.sql) is a real profiles row
-- with organization_id set, so it passed that check. That let a task get
-- handed off to someone who can't yet see or act on it (current_user_org_id()
-- returns null for a pending caller, so they'd fail every org-scoped check
-- the moment they tried to accept/decline), and would jump straight to full
-- access to it the instant an admin approved them, bypassing the approval
-- gate the feature exists to enforce.
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
  if v_task is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.assigned_to != auth.uid() and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only the current assignee (or an admin/manager) can transfer this task';
  end if;

  select * into v_target from public.profiles where id = target_id;
  if v_target is null or v_target.organization_id != public.current_user_org_id() then
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
