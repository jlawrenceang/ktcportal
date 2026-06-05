-- ============================================================
-- 0010 — owner-only staff creation (username + password, no email).
-- A SECURITY DEFINER function the owner calls from Settings via RPC.
-- Creates an auth user (synthetic <username>@ktc-staff.local, email pre-
-- confirmed) and marks them admin+approved. No email is ever sent.
-- ============================================================

create or replace function public.create_staff(p_username text, p_password text, p_full_name text)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(trim(p_username)) || '@ktc-staff.local';
  v_id    uuid := gen_random_uuid();
begin
  -- owner-only from the app; SQL/server context (no JWT) is trusted
  if v_uid is not null
     and not coalesce((select is_owner from public.brokers where user_id = v_uid), false) then
    raise exception 'Only the owner can create staff';
  end if;
  if length(coalesce(trim(p_username), '')) < 3 then raise exception 'Username must be at least 3 characters'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'That username is already taken';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_sso_user,
    -- GoTrue cannot scan NULL token columns ("Database error querying schema")
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'username', lower(trim(p_username))),
    false,
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at
  ) values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  -- the on-signup trigger created the broker row; promote to staff
  update public.brokers
  set is_admin = true, status = 'approved', full_name = p_full_name, decided_at = now()
  where user_id = v_id;

  return v_email;
end;
$$;

revoke all on function public.create_staff(text, text, text) from public, anon;
grant execute on function public.create_staff(text, text, text) to authenticated;
