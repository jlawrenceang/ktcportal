-- ============================================================
-- 0205 — Phase A additive infra: MFA recovery codes + notification routing
--        (owner 2026-06-29, decisions #7 and #8)
--
-- (#8) Supabase TOTP has NO native backup codes. mfa_recovery_codes stores only
--      HASHES of one-time codes; generate/redeem/owner-reset are SECURITY DEFINER
--      RPCs (M2). The table is fully locked (RLS on, grants revoked) — codes are
--      never client-readable. This unblocks mandating MFA for money roles.
-- (#7) notification_settings routes each event to email / SMS / both / off (the
--      SMS gateway already exists, 0193). The dispatch RPC reads this as definer.
-- Additive only.
-- ============================================================

-- ---------- (#8) MFA recovery codes (locked; RPC-only) ----------
create table if not exists public.mfa_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,                 -- auth.users.id
  code_hash  text not null,                 -- hashed one-time code (plaintext shown once, never stored)
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mfa_recovery_codes_user_idx
  on public.mfa_recovery_codes (user_id) where used_at is null;

alter table public.mfa_recovery_codes enable row level security;
revoke all on table public.mfa_recovery_codes from anon, authenticated;
-- (No policies + grants revoked = inert to the API. generate/redeem/reset are
--  SECURITY DEFINER RPCs added in M2; they run as owner and bypass RLS.)

comment on table public.mfa_recovery_codes is
  'One-time MFA recovery codes (hashes only). Locked — managed solely by SECURITY DEFINER RPCs (generate/redeem/owner-reset, M2). Backs the lost-authenticator break-glass so MFA can be mandated for money roles.';

-- ---------- (#7) notification channel routing ----------
create table if not exists public.notification_settings (
  event_type text primary key,
  channel    text not null default 'email' check (channel in ('email','sms','both','off')),
  label      text,                          -- human description for the admin settings UI
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Seed the known customer-facing events (channels tunable by the owner in Settings).
insert into public.notification_settings (event_type, channel, label) values
  ('customer_approved',  'email', 'Account approved / rejected'),
  ('jo_status_change',   'email', 'Job order status changed'),
  ('charge_billed',      'email', 'A charge was billed / needs payment'),
  ('payment_confirmed',  'email', 'Payment confirmed'),
  ('payment_rejected',   'email', 'Payment proof rejected'),
  ('release_status',     'email', 'Release / pull-out status (future)')
on conflict (event_type) do nothing;

alter table public.notification_settings enable row level security;
-- Read: admins (for the Settings UI). Routing at send-time is server-side (definer).
drop policy if exists "admin reads notification settings" on public.notification_settings;
create policy "admin reads notification settings" on public.notification_settings
  for select to authenticated using (public.is_admin());
-- (No write policies — the admin editor writes via a SECURITY DEFINER RPC in M2.)

comment on table public.notification_settings is
  'Per-event delivery channel (email/sms/both/off). Read by the send-time dispatch RPC as definer; admin-tunable in Settings. SMS path = 0193 send-sms.';
