-- ============================================================
-- 0042 — gap fix G8: payment-rejected email.
--
-- A rejected payment proof was in-app only and could sit unseen; it's an
-- ACTION-REQUIRED event, so it joins the lean email set (on_hold / rejected).
-- Confirmations stay in-app (auto-poll surfaces them) to protect the Resend
-- free-tier budget.
--
-- Refactor: the branded template + vault lookup + http_post move into one
-- reusable helper (send_portal_email, server-only) so the status trigger and
-- the new payment branch share it instead of duplicating 60 lines of HTML.
-- ============================================================

-- 1) Shared sender. Server-only (triggers call it); mail failure never
--    bubbles up — the calling transaction must not roll back over email.
create or replace function public.send_portal_email(
  p_to text, p_name text, p_subject text, p_headline text,
  p_body_html text, p_url text, p_cta text
)
returns void language plpgsql security definer set search_path = public, vault, net as $fn$
declare
  v_key text; v_from text; v_html text;
begin
  -- Skip missing addresses and synthetic staff accounts (not deliverable).
  if p_to is null or p_to like '%@ktc-staff.local' then return; end if;

  begin
    select decrypted_secret into v_key  from vault.decrypted_secrets where name = 'resend_api_key';
    select decrypted_secret into v_from from vault.decrypted_secrets where name = 'resend_from';
  exception when others then v_key := null;
  end;
  if v_key is null then
    raise notice 'send_portal_email: no resend_api_key — skipping for %', p_to;
    return;
  end if;
  if v_from is null then v_from := 'KTC Container Terminal <noreply@ktcterminal.com>'; end if;

  v_html := '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f2f5;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">'
         || '<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e6e7ea;overflow:hidden;">'
         || '<tr><td style="padding:28px 32px 8px;"><img src="https://portal.ktcterminal.com/ktc-logo.png" alt="KTC Container Terminal Corp" height="44" style="display:block;border:0;" /></td></tr>'
         || '<tr><td style="padding:8px 32px 0;"><h1 style="margin:0;font-size:21px;font-weight:600;letter-spacing:-0.02em;color:#1a1c1f;">' || p_headline || '</h1>'
         || '<p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#4b4f56;">Hi ' || coalesce(nullif(trim(p_name), ''), 'there') || ', ' || p_body_html || '</p></td></tr>'
         || '<tr><td style="padding:24px 32px 8px;"><a href="' || p_url || '" style="display:inline-block;background:#F26A21;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:10px;">' || p_cta || '</a></td></tr>'
         || '<tr><td style="padding:8px 32px 28px;"><p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8a8f98;">If the button doesn''t work, copy this link:<br/><a href="' || p_url || '" style="color:#D6321E;word-break:break-all;">' || p_url || '</a></p></td></tr>'
         || '</table><p style="max-width:480px;margin:16px auto 0;font-size:11px;color:#a0a4ab;text-align:center;">KTC Container Terminal Corp. &middot; portal.ktcterminal.com</p></td></tr></table>';

  begin
    perform net.http_post(
      url     := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
      body    := jsonb_build_object('from', v_from, 'to', p_to, 'subject', p_subject, 'html', v_html)
    );
  exception when others then
    raise notice 'send_portal_email: http_post failed for %: %', p_to, sqlerrm;
  end;
end;
$fn$;

revoke all on function public.send_portal_email(text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- 2) Status email trigger now also covers payment_status -> 'rejected'.
create or replace function public.send_job_order_status_email()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_email text; v_name text;
  v_jo text := coalesce(new.jo_number, 'your job order');
begin
  -- One lookup serves whichever branches fire below.
  select email, full_name into v_email, v_name
    from public.customers where id = new.customer_id;

  -- Action-required status transitions only; never on insert or same-status updates.
  if new.status in ('on_hold','rejected') and old.status is distinct from new.status then
    if new.status = 'on_hold' then
      perform public.send_portal_email(
        v_email, v_name,
        'Action needed on ' || v_jo || ' — information required',
        'We need a little more information',
        'Your job order <strong>' || v_jo || '</strong> is on hold. A KTC admin left this note:'
          || '<br/><br/><em>' || coalesce(new.admin_note, '(no note)') || '</em><br/><br/>'
          || 'Open the portal to update the order and resubmit it — processing resumes as soon as you do.',
        'https://portal.ktcterminal.com/job-orders', 'Open My Job Orders');
    else
      perform public.send_portal_email(
        v_email, v_name,
        v_jo || ' was rejected' || case when new.rejected_recoverable then ' — you can fix and resubmit' else '' end,
        'Job order rejected',
        'Your job order <strong>' || v_jo || '</strong> was rejected. Reason from KTC:'
          || '<br/><br/><em>' || coalesce(new.admin_note, '(no note)') || '</em><br/><br/>'
          || case when new.rejected_recoverable
               then 'You can fix the issue and <strong>resubmit the same order</strong> from the portal.'
               else 'This order is closed — if needed, please file a new job order from the portal.'
             end,
        'https://portal.ktcterminal.com/job-orders', 'Open My Job Orders');
    end if;
  end if;

  -- G8: rejected payment proof — the customer must re-upload.
  if new.payment_status = 'rejected' and old.payment_status is distinct from new.payment_status then
    perform public.send_portal_email(
      v_email, v_name,
      'Payment proof for ' || v_jo || ' needs another look',
      'Payment proof rejected',
      'The payment slip you uploaded for <strong>' || v_jo || '</strong> couldn''t be accepted. Note from KTC:'
        || '<br/><br/><em>' || coalesce(new.payment_note, '(no note)') || '</em><br/><br/>'
        || 'Please check the note and upload a corrected slip — or settle at the KTC cashier as usual.',
      'https://portal.ktcterminal.com/job-order/' || new.id || '/pay', 'Fix my payment');
  end if;

  return new;
end;
$fn$;

drop trigger if exists on_job_order_status_email on public.job_orders;
create trigger on_job_order_status_email
  after update of status, payment_status on public.job_orders
  for each row execute function public.send_job_order_status_email();
