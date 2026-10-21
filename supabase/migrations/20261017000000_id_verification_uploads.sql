-- Lets a signed-in participant submit an ID photo for verification.
-- Run this once in the VTS project before using the Verify button.
begin;

-- document_image_url stores the ID photo's path inside the private
-- participant-documents bucket (not a public URL). The table already has this
-- column, so no schema change is needed here, only security rules.

-- Participants can read their own submissions and create new *pending* ones.
-- They cannot set verified/rejected, so only a trusted role can review.
alter table public.id_verifications enable row level security;

drop policy if exists "Participants read own id verifications" on public.id_verifications;
create policy "Participants read own id verifications"
on public.id_verifications for select to authenticated
using (participant_id = (select auth.uid()));

drop policy if exists "Participants submit own id verifications" on public.id_verifications;
create policy "Participants submit own id verifications"
on public.id_verifications for insert to authenticated
with check (participant_id = (select auth.uid()) and verification_status = 'pending');

grant select on public.id_verifications to authenticated;
grant insert (participant_id, verification_status, document_type, document_image_url)
  on public.id_verifications to authenticated;

-- Same ownership boundary as before, with one extra allowed folder for ID photos.
drop policy if exists "Participant document ownership boundary" on storage.objects;
create policy "Participant document ownership boundary"
on storage.objects as restrictive for all to anon, authenticated
using (
  bucket_id <> 'participant-documents' or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('resumes', 'documents', 'id-verification')
    and exists (select 1 from public.participants p where p.id = (select auth.uid()))
  )
)
with check (
  bucket_id <> 'participant-documents' or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('resumes', 'documents', 'id-verification')
    and exists (select 1 from public.participants p where p.id = (select auth.uid()))
  )
);

commit;
