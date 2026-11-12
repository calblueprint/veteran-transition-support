-- Match the existing VTS registration schema, including its permissive DEV
-- policy, so the migration is tested against the boundary it must harden.
create type public.attendance_status as enum ('registered', 'attended', 'no_show', 'cancelled');
create table public.admin_users (id uuid primary key, email varchar, name varchar);
alter table public.admin_users enable row level security;
grant select, insert, update, delete on public.admin_users to anon, authenticated;
create policy "Users can read own admin membership" on public.admin_users for select to authenticated using (id = auth.uid());
create table public.workshops (
  id uuid primary key default gen_random_uuid(), name varchar not null,
  description varchar, start_date date, end_date date, capacity integer, location varchar
);
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references public.participants(id),
  workshop_id uuid references public.workshops(id),
  registration_date date default current_date,
  attendance_status public.attendance_status default 'registered'
);
alter table public.registrations enable row level security;
grant all on public.registrations to anon, authenticated;
grant select on public.workshops to anon, authenticated;
create policy "DEV allow all - registrations" on public.registrations for all to public using (true) with check (true);
