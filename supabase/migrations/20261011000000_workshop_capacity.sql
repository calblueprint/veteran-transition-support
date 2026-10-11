-- Enforce workshop capacity for new and reactivated registrations.
-- NULL capacity means unlimited; cancelled registrations don't count.
begin;

create function public.enforce_workshop_capacity()
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

  -- Updating an existing occupied spot doesn't require another spot.
  if tg_op = 'UPDATE' then
    if old.workshop_id = new.workshop_id
       and old.attendance_status <> 'cancelled' then
      return new;
    end if;
  end if;

  -- Make competing registrations for this workshop wait their turn.
  -- This lock remains compatible with foreign-key checks.
  select capacity
  into workshop_capacity
  from public.workshops
  where id = new.workshop_id
  for no key update;

  if not found then
    raise exception 'Workshop not found.';
  end if;

  if workshop_capacity is null then
    return new;
  end if;

  select count(*)
  into occupied_spots
  from public.registrations
  where workshop_id = new.workshop_id
    and attendance_status <> 'cancelled'
    and id <> new.id;

  if occupied_spots >= workshop_capacity then
    raise exception
      'This workshop is full. Registration is closed.';
  end if;

  return new;
end;
$$;

-- This function is used by the trigger, not called directly by clients.
revoke execute on function public.enforce_workshop_capacity()
from public, anon, authenticated;

create trigger enforce_workshop_capacity
before insert or update of workshop_id, attendance_status
on public.registrations
for each row
execute function public.enforce_workshop_capacity();

commit;