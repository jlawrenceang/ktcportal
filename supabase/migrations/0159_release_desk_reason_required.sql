-- 0159: Server-enforce the release-desk hold/reject reason (closes ST05 Defect D-01).
-- The JO side (hold_job_order) RAISES when the staff note is blank, but the three
-- release-desk RPCs only ran `nullif(trim(p_note), '')`, silently storing NULL on a
-- blank reject/hold — so a scripted client could hold or reject a customer's release
-- with no explanation. The UI already disables the buttons until a note is typed;
-- this adds the matching server guard (defense-in-depth) so the reason is required
-- on the reject/hold branch (p_ok = false). The approve branch (p_ok = true) needs
-- no note and is unchanged. Signatures are identical, so existing grants persist.

-- 1) Documents desk — hold for a corrected doc requires a reason.
create or replace function public.verify_release_order(p_id uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('verify_release_docs') then raise exception 'You don''t have permission to verify release documents.'; end if;
  if not p_ok and length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'Add a note telling the customer what needs correcting.';
  end if;
  update public.release_orders
     set status      = case when p_ok then 'docs_verified' else 'on_hold' end,
         verified_at = case when p_ok then now() else verified_at end,
         verified_by = case when p_ok then auth.uid() else verified_by end,
         staff_note  = case when p_ok then null else nullif(trim(p_note), '') end
   where id = p_id and status in ('submitted', 'on_hold');
  if not found then raise exception 'This release is not awaiting document verification.'; end if;
end;
$$;

-- 2) Cashier — rejecting a payment proof requires a reason.
create or replace function public.confirm_release_payment(p_id uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to review payments.'; end if;
  if not p_ok and length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'Add a note telling the customer why the payment was rejected.';
  end if;
  update public.release_orders
     set payment_status       = case when p_ok then 'confirmed' else 'rejected' end,
         payment_confirmed_at = case when p_ok then now() else payment_confirmed_at end,
         payment_note         = case when p_ok then null else nullif(trim(p_note), '') end,
         status               = case when p_ok then 'paid' else status end
   where id = p_id and payment_status = 'submitted';
  if not found then raise exception 'There is no payment to review for this release.'; end if;
end;
$$;

-- 3) Cashier — rejecting an additional-charge payment proof requires a reason.
create or replace function public.confirm_release_supplement_payment(p_id uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to review payments.'; end if;
  if not p_ok and length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'Add a note telling the customer why the payment was rejected.';
  end if;
  update public.release_supplements
     set payment_status       = case when p_ok then 'confirmed' else 'rejected' end,
         payment_confirmed_at = case when p_ok then now() else payment_confirmed_at end,
         payment_note         = case when p_ok then null else nullif(trim(p_note), '') end
   where id = p_id and payment_status = 'submitted';
  if not found then raise exception 'There is no payment to review for this charge.'; end if;
end;
$$;
