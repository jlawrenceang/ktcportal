-- ============================================================
-- 0207 — MFA recovery-code RPCs (owner 2026-06-29, decision #8)
--
-- Supabase TOTP has no native backup codes. These three SECURITY DEFINER RPCs
-- give us the standard break-glass so we can MANDATE MFA for money roles:
--   • generate_mfa_recovery_codes() → 10 one-time codes, shown ONCE, only HASHES stored.
--   • redeem_mfa_recovery_code(code) → on a valid code, removes the caller's TOTP
--       factor so a lost-device user drops to no-MFA and can re-enrol. (Used from the
--       MFA challenge screen at aal1.)
--   • reset_staff_mfa(user) → OWNER-ONLY: clears any staff member's factor + codes,
--       so recovery is a click, not raw DB surgery (~400 staff).
-- Codes are bcrypt-hashed (pgcrypto). The table (0205) is RLS-locked + grants
-- revoked, so codes are never client-readable.
-- ============================================================

create extension if not exists pgcrypto;

-- Generate a fresh set of 10 recovery codes for the calling user (must be enrolled).
-- Clears any prior UNUSED codes first; returns the plaintext codes ONCE.
create or replace function public.generate_mfa_recovery_codes()
returns text[] language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_codes text[] := '{}'; v_code text; i int;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if not exists (select 1 from auth.mfa_factors f where f.user_id = v_uid and f.status = 'verified') then
    raise exception 'Enable an authenticator first, then generate recovery codes.';
  end if;
  delete from public.mfa_recovery_codes where user_id = v_uid and used_at is null;
  for i in 1..10 loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));   -- ~10-char one-time code
    insert into public.mfa_recovery_codes (user_id, code_hash) values (v_uid, crypt(v_code, gen_salt('bf')));
    v_codes := array_append(v_codes, v_code);
  end loop;
  return v_codes;
end;
$$;

-- Redeem a recovery code (called at aal1 when the authenticator is lost). On success,
-- consumes the code and removes the user's TOTP factor so they can sign in + re-enrol.
create or replace function public.redeem_mfa_recovery_code(p_code text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_norm text := upper(regexp_replace(coalesce(p_code,''), '\s', '', 'g'));
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if length(v_norm) = 0 then raise exception 'Enter a recovery code.' using errcode = 'check_violation'; end if;
  select id into v_id from public.mfa_recovery_codes
   where user_id = v_uid and used_at is null and crypt(v_norm, code_hash) = code_hash
   limit 1;
  if v_id is null then return false; end if;                 -- invalid/used code
  update public.mfa_recovery_codes set used_at = now() where id = v_id;
  delete from auth.mfa_factors where user_id = v_uid;        -- drop MFA so they can re-enrol
  delete from public.mfa_recovery_codes where user_id = v_uid and used_at is null;  -- burn the rest
  return true;
end;
$$;

-- OWNER-ONLY: reset a staff member's MFA (lost device, no codes). Click, not SQL surgery.
create or replace function public.reset_staff_mfa(p_user uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can reset staff MFA.'; end if;
  if p_user is null then raise exception 'Pick a staff member.'; end if;
  delete from auth.mfa_factors where user_id = p_user;
  delete from public.mfa_recovery_codes where user_id = p_user;
end;
$$;

revoke all on function public.generate_mfa_recovery_codes()       from public, anon;
revoke all on function public.redeem_mfa_recovery_code(text)      from public, anon;
revoke all on function public.reset_staff_mfa(uuid)               from public, anon;
grant execute on function public.generate_mfa_recovery_codes()    to authenticated;
grant execute on function public.redeem_mfa_recovery_code(text)   to authenticated;
grant execute on function public.reset_staff_mfa(uuid)            to authenticated;

notify pgrst, 'reload schema';
