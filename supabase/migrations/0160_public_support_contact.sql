-- ============================================================
-- 0160 — public read of support contact (phone / email)
--
-- The "Need help?" line on the PUBLIC pages (Landing, Login) shows the real
-- KTC support phone + email. Those visitors are logged out, so they reach the
-- DB as the `anon` role. The 0083 read policy on support_contact is scoped to
-- `authenticated` only — anon gets nothing. This adds a tightly-scoped anon
-- SELECT policy limited to the two public-facing keys, so no other contact
-- detail (sms / viber / internal hours) leaks to anonymous callers.
-- ============================================================

-- Ensure RLS is enabled — the anon grant below is ONLY safe because RLS +
-- the scoped policy restrict it to the phone/email rows. Without RLS on, the
-- grant would expose every column/row (sms/viber/hours) to anonymous callers.
-- Idempotent (no-op if already enabled, which it is via the 0083 policy).
alter table public.support_contact enable row level security;

-- Restate the anon table grant (Supabase default) so the policy below takes
-- effect regardless of default-privilege drift. Idempotent.
grant select on public.support_contact to anon;

-- Anonymous visitors may read ONLY the phone + email rows (the public help line).
drop policy if exists "public read support contact" on public.support_contact;
create policy "public read support contact" on public.support_contact
  for select to anon
  using (key in ('phone', 'email'));
