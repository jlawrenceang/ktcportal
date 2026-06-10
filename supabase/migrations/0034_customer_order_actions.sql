-- ============================================================
-- 0034 — close the job-order lifecycle loops (P0) + lean status emails.
--
-- Customers get three actions on their OWN orders, via SECURITY DEFINER RPCs
-- (no broad UPDATE policy — each RPC checks ownership + the exact transition):
--   * respond_to_hold(id, note, entry?)  on_hold  -> submitted  (+ reply note)
--   * resubmit_rejected(id, note?)       rejected -> submitted  (only if the
--     admin marked the rejection recoverable; re-checks the open-order cap)
--   * cancel_job_order(id)               held|submitted|on_hold -> cancelled
--     (not 'processing' — admin is already working it; contact admin instead)
--
-- New columns:
--   * customer_note          — customer's reply, shown to admins
--   * rejected_recoverable   — admin's choice at reject time (default true);
--     false = terminal (customer must file a new order)
--
-- Status emails (lean set per 2026-06-11 decision — ACTION-REQUIRED ONLY):
--   * on_hold  -> "information needed" email
--   * rejected -> "order rejected" email (says whether it can be resubmitted)
--   completed/processing are in-app only (auto-poll surfaces them) to stay
--   well inside the Resend free tier. Same vault/pg_net pattern as 0015;
--   mail failure never rolls back the status change.
-- ============================================================

alter table public.job_orders add column if not exists customer_note text;
alter table public.job_orders add column if not exists rejected_recoverable boolean not null default true;

-- ---------- customer actions ----------

create or replace function public.respond_to_hold(p_id uuid, p_note text, p_entry_number text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.job_orders%rowtype;
begin
  if length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'Please describe what you updated or clarified.' using errcode = 'check_violation';
  end if;
  select * into v_row from public.job_orders
    where id = p_id and customer_id = public.current_broker_id() for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_row.status <> 'on_hold' then
    raise exception 'Only orders on hold can be resubmitted this way.';
  end if;
  update public.job_orders
  set status = 'submitted',
      customer_note = trim(p_note),
      entry_number = coalesce(nullif(trim(p_entry_number), ''), entry_number)
  where id = p_id;
end;
$$;

create or replace function public.resubmit_rejected(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_row public.job_orders%rowtype;
  cnt int;
begin
  select * into v_row from public.job_orders
    where id = p_id and customer_id = public.current_broker_id() for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_row.status <> 'rejected' then
    raise exception 'Only rejected orders can be resubmitted.';
  end if;
  if not v_row.rejected_recoverable then
    raise exception 'This order was closed by KTC and can''t be resubmitted — please file a new job order.';
  end if;
  -- Re-entering the queue takes an open slot: same cap + lock as enforce_order_caps.
  perform pg_advisory_xact_lock(hashtext('jo_caps:' || v_row.customer_id::text));
  select count(*) into cnt from public.job_orders
    where customer_id = v_row.customer_id and status in ('submitted','processing','on_hold');
  if cnt >= 10 then
    raise exception 'You have 10 open job orders — contact KTC admin to file more.' using errcode = 'check_violation';
  end if;
  update public.job_orders
  set status = 'submitted',
      customer_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id;
end;
$$;

create or replace function public.cancel_job_order(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.job_orders%rowtype;
begin
  select * into v_row from public.job_orders
    where id = p_id and customer_id = public.current_broker_id() for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_row.status not in ('held','submitted','on_hold') then
    raise exception 'This order can''t be cancelled anymore — it''s already being processed. Please contact KTC admin.';
  end if;
  update public.job_orders set status = 'cancelled' where id = p_id;
end;
$$;

revoke all on function public.respond_to_hold(uuid, text, text) from public, anon;
revoke all on function public.resubmit_rejected(uuid, text) from public, anon;
revoke all on function public.cancel_job_order(uuid) from public, anon;
grant execute on function public.respond_to_hold(uuid, text, text) to authenticated;
grant execute on function public.resubmit_rejected(uuid, text) to authenticated;
grant execute on function public.cancel_job_order(uuid) to authenticated;

-- ---------- lean status emails (on_hold / rejected only) ----------

create or replace function public.send_job_order_status_email()
returns trigger language plpgsql security definer set search_path = public, vault, net as $fn$
declare
  v_key text; v_from text;
  v_email text; v_name text;
  v_subject text; v_headline text; v_body text; v_html text;
  v_url text := 'https://portal.ktcterminal.com/job-orders';
  v_jo text := coalesce(new.jo_number, 'your job order');
begin
  -- Action-required transitions only; never on insert or same-status updates.
  if new.status not in ('on_hold','rejected') or old.status is not distinct from new.status then
    return new;
  end if;

  select email, coalesce(nullif(trim(full_name), ''), 'there')
    into v_email, v_name
    from public.customers where id = new.customer_id;
  -- Skip missing addresses and synthetic staff accounts (not deliverable).
  if v_email is null or v_email like '%@ktc-staff.local' then return new; end if;

  begin
    select decrypted_secret into v_key  from vault.decrypted_secrets where name = 'resend_api_key';
    select decrypted_secret into v_from from vault.decrypted_secrets where name = 'resend_from';
  exception when others then v_key := null;
  end;
  if v_key is null then
    raise notice 'send_job_order_status_email: no resend_api_key — skipping for %', v_email;
    return new;
  end if;
  if v_from is null then v_from := 'KTC Container Terminal <noreply@ktcterminal.com>'; end if;

  if new.status = 'on_hold' then
    v_subject  := 'Action needed on ' || v_jo || ' — information required';
    v_headline := 'We need a little more information';
    v_body     := 'Your job order <strong>' || v_jo || '</strong> is on hold. A KTC admin left this note:'
               || '<br/><br/><em>' || coalesce(new.admin_note, '(no note)') || '</em><br/><br/>'
               || 'Open the portal to update the order and resubmit it — processing resumes as soon as you do.';
  else
    v_subject  := v_jo || ' was rejected' || case when new.rejected_recoverable then ' — you can fix and resubmit' else '' end;
    v_headline := 'Job order rejected';
    v_body     := 'Your job order <strong>' || v_jo || '</strong> was rejected. Reason from KTC:'
               || '<br/><br/><em>' || coalesce(new.admin_note, '(no note)') || '</em><br/><br/>'
               || case when new.rejected_recoverable
                    then 'You can fix the issue and <strong>resubmit the same order</strong> from the portal.'
                    else 'This order is closed — if needed, please file a new job order from the portal.'
                  end;
  end if;

  v_html := '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f2f5;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">'
         || '<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e6e7ea;overflow:hidden;">'
         || '<tr><td style="padding:28px 32px 8px;"><img src="https://portal.ktcterminal.com/ktc-logo.png" alt="KTC Container Terminal Corp" height="44" style="display:block;border:0;" /></td></tr>'
         || '<tr><td style="padding:8px 32px 0;"><h1 style="margin:0;font-size:21px;font-weight:600;letter-spacing:-0.02em;color:#1a1c1f;">' || v_headline || '</h1>'
         || '<p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#4b4f56;">Hi ' || v_name || ', ' || v_body || '</p></td></tr>'
         || '<tr><td style="padding:24px 32px 8px;"><a href="' || v_url || '" style="display:inline-block;background:#F26A21;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:10px;">Open My Job Orders</a></td></tr>'
         || '<tr><td style="padding:8px 32px 28px;"><p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8a8f98;">If the button doesn''t work, copy this link:<br/><a href="' || v_url || '" style="color:#D6321E;word-break:break-all;">' || v_url || '</a></p></td></tr>'
         || '</table><p style="max-width:480px;margin:16px auto 0;font-size:11px;color:#a0a4ab;text-align:center;">KTC Container Terminal Corp. &middot; portal.ktcterminal.com</p></td></tr></table>';

  begin
    perform net.http_post(
      url     := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
      body    := jsonb_build_object('from', v_from, 'to', v_email, 'subject', v_subject, 'html', v_html)
    );
  exception when others then
    raise notice 'send_job_order_status_email: http_post failed for %: %', v_email, sqlerrm;
  end;

  return new;
end;
$fn$;

drop trigger if exists on_job_order_status_email on public.job_orders;
create trigger on_job_order_status_email after update of status on public.job_orders
  for each row execute function public.send_job_order_status_email();
