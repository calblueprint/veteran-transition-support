-- Group workshops into series (for example, a multi-session certification).
-- Everyone signed in can read series; only admins can create or edit them.
begin;

create table public.workshop_series (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  description text,
  created_at timestamptz not null default now()
);

-- Deleting a series would leave its workshops standalone instead of failing.
alter table public.workshops
  add column series_id uuid references public.workshop_series (id) on delete set null;

create index workshops_series_id_idx on public.workshops (series_id);

alter table public.workshop_series enable row level security;

create policy "Signed-in users read series"
  on public.workshop_series for select
  to authenticated
  using (true);

create policy "Admins create series"
  on public.workshop_series for insert
  to authenticated
  with check (
    exists (select 1 from public.admin_users a where a.id = (select auth.uid()))
  );

create policy "Admins edit series"
  on public.workshop_series for update
  to authenticated
  using (
    exists (select 1 from public.admin_users a where a.id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.admin_users a where a.id = (select auth.uid()))
  );

commit;
