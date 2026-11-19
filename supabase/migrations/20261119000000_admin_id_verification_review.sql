begin;

alter table public.id_verifications
  add column reviewed_by uuid references public.admin_users(id),
  add column reviewed_at timestamptz,
  add column rejection_reason text;

-- Membership is managed by trusted database roles, never by browser clients.
alter table public.admin_users enable row level security;
create policy "Block client admin enrollment" on public.admin_users
  as restrictive for insert to anon, authenticated with check (false);
create policy "Block client admin changes" on public.admin_users
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "Block client admin deletion" on public.admin_users
  as restrictive for delete to anon, authenticated using (false);
create policy "Read own admin membership" on public.admin_users
  for select to authenticated using (id = (select auth.uid()));
grant select (id) on public.admin_users to authenticated;

create function public.is_verification_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admin_users where id = (select auth.uid()));
$$;
revoke all on function public.is_verification_admin() from public, anon;
grant execute on function public.is_verification_admin() to anon, authenticated;

-- Restrictive policies also constrain any pre-existing permissive DEV policies.
create policy "ID submission read boundary" on public.id_verifications
  as restrictive for select to anon, authenticated
  using (participant_id = (select auth.uid()));
create policy "ID submission insert boundary" on public.id_verifications
  as restrictive for insert to anon, authenticated
  with check (
    participant_id = (select auth.uid()) and verification_status = 'pending'
    and reviewed_by is null and reviewed_at is null and rejection_reason is null
    and (storage.foldername(document_image_url))[1] = (select auth.uid())::text
    and (storage.foldername(document_image_url))[2] = 'id-verification'
    and exists (
      select 1 from storage.objects o where o.bucket_id = 'participant-documents'
        and o.name = document_image_url
    )
  );
create policy "ID reviews require function" on public.id_verifications
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "ID history cannot be deleted by clients" on public.id_verifications
  as restrictive for delete to anon, authenticated using (false);

-- Serialize submissions per participant, including requests from multiple tabs.
create function public.guard_id_submission()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare already_verified boolean;
begin
  select verification_status into already_verified from public.participants
    where id = new.participant_id for update;
  if not found or already_verified then
    raise exception 'Only unverified participants can submit an ID.' using errcode = '23514';
  end if;
  if exists (select 1 from public.id_verifications
    where participant_id = new.participant_id and verification_status in ('pending', 'manual_review')) then
    raise exception 'An ID submission is already pending.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_id_submission() from public, anon, authenticated;
create trigger guard_id_submission before insert on public.id_verifications
  for each row execute function public.guard_id_submission();

-- Return only the fields needed for review; do not broaden profile read access.
create function public.pending_id_verifications()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_verification_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(item order by created_at, id) from (
    select v.id, v.created_at, jsonb_build_object(
      'id', v.id, 'participant_id', v.participant_id,
      'first_name', p.first_name, 'last_name', p.last_name,
      'affiliation', p.affiliation, 'created_at', v.created_at,
      'document_image_url', v.document_image_url
    ) as item
    from public.id_verifications v join public.participants p on p.id = v.participant_id
    where v.verification_status in ('pending', 'manual_review')
  ) submissions), '[]'::jsonb);
end;
$$;

create function public.review_id_verification(
  submission_id uuid, decision text, reason text default null
)
returns void language plpgsql security definer set search_path = ''
as $$
declare submission public.id_verifications%rowtype;
begin
  if not public.is_verification_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if decision is null or decision not in ('approve', 'reject') then
    raise exception 'Choose approve or reject.' using errcode = '22023';
  end if;
  reason := nullif(regexp_replace(reason, '^\s+|\s+$', '', 'g'), '');
  if decision = 'reject' and (reason is null or char_length(reason) > 2000) then
    raise exception 'A rejection reason of 1–2000 characters is required.' using errcode = '22023';
  end if;
  -- Match the submission trigger's lock order. Review and resubmission are atomic.
  perform 1 from public.participants where id = (
    select participant_id from public.id_verifications where id = submission_id
  ) for update;
  select * into submission from public.id_verifications where id = submission_id for update;
  if not found then
    raise exception 'Submission not found.' using errcode = 'P0002';
  end if;
  if submission.verification_status is null or submission.verification_status not in ('pending', 'manual_review') then
    raise exception 'This submission has already been reviewed.' using errcode = '23514';
  end if;
  if decision = 'approve' then
    update public.id_verifications set verification_status = 'verified',
      reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
      where id = submission_id;
    update public.participants set verification_status = true where id = submission.participant_id;
  else
    update public.id_verifications set verification_status = 'failed',
      reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = reason
      where id = submission_id;
  end if;
end;
$$;
revoke all on function public.pending_id_verifications() from public, anon;
revoke all on function public.review_id_verification(uuid, text, text) from public, anon;
grant execute on function public.pending_id_verifications() to authenticated;
grant execute on function public.review_id_verification(uuid, text, text) to authenticated;

-- Split the old ALL boundary so admin read access never grants write/delete access.
drop policy "Participant document ownership boundary" on storage.objects;
create policy "Participant document read boundary" on storage.objects
as restrictive for select to anon, authenticated using (
  bucket_id <> 'participant-documents' or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('resumes', 'documents', 'id-verification')
    and exists (select 1 from public.participants p where p.id = (select auth.uid()))
  ) or (
    (storage.foldername(name))[2] = 'id-verification'
    and (select public.is_verification_admin())
  )
);
create policy "Admins read ID photos" on storage.objects for select to authenticated
using (bucket_id = 'participant-documents'
  and (storage.foldername(name))[2] = 'id-verification'
  and (select public.is_verification_admin()));

create policy "Participant document insert boundary" on storage.objects
as restrictive for insert to anon, authenticated with check (
  bucket_id <> 'participant-documents' or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('resumes', 'documents', 'id-verification')
    and exists (select 1 from public.participants p where p.id = (select auth.uid()))
  )
);
create policy "Participant document update boundary" on storage.objects
as restrictive for update to anon, authenticated using (
  bucket_id <> 'participant-documents' or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('resumes', 'documents', 'id-verification')
    and exists (select 1 from public.participants p where p.id = (select auth.uid()))
  )
) with check (
  bucket_id <> 'participant-documents' or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('resumes', 'documents', 'id-verification')
    and exists (select 1 from public.participants p where p.id = (select auth.uid()))
  )
);
create policy "Participant document delete boundary" on storage.objects
as restrictive for delete to anon, authenticated using (
  bucket_id <> 'participant-documents' or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('resumes', 'documents', 'id-verification')
    and exists (select 1 from public.participants p where p.id = (select auth.uid()))
  )
);

commit;
