-- ============================================================
-- 0108 — drop verified-dead schema (owner, 2026-06-16)
--
-- Dead-code audit (read-only, adversarially verified each is unreferenced):
--  * send_broker_approved_email() / send_job_order_status_email() — orphaned
--    trigger functions; their triggers were dropped in 0099 and replaced by the
--    consolidated notify_pending_email nudge. No trigger/cron/function calls them.
--  * record_xray(uuid, timestamptz) — old whole-JO X-ray confirm, superseded by
--    the per-van record_van_xray (0087). The Checker UI calls record_van_xray;
--    nothing (code/trigger/policy) calls record_xray.
--  * accreditations — vestigial per-broker consignee-accreditation table disabled
--    by ADR-0007. 0 rows, no FK or code references (the AccreditationStatus type
--    in src is the unrelated consignee-approval status). Its RLS policies +
--    indexes drop with the table.
--  * customers.tour_seen — boolean superseded by tours_seen text[] (0066);
--    never read or written.
-- Forward-only: history is not edited; this new migration removes them.
-- ============================================================

drop function if exists public.send_broker_approved_email();
drop function if exists public.send_job_order_status_email();
drop function if exists public.record_xray(uuid, timestamp with time zone);

drop table if exists public.accreditations cascade;

alter table public.customers drop column if exists tour_seen;
