-- Preserve cancelled history while allowing participants to register again.
-- Apply this migration before deploying the updated workshop pages.
begin;

alter table public.registrations
  drop constraint registrations_participant_workshop_key;

create unique index registrations_active_participant_workshop_key
  on public.registrations (participant_id, workshop_id)
  where attendance_status is distinct from 'cancelled';

alter table public.workshops
  add constraint workshops_nonnegative_capacity check (capacity >= 0);

create or replace function public.enforce_workshop_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workshop_capacity integer;
  occupied_spots bigint;
begin
  if new.attendance_status = 'cancelled' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.workshop_id = new.workshop_id
       and old.attendance_status is distinct from 'cancelled' then
      return new;
    end if;
  end if;

  -- Serialize new registrations with each other AND capacity edits.
  select capacity into workshop_capacity
  from public.workshops
  where id = new.workshop_id
  for no key update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Workshop not found.';
  end if;

  if workshop_capacity is null then
    return new;
  end if;

  select count(*) into occupied_spots
  from public.registrations
  where workshop_id = new.workshop_id
    and attendance_status is distinct from 'cancelled'
    and id <> new.id;

  if occupied_spots >= workshop_capacity then
    raise exception using errcode = 'P1001', message = 'This workshop is full. Registration is closed.';
  end if;
  return new;
end;
$$;

create function public.guard_workshop_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  occupied_spots bigint;
begin
  -- Block even if the existing FK cascades. Keep participant history intact.
  if tg_op = 'DELETE' then
    if exists (select 1 from public.registrations where workshop_id = old.id) then
      raise exception using errcode = 'P1003', message = 'Workshops with registration records cannot be deleted.';
    end if;
    return old;
  end if;

  -- UPDATE already holds a row lock that conflicts with registration's lock.
  if new.capacity is not null then
    select count(*) into occupied_spots
    from public.registrations
    where workshop_id = new.id
      and attendance_status is distinct from 'cancelled';

    if new.capacity < occupied_spots then
      raise exception using errcode = 'P1002', message = 'Capacity cannot be lower than the number of active registrations.';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_workshop_changes() from public, anon, authenticated;

create trigger guard_workshop_capacity_update
before update of capacity on public.workshops
for each row execute function public.guard_workshop_changes();

create trigger guard_workshop_delete
before delete on public.workshops
for each row execute function public.guard_workshop_changes();

-- Deliberately expose only aggregate occupancy, never participant identities.
-- A definer function is necessary because participants may only see their own
-- registration rows under RLS. The workshop pages are also available to anon.
create function public.workshop_registration_count(target_workshop_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.registrations
  where workshop_id = target_workshop_id
    and attendance_status is distinct from 'cancelled';
$$;

revoke execute on function public.workshop_registration_count(uuid) from public;
grant execute on function public.workshop_registration_count(uuid) to anon, authenticated;

commit;
