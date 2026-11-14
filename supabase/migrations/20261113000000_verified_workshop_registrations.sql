-- Issue #48: require verified participants for workshop registrations, and
-- permit only the owner to cancel their own active registration.
-- Requires 20261020000000_workshop_review_fixes.sql (capacity/active index).
-- Does not replace the existing capacity trigger or erase cancelled history.
begin;

-- A trigger is necessary: UI checks and permissive RLS policies alone cannot
-- stop a direct PostgREST insert. Run before the capacity trigger by name.
create function public.require_verified_workshop_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  needs_verification boolean := false;
begin
  if tg_op = 'INSERT' then
    needs_verification := true;
  elsif new.attendance_status is distinct from 'cancelled'
    and (new.participant_id is distinct from old.participant_id
         or new.workshop_id is distinct from old.workshop_id
         or old.attendance_status is not distinct from 'cancelled') then
    needs_verification := true;
  end if;

  if needs_verification and not exists (
    select 1 from public.participants
    where id = new.participant_id and verification_status is true
  ) then
    raise exception using errcode = 'P1004',
      message = 'A verified participant profile is required to register.';
  end if;
  return new;
end;
$$;

revoke execute on function public.require_verified_workshop_registration()
  from public, anon, authenticated;

-- Keep direct clients from inserting on behalf of another participant even
-- when an older environment still has a permissive registration policy.
-- Restrictive policies intersect with existing permissive policies.
create policy "Registration insert ownership boundary"
on public.registrations as restrictive for insert to anon, authenticated
with check (participant_id = (select auth.uid()));

create trigger a_require_verified_workshop_registration
before insert or update of participant_id, workshop_id, attendance_status
on public.registrations
for each row execute function public.require_verified_workshop_registration();

-- Protect identity even when RLS has not been enabled in a legacy database.
-- Keep this trigger SECURITY INVOKER so current_user is the calling API role.
create function public.protect_workshop_registration_insert_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.participant_id is distinct from auth.uid() then
    raise exception using errcode = '42501',
      message = 'You may register only your own participant profile.';
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_workshop_registration_insert_identity()
  from public, anon, authenticated;

create trigger protect_workshop_registration_insert_identity
before insert on public.registrations
for each row execute function public.protect_workshop_registration_insert_identity();

-- Allow a participant to cancel, not reassign/reactivate/edit a registration.
-- This guard also covers development databases with permissive legacy policies.
-- Privileged staff/service-role database actions remain unaffected.
create function public.protect_participant_registration_cancellation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if old.participant_id is distinct from auth.uid()
       or old.attendance_status is not distinct from 'cancelled'
       or new.attendance_status is distinct from 'cancelled'
       or (to_jsonb(new) - 'attendance_status')
          is distinct from (to_jsonb(old) - 'attendance_status') then
      raise exception using errcode = '42501',
        message = 'Only your own active registration may be cancelled.';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_participant_registration_cancellation()
  from public, anon, authenticated;

create trigger protect_participant_registration_cancellation
before update on public.registrations
for each row execute function public.protect_participant_registration_cancellation();

-- The app updates exactly this column. Existing SELECT/INSERT access and
-- administrative/service-role permissions are otherwise preserved.
grant update (attendance_status) on public.registrations to authenticated;

create policy "Participants cancel own active workshop registrations"
on public.registrations for update to authenticated
using (
  participant_id = (select auth.uid())
  and attendance_status is distinct from 'cancelled'
)
with check (
  participant_id = (select auth.uid())
  and attendance_status = 'cancelled'
);

commit;
