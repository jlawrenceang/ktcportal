-- ============================================================
-- 0191 — Phase 3 Batch 3A: dead-code cleanup (DB drops)
--        (owner, 2026-06-28)
--
-- Retires orphaned / unreachable backend objects flagged by the 2026-06-28
-- audit (T3 tier). Every drop is idempotent and safe — no live caller, trigger,
-- or cron references the objects removed here. The now-serving board (Batch 3B)
-- is built separately; now_serving() is intentionally untouched.
-- ============================================================

-- T3-08 — unlisted-vessel auto-request trigger (0068) never fires anymore: both
-- JO filing paths always send a resolved vessel_visit, and customer vessel-
-- requests were retired in 0190 (request_vessel/resubmit/my_vessel_requests all
-- raise; the admin review panel was removed). The trigger function has no other
-- use (only this trigger referenced it), so drop both.
drop trigger if exists job_orders_request_vessel on public.job_orders;
drop function if exists public.request_vessel_on_unlisted();

-- T3-11 — notify_serving_assigned() is dead: 0151 dropped its trigger
-- (serving_numbers_notify) when the customer serving notification was retired;
-- 0178 recreated the FUNCTION but never recreated a trigger, leaving an
-- orphaned definer function with no caller. cascade in case any dependency lingers.
drop function if exists public.notify_serving_assigned() cascade;

-- T3-38 — the 'gcash_number' payment_info row (seeded 0036) has no editor and no
-- consumer: Settings.tsx filters it out of the editor and no payment page renders
-- it (all e-wallets route through the QRPH QR). Delete the orphaned row.
delete from public.payment_info where key = 'gcash_number';

-- T3-12 — 'under_review' is a no-op token in the notify_pending_email() email
-- whitelist (0099): nothing ever inserts a notification of kind 'under_review',
-- so it never gates an email. Recreate the function VERBATIM minus that token.
-- (create or replace keeps the existing notifications_pending_email trigger.)
create or replace function public.notify_pending_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text; v_name text; v_unread int;
begin
  -- Only nudge for items that need the customer to DO something; informational
  -- kinds (serving #, completed, approved, announcement, payment confirmed) don't.
  if new.kind not in ('on_hold','rejected','payment_rejected','payment_reminder','comment','support_reply','rps') then
    return new;
  end if;
  if not public.emails_enabled() then return new; end if;
  -- Dedup: only email when this is the customer's FIRST unread notification, so
  -- there's one nudge per batch (no further email until they clear them).
  select count(*) into v_unread from public.notifications
    where customer_id = new.customer_id and read_at is null;
  if v_unread <> 1 then return new; end if;

  select email, full_name into v_email, v_name from public.customers where id = new.customer_id;
  if v_email is null then return new; end if;

  perform public.send_portal_email(
    v_email, v_name,
    'You have a notification in the KTC portal',
    'Action needed',
    'You have a notification that needs your attention in the KTC Online Portal. Please log in to view it and take action.<br/><br/>For your security the details aren''t included here — just sign in and your notifications will be waiting.',
    'https://portal.ktcterminal.com/', 'Open the portal');
  return new;
end;
$$;
-- Definer trigger functions must not be EXECUTE-able by callers (0105 invariant).
revoke all on function public.notify_pending_email() from public, anon, authenticated;
