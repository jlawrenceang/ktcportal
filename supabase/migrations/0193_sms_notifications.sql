-- ============================================================
-- 0193 — SMS notifications (transactional, dormant scaffold) — owner, 2026-06-29
--
-- A 4th notification channel beside in-app + email + web push. A HIGH-VALUE
-- customer notification (order on hold / completed, payment confirmed/rejected,
-- release bill-ready / cleared) also fires a text to the customer's contact
-- number — via android-sms-gateway (a dedicated phone + SIM), through the
-- send-sms Edge Function (scripts/setup-sms.mjs deploys it + writes the Vault
-- sms_url / sms_secret rows).
--
-- DORMANT until those Vault rows exist (silent no-op) — exactly like web-push
-- (0114), so this is safe to apply before any gateway is connected. pg_net is
-- async fire-and-forget, so an SMS failure NEVER blocks the notification insert
-- (low blast radius). SMS is selective (a whitelist) — unlike push, which fires
-- on every notification — because a text is costlier + more intrusive.
-- ============================================================

create extension if not exists pg_net;

-- ---------- per-customer opt-out ----------
-- Transactional SMS is opt-in by default (service messages, not marketing);
-- this lets a customer turn it off. Respected by the trigger below.
alter table public.customers add column if not exists sms_opt_out boolean not null default false;

-- A customer sets their OWN preference (definer → avoids the protected-fields guard).
create or replace function public.set_sms_opt_out(p_opt_out boolean)
returns void language sql security definer set search_path = public as $$
  update public.customers set sms_opt_out = coalesce(p_opt_out, false) where user_id = auth.uid();
$$;
revoke all on function public.set_sms_opt_out(boolean) from public, anon;
grant execute on function public.set_sms_opt_out(boolean) to authenticated;

-- ---------- PH mobile → E.164 (+639XXXXXXXXX), or null if unparseable ----------
create or replace function public.ph_e164(p_raw text)
returns text language plpgsql immutable set search_path = public as $$
declare d text;
begin
  if p_raw is null then return null; end if;
  d := regexp_replace(p_raw, '\D', '', 'g');                                -- digits only
  -- require the PH mobile "9" subscriber prefix so we never emit a malformed +63.
  if d like '639%' and length(d) = 12 then return '+' || d; end if;          -- 639XXXXXXXXX
  if d like '09%'  and length(d) = 11 then return '+63' || substring(d from 2); end if; -- 09XXXXXXXXX
  if d like '9%'   and length(d) = 10 then return '+63' || d; end if;        -- 9XXXXXXXXX
  return null;
end $$;

-- ---------- trigger: high-value customer notification → SMS the owning customer ----------
create or replace function public.sms_on_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text; v_phone text; v_optout boolean; v_to text;
begin
  -- Whitelist the "you must act" + "it's decided / ready" moments only
  -- (edit this list to tune which events text the customer).
  if new.kind not in ('on_hold','rejected','completed','payment_confirmed','payment_rejected',
                      'release_payable','release_on_hold','release_rejected','release_released') then
    return new;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'sms_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sms_secret';
  if v_url is null or v_secret is null then return new; end if;             -- dormant until configured

  select contact_number, sms_opt_out into v_phone, v_optout
    from public.customers where id = new.customer_id;
  if coalesce(v_optout, false) then return new; end if;
  v_to := public.ph_e164(v_phone);
  if v_to is null then return new; end if;                                  -- no usable mobile

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('x-sms-secret', v_secret, 'Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'to', jsonb_build_array(v_to),
      'message', left('KTC Online Portal: ' || coalesce(new.title, 'You have an update.'), 320)
    )
  );
  return new;
end $$;
revoke all on function public.sms_on_notification() from public, anon, authenticated;

drop trigger if exists notifications_sms on public.notifications;
create trigger notifications_sms after insert on public.notifications
  for each row execute function public.sms_on_notification();
