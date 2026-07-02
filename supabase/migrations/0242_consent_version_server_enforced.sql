-- ============================================================
-- 0242 — BT-05: enforce the CURRENT agreement version server-side (was frontend-only)
--
-- Break-test BT-05: has_recorded_consent() (0162) checked only `terms_version is not null`, so the
-- "re-accept the updated agreement" gate was enforced ONLY in the client (ProtectedRoute compares to
-- legal.ts AGREEMENT_VERSION). A customer on a superseded version could bypass the wall and transact
-- via a direct RPC (file_job_order / open_ticket) under legally-superseded NDA/DPA terms — a violation
-- of the backend-enforced-access non-negotiable. Latent: it activates the moment the agreement is bumped.
--
-- Fix: the server compares terms_version to the CURRENT version, sourced from a single app_config row.
-- FAIL-OPEN when the config row is missing → the worst case degrades to the original non-null check,
-- never a lockout.
--
-- PAIRING (poka-yoke — read before bumping the agreement): a material agreement bump must update BOTH
-- src/content/legal.ts `AGREEMENT_VERSION` AND this `app_config` row (a forward migration), in the SAME
-- release. Follow-up (drift-proofing): have the frontend read the version from app_config so there is
-- one source; until then the two must be bumped together.
-- ============================================================

create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
insert into public.app_config (key, value) values ('agreement_version', 'v4')
  on conflict (key) do nothing;

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
drop policy if exists "app_config public read" on public.app_config;
create policy "app_config public read" on public.app_config for select using (true);  -- the version string is public-safe
grant select on public.app_config to anon, authenticated;

create or replace function public.has_recorded_consent()
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when (select value from public.app_config where key = 'agreement_version') is null
      -- config missing → fail-open to the original non-null check (never lock a customer out)
      then coalesce((select terms_version is not null from public.customers where id = public.current_broker_id()), false)
    else coalesce(
      (select terms_version = (select value from public.app_config where key = 'agreement_version')
         from public.customers where id = public.current_broker_id()),
      false)
  end
$$;
revoke all on function public.has_recorded_consent() from public, anon;
grant execute on function public.has_recorded_consent() to authenticated;

notify pgrst, 'reload schema';
