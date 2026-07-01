-- ============================================================
-- 0237 — Security batch: crown-jewel step-up · owner-email lock · trusted-device revoke
--
-- Independent review of the 2026-07-01 hardening batch surfaced three findings
-- (docs/audits/2026-07-02-codex-0701-batch-review.md). Fixes, all forward-only:
--
--  CX-01  0236 widened aal_satisfied() to accept a "trusted device" (aal1 + token).
--         But 0198 hardened the three irreversible crown-jewel RPCs to require aal2
--         precisely so a PHISHED PASSWORD ALONE can't mint staff / grant owner. After
--         0236 those RPCs accept a trusted aal1 session — a regression of 0198. Owner
--         decision (2026-07-02): require a FRESH live 2FA code for those three ops;
--         keep trusted-session convenience for everyday admin. New require_fresh_aal2()
--         = aal_satisfied()'s logic MINUS the trusted-session branch (a no-factor owner
--         still passes — preserving 0198's "non-MFA owner still works"; a trusted aal1
--         device does NOT satisfy step-up).
--
--  CX-02  request_/confirm_customer_email_change blocked @ktc-staff.local but NOT the
--         owner failsafe email — the owner could change their own auth email away from
--         jlawrenceang@gmail.com, voiding is_owner()'s email backstop (0184, a stated
--         non-negotiable). Lock any change TO or FROM an owner / root-owner email.
--
--  CX-03  Trusted devices had no revoke path (revoked_at was only ever un-set) and
--         survived sign-out / password change. New revoke_trusted_mfa_devices()
--         revokes the caller's devices AND drops their trusted sessions (immediate
--         de-trust); the client clears the local token on sign-out + password change.
-- ============================================================

-- ---------- CX-01: fresh-aal2 helper (deliberately ignores trusted sessions) ----------
create or replace function public.require_fresh_aal2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Mirrors aal_satisfied() (0236) but WITHOUT the mfa_trusted_sessions branch:
  --   * a user WITH a verified factor must present a live aal2 (a trusted-device
  --     aal1 session does NOT count — this is the step-up),
  --   * a user with NO verified factor still passes (keeps the "non-MFA owner still
  --     works" property that 0198 relies on).
  select case
    when exists (select 1 from auth.mfa_factors f
                 where f.user_id = auth.uid() and f.status = 'verified')
      then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    else true
  end;
$$;
revoke all on function public.require_fresh_aal2() from public, anon, authenticated;

-- ---------- CX-01: crown-jewel RPCs now require fresh aal2 (recreated from 0198 / 0093) ----------

-- reset_staff_password — 0198 verbatim + step-up
create or replace function public.reset_staff_password(p_username text, p_password text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_email text := lower(trim(p_username)) || '@ktc-staff.local';
begin
  if not public.is_owner() then
    raise exception 'Only the owner can reset staff passwords';
  end if;
  if not public.require_fresh_aal2() then
    raise exception 'This action needs a fresh 2FA code. Sign in again and complete the authenticator challenge — a trusted-device session is not enough here.'
      using errcode = 'insufficient_privilege';
  end if;
  if length(coalesce(p_password, '')) < 8
     or p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then
    raise exception 'Password must be at least 8 characters and include a letter and a number';
  end if;
  update auth.users
  set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
  where email = v_email;
  if not found then raise exception 'No staff account "%"', lower(trim(p_username)); end if;

  perform public.log_security_event(
    'staff_password_reset',
    (select id from public.customers where email = v_email),
    jsonb_build_object('username', lower(trim(p_username)))
  );
end;
$$;
revoke all on function public.reset_staff_password(text, text) from public, anon;
grant execute on function public.reset_staff_password(text, text) to authenticated;

-- promote_new_staff — 0198 verbatim + step-up
create or replace function public.promote_new_staff(p_user_id uuid, p_role text, p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can create staff';
  end if;
  if not public.require_fresh_aal2() then
    raise exception 'This action needs a fresh 2FA code. Sign in again and complete the authenticator challenge — a trusted-device session is not enough here.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_role not in ('admin','cashier','checker','operations','csr','purchaser') then
    raise exception 'Unknown role %', p_role;
  end if;
  update public.customers
  set is_admin   = (p_role = 'admin'),
      staff_role = p_role,
      status     = 'approved',
      full_name  = p_full_name,
      decided_at = now()
  where user_id = p_user_id;
  if not found then raise exception 'No account row for the new staff user.'; end if;

  perform public.log_security_event(
    'staff_promoted',
    (select id from public.customers where user_id = p_user_id),
    jsonb_build_object('role', p_role, 'full_name', p_full_name)
  );
end;
$$;
revoke all on function public.promote_new_staff(uuid, text, text) from public, anon;
grant execute on function public.promote_new_staff(uuid, text, text) to authenticated;

-- set_owner_access — 0093 verbatim + step-up (root-owner grant/revoke)
create or replace function public.set_owner_access(p_target uuid, p_grant boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_target_root boolean; v_email text;
begin
  if not public.is_root_owner() then
    raise exception 'Only the root owner can grant or revoke owner access.';
  end if;
  if not public.require_fresh_aal2() then
    raise exception 'This action needs a fresh 2FA code. Sign in again and complete the authenticator challenge — a trusted-device session is not enough here.'
      using errcode = 'insufficient_privilege';
  end if;
  select is_root_owner, email into v_target_root, v_email from public.customers where id = p_target;
  if not found then raise exception 'Account not found.'; end if;
  if v_target_root then raise exception 'The root owner can''t be changed.'; end if;

  perform set_config('ktc.allow_owner_change', '1', true);  -- authorise this txn only
  update public.customers
     set is_owner = p_grant,
         is_admin = case when p_grant then true else is_admin end
   where id = p_target;

  perform public.log_security_event(case when p_grant then 'owner_granted' else 'owner_revoked' end,
    p_target, jsonb_build_object('email', v_email, 'by_root', auth.uid()));
end;
$$;
revoke all on function public.set_owner_access(uuid, boolean) from public, anon;
grant execute on function public.set_owner_access(uuid, boolean) to authenticated;

-- ---------- CX-02: owner-email lock on the customer email-change flow (recreated from 0235) ----------

create or replace function public.request_customer_email_change(
  p_new_email text,
  p_redirect_base text default 'https://portal.ktcterminal.com'
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer public.customers%rowtype;
  v_new text := lower(trim(coalesce(p_new_email, '')));
  v_old text;
  v_token text;
  v_hash text;
  v_base text;
  v_url text;
begin
  select * into v_customer from public.customers where user_id = auth.uid();
  if v_customer.id is null then
    raise exception 'Customer account not found.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(v_customer.email, '') like '%@ktc-staff.local' then
    raise exception 'Staff emails are managed by the owner.' using errcode = 'insufficient_privilege';
  end if;

  v_old := lower(trim(coalesce(v_customer.email, auth.email(), '')));

  -- CX-02: the owner failsafe email is protected. Block changing TO or FROM an
  -- owner / root-owner email so is_owner()'s email backstop (0184) can't be voided.
  if v_new = 'jlawrenceang@gmail.com'
     or v_old = 'jlawrenceang@gmail.com'
     or exists (select 1 from public.customers c
                 where (c.is_owner or c.is_root_owner)
                   and lower(coalesce(c.email, '')) in (v_new, v_old)) then
    raise exception 'The owner account email is protected and cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_new !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'Enter a valid new email address.' using errcode = 'check_violation';
  end if;
  if v_new = v_old then
    raise exception 'That is already your email.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_new and id <> auth.uid()) then
    raise exception 'That email already has an account.' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from public.customers where lower(email) = v_new and user_id <> auth.uid()) then
    raise exception 'That email already has an account.' using errcode = 'unique_violation';
  end if;

  update public.customer_email_change_requests
     set superseded_at = now()
   where customer_id = v_customer.id
     and confirmed_at is null
     and superseded_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_base := case
    when trim(coalesce(p_redirect_base, '')) = 'https://portal.ktcterminal.com'
      then 'https://portal.ktcterminal.com'
    when trim(coalesce(p_redirect_base, '')) like 'http://localhost:%'
      then rtrim(trim(p_redirect_base), '/')
    when trim(coalesce(p_redirect_base, '')) like 'http://127.0.0.1:%'
      then rtrim(trim(p_redirect_base), '/')
    else 'https://portal.ktcterminal.com'
  end;
  v_url := v_base || '/email-change-confirm?token=' || v_token;

  insert into public.customer_email_change_requests(customer_id, user_id, old_email, new_email, token_hash)
  values (v_customer.id, auth.uid(), v_old, v_new, v_hash);

  perform public.send_portal_email(
    v_new,
    coalesce(v_customer.full_name, 'there'),
    'Confirm your new KTC portal email',
    'Confirm your new email',
    'please confirm that this email address should be used for your KTC Online Portal account. Your account email will not change until you confirm this link.',
    v_url,
    'Confirm new email'
  );

  perform public.send_portal_email(
    v_old,
    coalesce(v_customer.full_name, 'there'),
    'Security notice: KTC portal email change requested',
    'Email change requested',
    'a request was made to change your KTC Online Portal email address. If this was you, no action is needed. If this was not you, contact KTC support immediately or file a support report in the portal.',
    'https://portal.ktcterminal.com/support',
    'Contact support'
  );

  return 'sent';
end;
$$;

create or replace function public.confirm_customer_email_change(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_req public.customer_email_change_requests%rowtype;
begin
  select * into v_req
    from public.customer_email_change_requests
   where token_hash = v_hash
     and confirmed_at is null
     and superseded_at is null
   for update;

  if v_req.id is null then
    raise exception 'This email-change link is invalid or has already been used.' using errcode = 'invalid_parameter_value';
  end if;
  if v_req.expires_at < now() then
    update public.customer_email_change_requests set superseded_at = now() where id = v_req.id;
    raise exception 'This email-change link has expired. Please request a new one.' using errcode = 'invalid_parameter_value';
  end if;

  -- CX-02: defense-in-depth — reject confirming a request that would move an owner
  -- email (covers any request row created before the request-side lock existed).
  if lower(v_req.new_email) = 'jlawrenceang@gmail.com'
     or lower(v_req.old_email) = 'jlawrenceang@gmail.com'
     or exists (select 1 from public.customers c
                 where (c.is_owner or c.is_root_owner)
                   and lower(coalesce(c.email, '')) in (lower(v_req.new_email), lower(v_req.old_email))) then
    update public.customer_email_change_requests set superseded_at = now() where id = v_req.id;
    raise exception 'The owner account email is protected and cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from auth.users where lower(email) = lower(v_req.new_email) and id <> v_req.user_id) then
    update public.customer_email_change_requests set superseded_at = now() where id = v_req.id;
    raise exception 'That email already has an account.' using errcode = 'unique_violation';
  end if;

  update auth.users
     set email = v_req.new_email,
         email_confirmed_at = now(),
         email_change = '',
         email_change_token_new = '',
         email_change_token_current = '',
         email_change_sent_at = null,
         email_change_confirm_status = 0,
         updated_at = now(),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('email', v_req.new_email, 'email_verified', true)
   where id = v_req.user_id;

  update auth.identities
     set email = v_req.new_email,
         identity_data = coalesce(identity_data, '{}'::jsonb)
           || jsonb_build_object('email', v_req.new_email, 'email_verified', true),
         updated_at = now()
   where user_id = v_req.user_id
     and provider = 'email';

  update public.customers
     set email = v_req.new_email
   where id = v_req.customer_id;

  update public.customer_email_change_requests
     set confirmed_at = now()
   where id = v_req.id;

  return 'confirmed';
end;
$$;

revoke all on function public.request_customer_email_change(text, text) from public, anon;
grant execute on function public.request_customer_email_change(text, text) to authenticated;

revoke all on function public.confirm_customer_email_change(text) from public, anon, authenticated;
grant execute on function public.confirm_customer_email_change(text) to anon, authenticated;

-- ---------- CX-03: revoke trusted devices (lost-device kill switch) ----------
create or replace function public.revoke_trusted_mfa_devices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  -- Stop future resume: mark the caller's devices revoked.
  update public.mfa_trusted_devices
     set revoked_at = now()
   where user_id = v_uid and revoked_at is null;
  get diagnostics v_count = row_count;
  -- De-trust immediately: any currently-trusted aal1 session loses aal2-equivalence
  -- (aal_satisfied() reads mfa_trusted_sessions), so it is re-challenged at once.
  delete from public.mfa_trusted_sessions where user_id = v_uid;
  return v_count;
end;
$$;
revoke all on function public.revoke_trusted_mfa_devices() from public, anon;
grant execute on function public.revoke_trusted_mfa_devices() to authenticated;
