-- Closes the column-scoping gap create_tasks.sql originally flagged and
-- add_task_transfers.sql only partly addressed: "Assignees can update their
-- own tasks" grants a plain assignee (not admin/manager) write access to
-- every column in the authenticated role's column grant (title, description,
-- status, due_date, related_item_name) for any task assigned to them, even
-- though the only UI that exercises this (TaskDetailModalComponent.saveStatus())
-- ever touches is status. RLS can't restrict by column (same limitation
-- noted throughout these migrations), so — same shape as
-- request_task_transfer() et al. — the fix is dropping the assignee's raw
-- UPDATE policy entirely and replacing it with a narrow SECURITY DEFINER
-- RPC that only ever writes status.
--
-- Admins/managers keep their existing full-row "Admins and managers can
-- update any task" policy untouched (no UI uses it for anything but status
-- today either, but unlike a plain assignee they're already a fully trusted
-- role for their own org, matching inventory_items' precedent).
drop policy "Assignees can update their own tasks" on public.tasks;

-- Callable by the task's current assignee, or an admin/manager (mirrors
-- canManageTransfer() client-side and the two existing UPDATE policies).
-- Named new_status (not status) to avoid any ambiguity with the tasks.status
-- column inside this function body, same reasoning request_task_transfer()
-- used target_id instead of assigned_to.
create or replace function public.update_task_status(task_id uuid, new_status public.task_status)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or public.current_user_org_id() is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.assigned_to != auth.uid() and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only the assignee (or an admin/manager) can update this task''s status';
  end if;

  update public.tasks set status = new_status where id = task_id;
end;
$$;

grant execute on function public.update_task_status(uuid, public.task_status) to authenticated;
