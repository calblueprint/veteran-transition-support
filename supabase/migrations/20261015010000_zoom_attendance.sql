begin;

alter table public.registrations
  add column attendance_duration_minutes numeric(10, 2),
  add column attendance_zoom_meeting_uuid text,
  add column attendance_synced_at timestamptz,
  add constraint registrations_attendance_duration_nonnegative
    check (attendance_duration_minutes >= 0 and attendance_duration_minutes <> 'NaN'::numeric),
  add constraint registrations_attendance_provenance
    check (
      (attendance_duration_minutes is null and attendance_zoom_meeting_uuid is null and attendance_synced_at is null)
      or
      (attendance_duration_minutes is not null and nullif(btrim(attendance_zoom_meeting_uuid), '') is not null and attendance_synced_at is not null)
    );

comment on column public.registrations.attendance_duration_minutes is
  'Minutes present in one Zoom meeting instance, rounded to 2 decimals. NULL means not verified; overlapping sessions count once.';

-- Existing development policies may allow broad writes. Attendance is server-owned.
create function public.protect_registration_attendance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.attendance_duration_minutes is not null
      or new.attendance_zoom_meeting_uuid is not null
      or new.attendance_synced_at is not null then
      raise exception 'Attendance can only be set by the attendance importer.';
    end if;
  elsif new.attendance_duration_minutes is distinct from old.attendance_duration_minutes
    or new.attendance_zoom_meeting_uuid is distinct from old.attendance_zoom_meeting_uuid
    or new.attendance_synced_at is distinct from old.attendance_synced_at
    or (old.attendance_synced_at is not null and (
      new.id is distinct from old.id
      or new.participant_id is distinct from old.participant_id
      or new.workshop_id is distinct from old.workshop_id
    )) then
    raise exception 'Attendance can only be changed by the attendance importer.';
  end if;
  return new;
end;
$$;

create trigger protect_registration_attendance
before insert or update on public.registrations
for each row execute function public.protect_registration_attendance();

revoke execute on function public.protect_registration_attendance() from public, anon, authenticated;

-- One transaction covers matching, conflict checks, and every registration update.
-- This is an invoker function, available only to the trusted service role.
create function public.sync_zoom_attendance(
  p_workshop_id uuid,
  p_meeting_uuid text,
  p_attendance jsonb,
  p_apply boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workshop_name text;
  attendance record;
  registration_ids uuid[];
  matched jsonb := '[]'::jsonb;
  unmatched jsonb := '[]'::jsonb;
  ambiguous jsonb := '[]'::jsonb;
begin
  if p_meeting_uuid is null or btrim(p_meeting_uuid) = ''
    or p_meeting_uuid <> btrim(p_meeting_uuid) or p_meeting_uuid ~ '^[0-9]+$' then
    raise exception 'A Zoom meeting instance UUID is required, not a meeting number.';
  end if;
  if p_attendance is null or jsonb_typeof(p_attendance) <> 'array' then
    raise exception 'Attendance must be an array.';
  end if;

  -- Serialize imports for a workshop, including concurrent reports for different instances.
  select w.name into workshop_name from public.workshops w
    where w.id = p_workshop_id for no key update;
  if not found then
    raise exception 'Workshop not found.';
  end if;
  perform r.id from public.registrations r
    where r.workshop_id = p_workshop_id for update;
  perform p.id from public.participants p
    where p.id in (select r.participant_id from public.registrations r where r.workshop_id = p_workshop_id)
    for share;

  if exists (
    select 1 from public.registrations r where r.workshop_id = p_workshop_id
      and r.attendance_zoom_meeting_uuid is not null
      and r.attendance_zoom_meeting_uuid <> p_meeting_uuid
  ) then
    raise exception 'This workshop already has attendance from another Zoom meeting instance.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_attendance) item
    where jsonb_typeof(item) <> 'object'
      or coalesce(jsonb_typeof(item->'email'), '') <> 'string'
      or btrim(item->>'email') = ''
      or coalesce(jsonb_typeof(item->'attendance_duration_minutes'), '') <> 'number'
  ) then
    raise exception 'Each attendance entry needs an email and a numeric duration.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_attendance) item
    group by lower(btrim(item->>'email')) having count(*) > 1
  ) then
    raise exception 'Combine sessions into one duration per email before importing.';
  end if;

  for attendance in
    select lower(btrim(item->>'email')) as email,
      (item->>'attendance_duration_minutes')::numeric as minutes
    from jsonb_array_elements(p_attendance) item
  loop
    if attendance.minutes < 0 or attendance.minutes > 99999999.99 then
      raise exception 'Attendance duration is outside the supported range.';
    end if;

    select array_agg(r.id order by r.id) into registration_ids
    from public.registrations r join public.participants p on p.id = r.participant_id
    where r.workshop_id = p_workshop_id
      and r.attendance_status::text is distinct from 'cancelled'
      and attendance.email in (lower(btrim(p.email)), lower(btrim(p.secondary_email)));

    if coalesce(cardinality(registration_ids), 0) = 0 then
      unmatched := unmatched || jsonb_build_array(attendance.email);
    elsif cardinality(registration_ids) > 1 then
      ambiguous := ambiguous || jsonb_build_array(attendance.email);
    elsif exists (
      -- Email-level totals cannot safely combine overlapping visits across aliases.
      -- Flag every affected address before writing, independent of report order.
      select 1 from jsonb_array_elements(p_attendance) item
      join public.participants p on lower(btrim(item->>'email')) in
        (lower(btrim(p.email)), lower(btrim(p.secondary_email)))
      join public.registrations r on r.participant_id = p.id
      where r.id = registration_ids[1]
        and lower(btrim(item->>'email')) <> attendance.email
    ) then
      ambiguous := ambiguous || jsonb_build_array(attendance.email);
    else
      if p_apply then
        update public.registrations
        set attendance_duration_minutes = round(attendance.minutes, 2),
          attendance_zoom_meeting_uuid = p_meeting_uuid,
          attendance_synced_at = now()
        where id = registration_ids[1] and workshop_id = p_workshop_id;
      end if;
      matched := matched || jsonb_build_array(jsonb_build_object(
        'registration_id', registration_ids[1], 'email', attendance.email,
        'attendance_duration_minutes', round(attendance.minutes, 2)
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'workshop_id', p_workshop_id, 'workshop_name', workshop_name,
    'meeting_uuid', p_meeting_uuid, 'matched', matched,
    'unregistered_emails', unmatched, 'ambiguous_emails', ambiguous
  );
end;
$$;

revoke execute on function public.sync_zoom_attendance(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.sync_zoom_attendance(uuid, text, jsonb, boolean) to service_role;

-- Correct a mistaken import without bypassing the one-instance guard or
-- leaving registrations absent from the replacement report with stale minutes.
create function public.reset_zoom_attendance(
  p_workshop_id uuid,
  p_meeting_uuid text,
  p_apply boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workshop_name text;
  registrations jsonb;
begin
  if p_meeting_uuid is null or btrim(p_meeting_uuid) = ''
    or p_meeting_uuid <> btrim(p_meeting_uuid) or p_meeting_uuid ~ '^[0-9]+$' then
    raise exception 'The exact stored Zoom meeting instance UUID is required.';
  end if;

  -- Use the same lock order as sync so a reset cannot race an import.
  select w.name into workshop_name from public.workshops w
    where w.id = p_workshop_id for no key update;
  if not found then
    raise exception 'Workshop not found.';
  end if;
  perform r.id from public.registrations r
    where r.workshop_id = p_workshop_id for update;

  if exists (
    select 1 from public.registrations r where r.workshop_id = p_workshop_id
      and r.attendance_zoom_meeting_uuid is not null
      and r.attendance_zoom_meeting_uuid <> p_meeting_uuid
  ) then
    raise exception 'Stored meeting UUID does not match; nothing was reset.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'registration_id', r.id,
    'attendance_duration_minutes', r.attendance_duration_minutes,
    'attendance_zoom_meeting_uuid', r.attendance_zoom_meeting_uuid,
    'attendance_synced_at', r.attendance_synced_at
  ) order by r.id), '[]'::jsonb) into registrations
  from public.registrations r
  where r.workshop_id = p_workshop_id and r.attendance_zoom_meeting_uuid = p_meeting_uuid;

  if p_apply then
    update public.registrations
    set attendance_duration_minutes = null, attendance_zoom_meeting_uuid = null,
      attendance_synced_at = null
    where workshop_id = p_workshop_id and attendance_zoom_meeting_uuid = p_meeting_uuid;
  end if;

  return jsonb_build_object(
    'workshop_id', p_workshop_id, 'workshop_name', workshop_name,
    'meeting_uuid', p_meeting_uuid, 'applied', coalesce(p_apply, false),
    'registrations', registrations
  );
end;
$$;

revoke execute on function public.reset_zoom_attendance(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.reset_zoom_attendance(uuid, text, boolean) to service_role;

commit;
