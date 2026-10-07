-- Extends the existing participants table. Existing rows and their IDs remain
-- intact; new participant IDs must match Supabase Auth user IDs.
begin;

alter table public.participants
  add column affiliation text,
  add column verification_status boolean not null default false,
  add column secondary_email text,
  add column education_history text,
  add column employment_history text,
  add constraint participants_affiliation_check check (
    affiliation in ('veteran', 'active-duty', 'reserve', 'Guard', 'spouse', 'base-staff')
  ),
  add constraint participants_secondary_email_length check (char_length(secondary_email) <= 254),
  add constraint participants_education_history_length check (char_length(education_history) <= 10000),
  add constraint participants_employment_history_length check (char_length(employment_history) <= 10000);

-- A client cannot self-verify, including through a direct API call that bypasses
-- the form. Future verification must use a trusted backend/database role.
create function public.protect_participant_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from auth.uid() then
      raise exception 'Participant ID must match the signed-in user' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      if new.verification_status is distinct from false then
        raise exception 'New profiles must be unverified' using errcode = '42501';
      end if;
      if new.affiliation is null or nullif(btrim(new.phone_number), '') is null then
        raise exception 'Affiliation and phone number are required for onboarding' using errcode = '23514';
      end if;
    elsif new.id is distinct from old.id or new.verification_status is distinct from old.verification_status then
      raise exception 'Participant identity and verification cannot be edited' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_participant_identity
before insert or update on public.participants
for each row execute function public.protect_participant_identity();

alter table public.participants enable row level security;

-- A restrictive policy intersects with every permissive policy, including the
-- development allow-all policy. This prevents that policy from exposing profiles
-- without deleting unknown policies owned by another feature. Browser clients
-- can access only their own profile; privileged backend roles retain access.
create policy "Participant ownership boundary"
on public.participants as restrictive for all to anon, authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Participants read own profile"
on public.participants for select to authenticated
using (id = (select auth.uid()));
create policy "Participants create own profile"
on public.participants for insert to authenticated
with check (id = (select auth.uid()) and verification_status = false);
create policy "Participants edit own profile"
on public.participants for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

grant select on public.participants to authenticated;
grant insert (id, first_name, last_name, email, phone_number, affiliation, verification_status)
  on public.participants to authenticated;
grant update (first_name, last_name, email, phone_number, affiliation, secondary_email,
  military_branch, rank, mos, service_start_date, service_end_date, education_level,
  education_history, employment_history) on public.participants to authenticated;

-- Uploads are private and use <auth-user-id>/<resumes|documents>/<unique-name>.
-- Storage owns the metadata; no public URLs or second database write are needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('participant-documents', 'participant-documents', false, 6291456,
  array['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png', 'image/jpeg']);

-- Scope the boundary to this bucket so unrelated workshop/other storage policies
-- keep their behavior. It also protects uploads if another broad policy exists.
create policy "Participant document ownership boundary"
on storage.objects as restrictive for all to anon, authenticated
using (
  bucket_id <> 'participant-documents' or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('resumes', 'documents')
    and exists (select 1 from public.participants p where p.id = (select auth.uid()))
  )
)
with check (
  bucket_id <> 'participant-documents' or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('resumes', 'documents')
    and exists (select 1 from public.participants p where p.id = (select auth.uid()))
  )
);

create policy "Participants read own documents"
on storage.objects for select to authenticated
using (bucket_id = 'participant-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Participants upload own documents"
on storage.objects for insert to authenticated
with check (bucket_id = 'participant-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
