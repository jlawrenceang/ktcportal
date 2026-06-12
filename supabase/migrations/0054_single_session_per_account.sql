-- ============================================================
-- 0054 — one active session per account (last login wins)
-- (request 2026-06-13: "just one session per account; a new login
-- replaces the old one").
--
-- Design: REFUSING the new login was rejected — it creates a lockout
-- loophole (close the browser without signing out and you must wait for
-- the idle timeout). Instead the NEW login wins: claim_session() records
-- the fresh session id and deletes every OTHER auth session / refresh
-- token for that user (the same eviction mechanism 0047 uses for
-- auto-suspend). The evicted device stops refreshing immediately; the
-- app's session guard (is_current_session polled by both shells) signs
-- it out within ~a minute with a "signed in somewhere else" notice.
-- Residual risk: the evicted JWT itself stays valid until expiry (≤1h)
-- for raw REST calls — acceptable: it belongs to the SAME account, and
-- staff aal2 / RLS checks still apply on every query.
--
-- MFA guard: an account with a verified TOTP factor may only claim at
-- aal2. Otherwise a stolen password alone (no authenticator) could evict
-- the real owner's session — the exact "hacker loophole" to avoid. For
-- such accounts the app calls claim_session() again right after the
-- 6-digit verify.
--
-- Pre-rollout sessions have no claim row: is_current_session() returns
-- true for them (grandfathered) until the account's next fresh sign-in.
-- ============================================================

create table if not exists public.active_sessions (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  session_id uuid not null,
  claimed_at timestamptz not null default now()
);

alter table public.active_sessions enable row level security;
-- No policies on purpose: the table is server-only, reached exclusively
-- through the SECURITY DEFINER functions below (0048 lockdown style).
revoke all on table public.active_sessions from public, anon, authenticated;

create or replace function public.claim_session()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  if v_uid is null or v_sid is null then return; end if;

  -- MFA-enrolled accounts claim only once fully authenticated (aal2).
  if exists (select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified')
     and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    return;
  end if;

  insert into public.active_sessions (user_id, session_id, claimed_at)
  values (v_uid, v_sid, now())
  on conflict (user_id) do update
    set session_id = excluded.session_id, claimed_at = now();

  -- Evict every other session for this account (mechanism shared with 0047).
  begin
    delete from auth.refresh_tokens where user_id = v_uid::text and session_id <> v_sid;
    delete from auth.sessions where user_id = v_uid and id <> v_sid;
  exception when others then
    raise notice 'claim_session: eviction failed: %', sqlerrm;
  end;
end;
$$;

create or replace function public.is_current_session()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select a.session_id = nullif(auth.jwt()->>'session_id', '')::uuid
       from public.active_sessions a
      where a.user_id = auth.uid()),
    true)  -- no claim recorded yet (pre-rollout session) → still current
$$;

revoke all on function public.claim_session() from public, anon;
revoke all on function public.is_current_session() from public, anon;
grant execute on function public.claim_session() to authenticated;
grant execute on function public.is_current_session() to authenticated;
