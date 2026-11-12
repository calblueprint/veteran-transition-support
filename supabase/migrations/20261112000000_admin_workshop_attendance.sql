-- Admin attendance is written only through an explicitly authorized RPC.
-- Participant registration/cancellation remains available through RLS.
begin;

-- The existing public.attendance_status enum already contains registered,
-- attended, no_show, and cancelled; no enum or check-constraint change is needed.

-- Membership is provisioned by trusted database/backend roles, never clients.
alter table public.admin_users enable row level security;
create policy "Attendance admin membership insert boundary"
  on public.admin_users as restrictive for insert to anon, authenticated
  with check (false);
create policy "Attendance admin membership update boundary"
  on public.admin_users as restrictive for update to anon, authenticated
  using (false) with check (false);
create policy "Attendance admin membership delete boundary"
  on public.admin_users as restrictive for delete to anon, authenticated
  using (false);

alter table public.registrations enable row level security;
create policy "Anonymous registration boundary"
  on public.registrations as restrictive for all to anon
  using (false) with check (false);
create policy "Registration read boundary"
  on public.registrations as restrictive for select to authenticated
  using (participant_id = (select auth.uid()) or exists (
    select 1 from public.admin_users where id = (select auth.uid())
  ));
create policy "Registration insert boundary"
  on public.registrations as restrictive for insert to authenticated
  with check (participant_id = (select auth.uid()));
create policy "Registration update boundary"
  on public.registrations as restrictive for update to authenticated
  using (participant_id = (select auth.uid()))
  with check (participant_id = (select auth.uid()));
create policy "Registration delete boundary"
  on public.registrations as restrictive for delete to authenticated
  using (false);
-- Preserve registration reads used by the existing admin participant detail.
create policy "Admins read registrations"
  on public.registrations for select to authenticated
  using (exists (select 1 from public.admin_users where id = (select auth.uid())));
create policy "Participants read registrations"
  on public.registrations for select to authenticated
  using (participant_id = (select auth.uid()));
create policy "Participants create registrations"
  on public.registrations for insert to authenticated
  with check (participant_id = (select auth.uid()));
create policy "Participants cancel registrations"
  on public.registrations for update to authenticated
  using (participant_id = (select auth.uid()))
  with check (participant_id = (select auth.uid()));
grant select, insert, update on public.registrations to authenticated;

create function public.protect_registration_attendance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- SECURITY INVOKER is intentional: definer RPCs and backend jobs keep their
  -- trusted role, while direct browser writes cannot forge attendance.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then
      raise exception using errcode = '42501', message = 'Registration history cannot be deleted.';
    end if;
    if new.participant_id is distinct from auth.uid() then
      raise exception using errcode = '42501', message = 'Registration must belong to the signed-in participant.';
    end if;
    if tg_op = 'INSERT' then
      if new.attendance_status is not null and new.attendance_status <> 'registered' then
        raise exception using errcode = '42501', message = 'Only admins can record attendance.';
      end if;
    else
      if new.id is distinct from old.id
         or new.participant_id is distinct from old.participant_id
         or new.workshop_id is distinct from old.workshop_id
         or new.registration_date is distinct from old.registration_date then
        raise exception using errcode = '42501', message = 'Registration identity cannot be edited.';
      end if;
      if new.attendance_status is distinct from old.attendance_status
         and not (coalesce(old.attendance_status, 'registered') = 'registered'
                  and new.attendance_status is not distinct from 'cancelled') then
        raise exception using errcode = '42501', message = 'Only admins can record or change attendance.';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_registration_attendance() from public, anon, authenticated;
create trigger protect_registration_attendance
  before insert or update or delete on public.registrations
  for each row execute function public.protect_registration_attendance();

-- Return the complete roster in one snapshot. JSON aggregation avoids the
-- PostgREST row cap; no broad participant-profile read policy is required.
create function public.admin_workshop_attendance(target_workshop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;
  select jsonb_build_object(
    'workshop', jsonb_build_object('id', w.id, 'name', w.name, 'start_date', w.start_date,
      'end_date', w.end_date, 'location', w.location, 'capacity', w.capacity),
    'registrants', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'participant_id', r.participant_id, 'first_name', p.first_name,
      'last_name', p.last_name, 'attendance_status', r.attendance_status,
      'registration_date', r.registration_date
    ) order by p.last_name, p.first_name, r.registration_date, r.id)
      from public.registrations r left join public.participants p on p.id = r.participant_id
      where r.workshop_id = w.id), '[]'::jsonb)
  ) into result from public.workshops w where w.id = target_workshop_id;
  return result;
end;
$$;
revoke all on function public.admin_workshop_attendance(uuid) from public, anon;
grant execute on function public.admin_workshop_attendance(uuid) to authenticated;

create function public.admin_mark_workshop_attendance(
  target_workshop_id uuid,
  target_registration_id uuid,
  new_status text,
  expected_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;
  if new_status is null or new_status not in ('registered', 'attended', 'no_show') then
    raise exception using errcode = '22023', message = 'Invalid attendance status.';
  end if;
  select attendance_status into current_status from public.registrations
    where id = target_registration_id and workshop_id = target_workshop_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Registration not found.';
  end if;
  if current_status = 'cancelled' or current_status is distinct from expected_status then
    raise exception using errcode = 'P1004', message = 'Registration changed. Refresh the roster and try again.';
  end if;
  update public.registrations set attendance_status = new_status::public.attendance_status
    where id = target_registration_id and workshop_id = target_workshop_id;
end;
$$;
revoke all on function public.admin_mark_workshop_attendance(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_mark_workshop_attendance(uuid, uuid, text, text) to authenticated;

commit;
