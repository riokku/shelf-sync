-- Same gap as require_approved_task_transfer_target.sql, one layer earlier:
-- "Admins and managers can create tasks for anyone" checked role and
-- organization scoping on the new row, but never who assigned_to actually
-- was — an admin/manager could create a task pre-assigned straight to a
-- pending join request (who can't see or act on it, same as a transferred
-- task would've been) or, since assigned_to only had to be *some*
-- profiles.id with no organization check at all, to a profile in a
-- different organization entirely.
drop policy "Admins and managers can create tasks for anyone" on public.tasks;
create policy "Admins and managers can create tasks for anyone"
  on public.tasks for insert
  to authenticated
  with check (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
    and (
      assigned_to is null
      or exists (
        select 1 from public.profiles p
        where p.id = assigned_to
          and p.organization_id = public.current_user_org_id()
          and p.membership_status = 'approved'
      )
    )
  );
