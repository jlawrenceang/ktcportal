-- ============================================================
-- 0018 — auto-reject brokers who confirm their email but never upload a
-- valid ID within 48 hours. Keyed on the BROKER's own inaction (no ID),
-- not on admin-approval latency, so we never punish someone waiting on an
-- admin. Rejecting them cascades to cancelling their held orders via the
-- on_broker_approved_release trigger (migration 0017).
--
-- Runs hourly via pg_cron, so the 48h cutoff is enforced within ~1 hour.
-- ============================================================

create extension if not exists pg_cron;

create or replace function public.expire_unverified_brokers()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with expired as (
    update public.brokers
       set status = 'rejected',
           decided_at = now(),
           decision_reason = 'Verification not completed within 48 hours — no valid ID was uploaded. Please register again to continue.'
     where status = 'pending'
       and email_confirmed_at is not null
       and email_confirmed_at < now() - interval '48 hours'
       and valid_id_path is null
    returning 1
  )
  select count(*) into n from expired;
  return n;
end;
$$;

-- (Re)schedule the hourly sweep idempotently.
do $$
begin
  perform cron.unschedule('expire-unverified-brokers');
exception when others then null;
end $$;

select cron.schedule('expire-unverified-brokers', '0 * * * *', $$ select public.expire_unverified_brokers(); $$);
