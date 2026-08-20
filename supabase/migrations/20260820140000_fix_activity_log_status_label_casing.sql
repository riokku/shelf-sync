-- Cosmetic fix: update_task_status() (added in 20260820130000_add_activity_log.sql)
-- wrote "In Progress" for its activity_log message, but TASK_STATUS_LABELS
-- (shared/models/task-status.ts), the single source of truth this same
-- wording should match everywhere else in the app, uses "In progress".
create or replace function public.update_task_status(task_id uuid, new_status public.task_status)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_status_label text;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or public.current_user_org_id() is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.assigned_to != auth.uid() and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only the assignee (or an admin/manager) can update this task''s status';
  end if;

  update public.tasks set status = new_status where id = task_id;

  v_status_label := case new_status
    when 'todo' then 'To do'
    when 'in_progress' then 'In progress'
    when 'done' then 'Done'
  end;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_task.organization_id, auth.uid(), 'task', task_id, format('Marked "%s" as %s', v_task.title, v_status_label));
end;
$$;
