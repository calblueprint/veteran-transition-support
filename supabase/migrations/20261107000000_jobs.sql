-- Membership is provisioned by trusted staff through Supabase.
create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_users enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.admin_users from public, anon, authenticated;

-- Check only the current caller. No client needs to enumerate admin accounts.
create function public.can_manage_jobs() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_users where id = (select auth.uid()));
$$;
revoke all on function public.can_manage_jobs() from public, anon;
grant execute on function public.can_manage_jobs() to authenticated;

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  company text not null check (btrim(company) <> ''),
  location text not null check (btrim(location) <> ''),
  description text not null check (btrim(description) <> ''),
  apply_link text not null check (apply_link ~* '^https?://[^/[:space:]?#]+[^[:space:]]*$'),
  created_at timestamptz not null default now()
);
alter table public.jobs enable row level security;
-- Supabase projects can have broad default table privileges, including truncate.
revoke all on public.jobs from public, anon, authenticated;
grant select, delete on public.jobs to authenticated;
grant insert (title, company, location, description, apply_link),
      update (title, company, location, description, apply_link) on public.jobs to authenticated;
create policy jobs_read on public.jobs for select to authenticated using (true);
create policy jobs_create on public.jobs for insert to authenticated
  with check ((select public.can_manage_jobs()));
create policy jobs_edit on public.jobs for update to authenticated
  using ((select public.can_manage_jobs())) with check ((select public.can_manage_jobs()));
create policy jobs_delete on public.jobs for delete to authenticated
  using ((select public.can_manage_jobs()));
