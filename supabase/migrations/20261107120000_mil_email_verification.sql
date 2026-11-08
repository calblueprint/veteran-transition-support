-- One-use .mil email proof for public.participants.verification_status.
-- Requires 20261007090000_participant_onboarding_documents.sql first.
-- No existing profile fields, login emails, or other verification workflows are changed.
begin;

-- The confirmed .mil address is a separate profile field, never an Auth email.
-- Pending addresses remain in the private challenge table until confirmed.
alter table public.participants
  add column military_email text,
  add constraint participants_military_email_format check (
    military_email is null or (
      char_length(military_email) <= 254
      and military_email ~* '^[a-z0-9._%+-]+@([a-z0-9-]+\.)+mil$'
    )
  );

-- Even if a development environment has broad table-level grants, an ordinary
-- browser session cannot set a confirmed military address directly.
create function public.protect_participant_military_email()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.military_email is not null then
      raise exception 'Military email must be confirmed' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.military_email is distinct from old.military_email then
      raise exception 'Military email must be confirmed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_participant_military_email
before insert or update on public.participants
for each row execute function public.protect_participant_military_email();

create table public.mil_email_verifications (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  military_email text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  window_started_at timestamptz not null,
  requests_in_window integer not null check (requests_in_window between 1 and 3),
  constraint mil_email_domain check (
    char_length(military_email) <= 254 and
    military_email ~* '^[a-z0-9._%+-]+@([a-z0-9-]+\.)+mil$'
  ),
  constraint mil_email_expiry check (expires_at > requested_at)
);

alter table public.mil_email_verifications enable row level security;
revoke all on public.mil_email_verifications from public, anon, authenticated;
grant select, insert, update, delete on public.mil_email_verifications to service_role;

-- Only the trusted server can issue tokens. Lock the participant row to
-- serialize concurrent requests and rate limits for the same account.
create function public.issue_mil_email_verification(
  p_participant_id uuid,
  p_military_email text,
  p_token_hash text
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_verified boolean;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_last_request timestamptz;
  v_window_start timestamptz;
  v_count integer;
begin
  if p_military_email is null or char_length(p_military_email) > 254
     or p_military_email !~* '^[a-z0-9._%+-]+@([a-z0-9-]+\.)+mil$'
     or p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid_email';
  end if;

  select verification_status into v_verified
  from public.participants where id = p_participant_id for update;
  if not found then return 'profile_missing'; end if;
  if v_verified then return 'already_verified'; end if;

  select requested_at, window_started_at, requests_in_window
    into v_last_request, v_window_start, v_count
  from public.mil_email_verifications where participant_id = p_participant_id;

  if found then
    if v_last_request > v_now - interval '60 seconds' then
      return 'cooldown';
    end if;
    if v_window_start > v_now - interval '1 hour' then
      if v_count >= 3 then return 'rate_limited'; end if;
      v_count := v_count + 1;
    else
      v_window_start := v_now;
      v_count := 1;
    end if;
  else
    v_window_start := v_now;
    v_count := 1;
  end if;

  insert into public.mil_email_verifications
    (participant_id, military_email, token_hash, requested_at,
     expires_at, consumed_at, window_started_at, requests_in_window)
  values
    (p_participant_id, p_military_email, p_token_hash, v_now,
     v_now + interval '15 minutes', null, v_window_start, v_count)
  on conflict (participant_id) do update set
    military_email = excluded.military_email,
    token_hash = excluded.token_hash,
    requested_at = excluded.requested_at,
    expires_at = excluded.expires_at,
    consumed_at = null,
    window_started_at = excluded.window_started_at,
    requests_in_window = excluded.requests_in_window;

  return 'issued';
end;
$$;

-- Redemption, setting verified and saving the confirmed address happen in one
-- transaction. The token is tied to both its hash and the signed-in user ID.
create function public.consume_mil_email_verification(
  p_participant_id uuid,
  p_token_hash text
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_verified boolean;
  v_hash text;
  v_email text;
  v_expiry timestamptz;
  v_consumed timestamptz;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid_link';
  end if;

  select verification_status into v_verified
  from public.participants where id = p_participant_id for update;
  if not found then return 'invalid_link'; end if;

  select token_hash, military_email, expires_at, consumed_at
    into v_hash, v_email, v_expiry, v_consumed
  from public.mil_email_verifications
  where participant_id = p_participant_id for update;

  if not found or v_hash is distinct from p_token_hash then
    return 'invalid_link';
  end if;
  if v_consumed is not null then return 'used_link'; end if;
  if v_expiry <= v_now then return 'expired_link'; end if;
  if v_verified then return 'invalid_link'; end if;

  update public.mil_email_verifications
    set consumed_at = v_now
    where participant_id = p_participant_id;
  update public.participants
    set verification_status = true, military_email = v_email
    where id = p_participant_id;
  return 'verified';
end;
$$;

-- PostgreSQL gives PUBLIC EXECUTE on functions by default: revoke it.
-- Only the server-side service-role key may invoke either privileged RPC.
revoke all on function public.issue_mil_email_verification(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.consume_mil_email_verification(uuid, text)
  from public, anon, authenticated;
grant execute on function public.issue_mil_email_verification(uuid, text, text)
  to service_role;
grant execute on function public.consume_mil_email_verification(uuid, text)
  to service_role;

-- Prevent different accounts from verifying with the same military email.
create unique index participants_unique_military_email
on public.participants (lower(military_email))
where military_email is not null;

commit;
