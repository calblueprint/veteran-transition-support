-- Minimal pre-migration schema for isolated PostgreSQL policy tests. This is
-- deliberately not a Supabase baseline migration or a substitute for live API QA.
create role anon;
create role authenticated;
create schema auth;
create schema storage;
grant usage on schema public, auth, storage to anon, authenticated;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;
create type public.military_branch as enum ('army', 'navy', 'air_force', 'marines', 'coast_guard', 'space_force');
create type public.education_level as enum ('high_school', 'some_college', 'associates', 'bachelors', 'masters', 'doctorate');
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  first_name varchar not null,
  last_name varchar not null,
  email varchar not null,
  phone_number varchar,
  military_branch public.military_branch,
  rank varchar,
  mos varchar,
  service_start_date date,
  service_end_date date,
  education_level public.education_level,
  resume_url varchar,
  duplicate_of_participant_id uuid references public.participants(id),
  created_at timestamp not null default now()
);
create table storage.buckets (id text primary key, name text not null, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null);
alter table public.participants enable row level security;
alter table storage.objects enable row level security;
grant all on public.participants, storage.objects to anon, authenticated;
create policy "DEV allow all - participants" on public.participants for all to public using (true) with check (true);
-- Deliberately include a broad storage policy to ensure the new restrictive
-- boundary cannot be bypassed by policies introduced elsewhere in the project.
create policy "Existing broad storage policy" on storage.objects for all to public using (true) with check (true);
insert into public.participants (id, first_name, last_name, email)
values ('99999999-9999-4999-8999-999999999999', 'Legacy', 'Participant', 'legacy@example.com');
insert into storage.buckets (id, name, public) values ('unrelated', 'unrelated', false);
