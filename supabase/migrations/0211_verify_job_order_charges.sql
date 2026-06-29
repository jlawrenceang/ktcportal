-- ============================================================
-- 0211 — Public charge-authenticity RPC for the verify-QR page (anti-fraud)
--        (ADR-0037 Phase A; owner 2026-06-29)
--
-- The public /verify/:id page (anon, no login) shows the AUTHORITATIVE charges on a
-- job order so a customer holding a paper invoice can confirm the amounts + paid
-- state — a forged or copied invoice with inflated/extra charges won't match. Mirrors
-- the existing public verify_job_order (0089/0090): SECURITY DEFINER, anon-granted,
-- keyed by the unguessable JO uuid. We deliberately DO NOT expose the raw ERP/BIR
-- control numbers publicly (only whether the invoice is final + the payment state) —
-- matching the amount + paid status is the anti-fraud check; publishing the serials
-- would just hand a forger real numbers to copy.
-- ============================================================

create or replace function public.verify_job_order_charges(p_id uuid)
returns table(
  label          text,
  charge_type    text,
  qty            numeric,
  unit_rate      numeric,
  amount         numeric,
  vatable        boolean,
  invoice_state  text,
  payment_status text
)
language sql security definer set search_path = public stable as $$
  select c.label, c.charge_type, c.qty, c.unit_rate, c.amount, c.vatable, c.invoice_state, c.payment_status
    from public.charges c
   where c.job_order_id = p_id
     and c.bill_status = 'billed'          -- only real, approved charges (no proposed/cancelled)
   order by c.created_at;
$$;

revoke all on function public.verify_job_order_charges(uuid) from public;
grant execute on function public.verify_job_order_charges(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
