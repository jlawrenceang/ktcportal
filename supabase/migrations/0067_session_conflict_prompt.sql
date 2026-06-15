-- ============================================================
-- 0067 — device-conflict prompt support (owner, 2026-06-15)
--
-- The new-login experience now ASKS before evicting: "this account is
-- already signed in on another device — terminate that session and
-- continue here?" (Terminate / Cancel). To drive that prompt the client
-- needs a read-only "is there another live session right now?" check.
--
-- The actual claim + eviction stays in claim_session() (0054/0055), which
-- is aal2-gated — so a password alone still can't evict an MFA-protected
-- session. This function only REPORTS; it never evicts.
--
-- Returns true when the caller's account has any OTHER live auth.session
-- besides the one carried by the current JWT. Server/SQL contexts (no
-- session_id claim) compare against NULL → no rows → false.
-- ============================================================

create or replace function public.has_other_live_session()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.sessions s
    where s.user_id = auth.uid()
      and s.id <> nullif(auth.jwt()->>'session_id', '')::uuid
  );
$$;

revoke all on function public.has_other_live_session() from public, anon;
grant execute on function public.has_other_live_session() to authenticated;
