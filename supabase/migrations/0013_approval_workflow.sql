-- ============================================================
-- 0013 — approval workflow: decision reasons + broker suspension.
-- Run in the KTC Supabase project SQL Editor (idempotent).
-- ============================================================

-- Reason captured when an admin rejects (or suspends) a broker / accreditation.
alter table public.brokers add column if not exists decision_reason text;
alter table public.accreditations add column if not exists decision_reason text;

-- Allow an admin to SUSPEND an approved broker (blocks access; reversible).
-- broker_is_approved() returns true only for status='approved', so a suspended
-- broker is automatically gated out of the broker portal.
do $$ begin
  alter table public.brokers drop constraint if exists brokers_status_check;
exception when others then null; end $$;

alter table public.brokers
  add constraint brokers_status_check
  check (status in ('pending', 'approved', 'rejected', 'suspended'));

comment on column public.brokers.decision_reason is 'Reason recorded when a broker is rejected or suspended (shown to the broker).';
comment on column public.accreditations.decision_reason is 'Reason recorded when an accreditation request is rejected.';
