create type public.task_status as enum ('todo', 'in_progress', 'done');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status public.task_status not null default 'todo',
  assigned_to uuid references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create trigger set_tasks_updated_at
  before update on public.tasks
  for each row
  execute function public.set_updated_at();

create policy "Admins and managers can view all tasks"
  on public.tasks for select
  to authenticated
  using (public.current_user_role() in ('admin', 'manager'));

create policy "Users can view tasks assigned to or created by them"
  on public.tasks for select
  to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid());

create policy "Admins and managers can create tasks for anyone"
  on public.tasks for insert
  to authenticated
  with check (public.current_user_role() in ('admin', 'manager'));

create policy "Staff can create tasks for themselves"
  on public.tasks for insert
  to authenticated
  with check (
    public.current_user_role() = 'staff'
    and created_by = auth.uid()
    and assigned_to = auth.uid()
  );

create policy "Admins and managers can update any task"
  on public.tasks for update
  to authenticated
  using (public.current_user_role() in ('admin', 'manager'))
  with check (public.current_user_role() in ('admin', 'manager'));

create policy "Assignees can update their own tasks"
  on public.tasks for update
  to authenticated
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

create policy "Admins and managers can delete tasks"
  on public.tasks for delete
  to authenticated
  using (public.current_user_role() in ('admin', 'manager'));

-- NOTE: "Assignees can update their own tasks" currently permits editing any
-- column (title, due_date, reassignment, etc.), not just status. Narrowing
-- that to status-only updates has the same column-grant limitation noted in
-- the other migrations — revisit with a dedicated RPC if it matters before
-- a real task-editing UI exists.
