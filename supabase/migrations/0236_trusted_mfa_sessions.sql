-- ============================================================
-- 0236 - Trusted MFA sessions
--
-- Lets an MFA-enrolled account trust the current browser for a short window
-- after a real aal2 challenge. The browser stores a random token; the database
-- stores only its SHA-256 hash and binds trust to the current Supabase session_id.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.mfa_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists mfa_trusted_devices_user_active_idx
  on public.mfa_trusted_devices(user_id, expires_at)
  where revoked_at is null;

alter table public.mfa_trusted_devices enable row level security;
revoke all on table public.mfa_trusted_devices from anon, authenticated;

create table if not exists public.mfa_trusted_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  trusted_device_id uuid not null references public.mfa_trusted_devices(id) on delete cascade,
  created_at timestamptz not null default now(),
  trusted_until timestamptz not null,
  primary key (user_id, session_id)
);

create index if not exists mfa_trusted_sessions_active_idx
  on public.mfa_trusted_sessions(user_id, session_id, trusted_until);

alter table public.mfa_trusted_sessions enable row level security;
revoke all on table public.mfa_trusted_sessions from anon, authenticated;

create or replace function public.trust_mfa_device(p_token text, p_label text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  v_hash text;
  v_device_id uuid;
  v_expires_at timestamptz := now() + interval '24 hours';
begin
  if v_uid is null or v_sid is null then
    raise exception 'Not authenticated';
  end if;

  if length(coalesce(p_token, '')) < 32 then
    raise exception 'Invalid trusted-device token';
  end if;

  if not exists (select 1 from auth.mfa_factors f where f.user_id = v_uid and f.status = 'verified') then
    raise exception 'No verified MFA factor';
  end if;

  if coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'MFA challenge required';
  end if;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  insert into public.mfa_trusted_devices (user_id, token_hash, label, expires_at)
  values (v_uid, v_hash, nullif(left(coalesce(p_label, ''), 120), ''), v_expires_at)
  on conflict (token_hash) do update
    set last_used_at = now(),
        expires_at = excluded.expires_at,
        revoked_at = null,
        label = coalesce(excluded.label, public.mfa_trusted_devices.label)
    where public.mfa_trusted_devices.user_id = v_uid
  returning id into v_device_id;

  if v_device_id is null then
    raise exception 'Trusted-device token collision';
  end if;

  insert into public.mfa_trusted_sessions (user_id, session_id, trusted_device_id, trusted_until)
  values (v_uid, v_sid, v_device_id, v_expires_at)
  on conflict (user_id, session_id) do update
    set trusted_device_id = excluded.trusted_device_id,
        trusted_until = excluded.trusted_until;

  return v_expires_at;
end;
$$;

create or replace function public.resume_trusted_mfa_session(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  v_hash text;
  v_device_id uuid;
  v_expires_at timestamptz;
begin
  if v_uid is null or v_sid is null then return false; end if;

  if not exists (select 1 from auth.mfa_factors f where f.user_id = v_uid and f.status = 'verified') then
    return true;
  end if;

  if coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2' then
    return true;
  end if;

  if length(coalesce(p_token, '')) < 32 then return false; end if;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select d.id, d.expires_at
    into v_device_id, v_expires_at
    from public.mfa_trusted_devices d
   where d.user_id = v_uid
     and d.token_hash = v_hash
     and d.revoked_at is null
     and d.expires_at > now()
   limit 1;

  if v_device_id is null then
    return false;
  end if;

  update public.mfa_trusted_devices
     set last_used_at = now()
   where id = v_device_id;

  insert into public.mfa_trusted_sessions (user_id, session_id, trusted_device_id, trusted_until)
  values (v_uid, v_sid, v_device_id, v_expires_at)
  on conflict (user_id, session_id) do update
    set trusted_device_id = excluded.trusted_device_id,
        trusted_until = excluded.trusted_until;

  return true;
end;
$$;

revoke all on function public.trust_mfa_device(text, text) from public, anon;
grant execute on function public.trust_mfa_device(text, text) to authenticated;
revoke all on function public.resume_trusted_mfa_session(text) from public, anon;
grant execute on function public.resume_trusted_mfa_session(text) to authenticated;

create or replace function public.aal_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from auth.mfa_factors f
                 where f.user_id = auth.uid() and f.status = 'verified')
      then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
        or exists (
          select 1
            from public.mfa_trusted_sessions s
           where s.user_id = auth.uid()
             and s.session_id = nullif(auth.jwt()->>'session_id', '')::uuid
             and s.trusted_until > now()
        )
    else true
  end;
$$;
revoke all on function public.aal_satisfied() from public, anon, authenticated;

create or replace function public.claim_session()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  v_evicted int := 0;
begin
  if v_uid is null or v_sid is null then return; end if;

  -- MFA-enrolled accounts claim only once fully authenticated or trusted.
  if exists (select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified')
     and not public.aal_satisfied() then
    return;
  end if;

  insert into public.active_sessions (user_id, session_id, claimed_at)
  values (v_uid, v_sid, now())
  on conflict (user_id) do update
    set session_id = excluded.session_id, claimed_at = now();

  begin
    delete from auth.refresh_tokens where user_id = v_uid::text and session_id <> v_sid;
    delete from auth.sessions where user_id = v_uid and id <> v_sid;
    get diagnostics v_evicted = row_count;
  exception when others then
    raise notice 'claim_session: eviction failed: %', sqlerrm;
  end;

  if v_evicted > 0 then
    perform public.log_security_event(
      'session_evicted',
      (select id from public.customers where user_id = v_uid),
      jsonb_build_object('evicted_sessions', v_evicted));
  end if;

  if exists (select 1 from public.customers
             where user_id = v_uid and (is_owner or is_admin or staff_role is not null)) then
    perform public.log_security_event(
      'sign_in',
      (select id from public.customers where user_id = v_uid),
      jsonb_build_object(
        'aal', coalesce(auth.jwt()->>'aal', 'aal1'),
        'trusted_mfa_session', public.aal_satisfied() and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2'
      ));
  end if;
end;
$$;

revoke all on function public.claim_session() from public, anon;
grant execute on function public.claim_session() to authenticated;
