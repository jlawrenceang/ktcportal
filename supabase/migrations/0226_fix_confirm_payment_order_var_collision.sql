-- ============================================================
-- 0226 — Fix confirm_payment_order: loop-var / table-alias collision (seeded battery, CRITICAL)
--
-- confirm_payment_order declares `c record` (the confirm loop var). The cancelled/rejected
-- guard added in 0222 uses the table alias `public.charges c`, so inside that EXISTS subquery
-- PL/pgSQL binds `c.payment_order_id` / `c.job_order_id` to the still-UNASSIGNED record
-- variable instead of the table → every call raises 'record "c" is not assigned yet' (even on
-- a normal single-charge PO). The cashier's "Collect & confirm" on PaymentOrderDesk therefore
-- always errors; bundled Payment Order collection is non-functional. Anti-fraud still holds
-- (the whole txn rolls back — nothing is confirmed), but the feature never worked since 0222.
--
-- Fix: rename the loop variable `c` -> `rec` so the table alias `c` in the guard resolves
-- to public.charges, not the record. Verbatim re-create of the 0222 F1 body otherwise
-- (reversed/confirmed exclusion + cancelled/rejected guard + final-invoice gate preserved).
-- ============================================================

create or replace function public.confirm_payment_order(p_po uuid, p_or_no text)
returns void language plpgsql security definer set search_path = public as $$
declare rec record;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to confirm collection.'; end if;
  if length(coalesce(trim(p_or_no),'')) = 0 then raise exception 'Enter the collection OR number.' using errcode='check_violation'; end if;
  if exists (select 1 from public.charges c
               left join public.job_orders j     on j.id = c.job_order_id
               left join public.release_orders r on r.id = c.release_order_id
              where c.payment_order_id = p_po and coalesce(j.status, r.status) in ('cancelled','rejected')) then
    raise exception 'A bundled charge belongs to a cancelled or rejected order.' using errcode='check_violation';
  end if;
  if exists (select 1 from public.charges where payment_order_id = p_po
             and (invoice_state <> 'final' or coalesce(trim(erp_invoice_no),'')='' or coalesce(trim(bir_invoice_no),'')='')) then
    raise exception 'Every charge needs its FINAL ERP + BIR invoice before collection.' using errcode='check_violation';
  end if;
  update public.payment_orders set collection_or_no = upper(trim(p_or_no)), status = 'collected',
         payment_status = 'confirmed', payment_confirmed_at = now()
   where id = p_po and status in ('open','submitted');
  if not found then raise exception 'This payment order can''t be collected.'; end if;
  for rec in select id from public.charges where payment_order_id = p_po and payment_status not in ('confirmed','reversed') loop
    update public.charges set payment_status = 'confirmed', payment_confirmed_at = now() where id = rec.id;
    perform public.log_charge_audit(rec.id, 'payment_confirmed', jsonb_build_object('payment_order', p_po, 'or_no', upper(trim(p_or_no))));
  end loop;
end;
$$;
revoke all on function public.confirm_payment_order(uuid, text) from public, anon;
grant execute on function public.confirm_payment_order(uuid, text) to authenticated;

notify pgrst, 'reload schema';
