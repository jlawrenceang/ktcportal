-- ============================================================
-- 0208 — Consignee PII-scoped search + editors + monthly reconciliation
--        (owner 2026-06-29, decisions #3, #2, #7, #4)
--
-- All additive. The picker switches to search_consignees in M3; the broad
-- consignee read policy is tightened at the M4 cutover (so the live picker
-- doesn't break mid-build).
-- ============================================================

-- (#3) Broker-facing consignee search: returns ONLY id/code/name (no TIN/contact),
-- min 2 chars + capped at 20 rows to block bulk scraping. Filing stays open.
create or replace function public.search_consignees(p_q text)
returns table(id uuid, code text, name text)
language sql security definer set search_path = public stable as $$
  select c.id, c.code, c.name
    from public.consignees c
   where c.status = 'approved'
     and length(coalesce(trim(p_q), '')) >= 2
     and (c.name ilike '%' || trim(p_q) || '%' or c.code ilike trim(p_q) || '%')
   order by c.name
   limit 20;
$$;

-- (#2) Admin editor for per-consignee special rates.
create or replace function public.set_consignee_rate_override(
  p_consignee uuid, p_service text, p_rate numeric, p_active boolean default true, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can set special rates.'; end if;
  if p_consignee is null or length(coalesce(trim(p_service),'')) = 0 then raise exception 'Consignee and service are required.' using errcode='check_violation'; end if;
  if p_rate is null or p_rate < 0 then raise exception 'Enter a valid rate.' using errcode='check_violation'; end if;
  insert into public.consignee_rate_overrides (consignee_id, service, rate, active, note, updated_by, updated_at)
  values (p_consignee, trim(p_service), p_rate, coalesce(p_active,true), nullif(trim(p_note),''), auth.uid(), now())
  on conflict (consignee_id, service)
    do update set rate = excluded.rate, active = excluded.active, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- (#7) Admin editor + read helper for per-event notification channel.
create or replace function public.set_notification_channel(p_event text, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can change notification routing.'; end if;
  if p_channel not in ('email','sms','both','off') then raise exception 'Channel must be email, sms, both, or off.' using errcode='check_violation'; end if;
  update public.notification_settings set channel = p_channel, updated_by = auth.uid(), updated_at = now() where event_type = p_event;
  if not found then raise exception 'Unknown notification event.'; end if;
end;
$$;

-- Send-time routing helper (read by the email/SMS dispatch paths; wired in M3/cutover).
create or replace function public.notification_channel(p_event text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select channel from public.notification_settings where event_type = p_event), 'email');
$$;

-- (#4) Monthly reconciliation — admin-only (a plain view would bypass RLS and leak
-- revenue to brokers, so it's a gated function). containers × rate ≈ cash collected.
create or replace function public.get_xray_monthly_reconciliation()
returns table(month date, job_orders bigint, containers bigint, billed_total numeric, collected_total numeric)
language sql security definer set search_path = public stable as $$
  with jo as (
    select j.id,
           date_trunc('month', timezone('Asia/Manila', j.created_at))::date as month,
           (select count(*) from public.job_order_lines l where l.job_order_id = j.id) as containers,
           (select coalesce(sum(amount),0) from public.charges c where c.job_order_id = j.id and c.bill_status = 'billed') as billed,
           (select coalesce(sum(amount),0) from public.charges c where c.job_order_id = j.id and c.payment_status = 'confirmed') as collected
      from public.job_orders j
     where public.is_admin()                 -- gate: non-admins get zero rows
  )
  select month, count(*)::bigint, sum(containers)::bigint, sum(billed), sum(collected)
    from jo group by month order by month desc;
$$;

revoke all on function public.search_consignees(text)                                   from public, anon;
revoke all on function public.set_consignee_rate_override(uuid, text, numeric, boolean, text) from public, anon;
revoke all on function public.set_notification_channel(text, text)                      from public, anon;
revoke all on function public.notification_channel(text)                                from public, anon;
revoke all on function public.get_xray_monthly_reconciliation()                         from public, anon;
grant execute on function public.search_consignees(text)                                to authenticated;
grant execute on function public.set_consignee_rate_override(uuid, text, numeric, boolean, text) to authenticated;
grant execute on function public.set_notification_channel(text, text)                   to authenticated;
grant execute on function public.notification_channel(text)                             to authenticated;
grant execute on function public.get_xray_monthly_reconciliation()                      to authenticated;

notify pgrst, 'reload schema';
