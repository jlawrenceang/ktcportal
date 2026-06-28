-- ============================================================
-- 0194 — Release-supplement payment can't be paid/confirmed on a TERMINAL release
--
-- BUG (v1.7.0 ship-review, money): a `payable` release carrying an UNPAID
-- supplement can be cancelled — cancel_release_order (0131) only blocks a
-- 'submitted'/'confirmed' supplement, so an unpaid one doesn't block, and the
-- supplement row survives the cancel. Neither submit_ nor confirm_release_
-- supplement_payment checked the parent release status, so a real customer
-- payment could be submitted AND confirmed against a CANCELLED release — money
-- confirmed with no OR and no in-app refund trail. The release-side twin of the
-- JO fix in 0186 (KTC-34) and the base-release fix in 0178.
--
-- Fix: both RPCs now reject when the parent release is terminal (cancelled or
-- released). Recreated verbatim from 0125 / 0159 with ONLY the guard added.
-- ============================================================

-- submit (customer) — recreated from 0125 + the parent-status condition on the EXISTS.
create or replace function public.submit_release_supplement_payment(p_id uuid, p_proof_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.release_supplements s
     set payment_status = 'submitted', payment_proof_path = nullif(p_proof_path, ''),
         payment_submitted_at = now(), payment_note = null
   where s.id = p_id
     and s.payment_status in ('unpaid', 'rejected')
     and exists (select 1 from public.release_orders r
                 where r.id = s.release_order_id and r.customer_id = public.current_broker_id()
                   and r.status not in ('cancelled', 'released'));
  if not found then raise exception 'This charge is not awaiting payment.'; end if;
end;
$$;

-- confirm (cashier) — recreated from 0159 + an explicit parent-status guard.
create or replace function public.confirm_release_supplement_payment(p_id uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_rel_status text;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to review payments.'; end if;
  if not p_ok and length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'Add a note telling the customer why the payment was rejected.';
  end if;
  -- the parent release must not be terminal, or a payment would be confirmed
  -- against a closed order with no OR / no refund path.
  select r.status into v_rel_status
    from public.release_supplements s
    join public.release_orders r on r.id = s.release_order_id
   where s.id = p_id;
  if v_rel_status in ('cancelled', 'released') then
    raise exception 'This release is %, so its additional charge can no longer be confirmed.', v_rel_status;
  end if;
  update public.release_supplements
     set payment_status       = case when p_ok then 'confirmed' else 'rejected' end,
         payment_confirmed_at = case when p_ok then now() else payment_confirmed_at end,
         payment_note         = case when p_ok then null else nullif(trim(p_note), '') end
   where id = p_id and payment_status = 'submitted';
  if not found then raise exception 'There is no payment to review for this charge.'; end if;
end;
$$;

-- Grants/revokes are preserved by CREATE OR REPLACE; re-assert (idempotent) to match 0125/0159.
revoke all on function public.submit_release_supplement_payment(uuid, text)           from public, anon;
revoke all on function public.confirm_release_supplement_payment(uuid, boolean, text) from public, anon;
grant execute on function public.submit_release_supplement_payment(uuid, text)           to authenticated;
grant execute on function public.confirm_release_supplement_payment(uuid, boolean, text) to authenticated;
