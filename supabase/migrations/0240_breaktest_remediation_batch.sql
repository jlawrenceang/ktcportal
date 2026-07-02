-- ============================================================
-- 0240 — Sandbox break-test remediation (batch: 5 of 7)
--
-- From docs/audits/2026-07-02-sandbox-breaktest.md. This migration fixes the five
-- contained findings; BT-03 (consignee PII — touches the broker order-display path)
-- and BT-05 (consent-version — a naive server check risks locking customers out on
-- the next agreement bump) are done as separate, carefully-verified changes.
--
--  BT-01 HIGH   release-docs storage bucket had no server-side size/MIME limit —
--               client-only validation, bypassable. Match its peer buckets.
--  BT-02 MEDIUM create_payment_order TOCTOU: the final bundling UPDATE lacked a
--               `payment_order_id is null` predicate → a concurrent cashier could
--               lose-update a charge to another PO, leaving a 'collected' PO with a
--               BIR OR covering zero charges. Make bundling idempotent + all-or-raise.
--  BT-04 MEDIUM request_consignee / resubmit_consignee accepted unbounded text and
--               request_consignee had no per-user cap → table-bloat + bell-spam DoS.
--               Cap every field length + cap pending requests per customer.
--  BT-06 LOW    add_charge could bill an already-'completed' JO (guard blocked only
--               cancelled/rejected). Reject 'completed' too.
--  BT-07 LOW    file_release_order didn't validate a provided consignee id. Validate
--               existence when one is supplied (a release may still be filed without).
-- ============================================================

-- ---------- BT-01: harden the release-docs bucket to match its peers ----------
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','image/heic','image/heif','application/pdf']
 where id = 'release-docs';

-- ---------- BT-02: create_payment_order — idempotent, all-or-raise bundling (recreated from 0229) ----------
create or replace function public.create_payment_order(p_consignee uuid, p_charge_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_po uuid; v_cust uuid; n int;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to create a payment order.'; end if;
  if p_charge_ids is null or array_length(p_charge_ids,1) is null then raise exception 'Select at least one charge.'; end if;
  select count(distinct s.cust), (array_agg(distinct s.cust))[1] into n, v_cust
    from (
      select coalesce(j.customer_id, r.customer_id) as cust
        from public.charges c
        left join public.job_orders j     on j.id = c.job_order_id
        left join public.release_orders r on r.id = c.release_order_id
       where c.id = any(p_charge_ids)
    ) s;
  if n <> 1 then raise exception 'All charges in a payment order must belong to the same customer.' using errcode='check_violation'; end if;
  if exists (
    select 1 from public.charges c
      left join public.job_orders j     on j.id = c.job_order_id
      left join public.release_orders r on r.id = c.release_order_id
     where c.id = any(p_charge_ids)
       and coalesce(j.consignee_id, r.consignee_id) is distinct from p_consignee
  ) then
    raise exception 'All charges in a payment order must belong to the consignee named for it.' using errcode='check_violation';
  end if;
  if exists (select 1 from public.charges c where c.id = any(p_charge_ids)
             and (c.bill_status <> 'billed' or c.payment_status not in ('unpaid','rejected') or c.payment_order_id is not null)) then
    raise exception 'One or more charges can''t be bundled (already paid/submitted/reversed, unbilled, or in another payment order).' using errcode='check_violation';
  end if;
  insert into public.payment_orders (po_number, customer_id, consignee_id, created_by)
  values ('PO-' || lpad(nextval('payment_order_seq')::text, 6, '0'), v_cust, p_consignee, auth.uid())
  returning id into v_po;
  -- BT-02: claim ONLY charges still unbundled, then require EVERY requested charge was claimed.
  -- The non-locking eligibility read above can be stale under READ COMMITTED; if a concurrent
  -- cashier bundled a charge first, the `payment_order_id is null` predicate skips it and the
  -- row_count falls short, so we raise and the whole txn (incl. this PO insert) rolls back — no
  -- silent charge migration, no PO left covering zero charges.
  update public.charges set payment_order_id = v_po
   where id = any(p_charge_ids) and payment_order_id is null;
  get diagnostics n = row_count;
  if n <> (select count(distinct x) from unnest(p_charge_ids) x) then
    raise exception 'One or more of those charges were just bundled or settled by another cashier — refresh and try again.' using errcode='check_violation';
  end if;
  return v_po;
end;
$$;
revoke all on function public.create_payment_order(uuid, uuid[]) from public, anon;
grant execute on function public.create_payment_order(uuid, uuid[]) to authenticated;

-- ---------- BT-06: add_charge — never bill a completed JO (recreated from 0227) ----------
create or replace function public.add_charge(p_jo uuid, p_type text, p_label text, p_qty numeric default 1, p_unit_rate numeric default null, p_vatable boolean default true)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_consignee uuid; v_status text; v_rate numeric; v_amount numeric; v_bill text;
begin
  if not (public.is_admin() or public.has_permission('accept_orders') or public.has_permission('complete_orders')) then
    raise exception 'You don''t have permission to add charges.';
  end if;
  if p_type not in ('service','rps','addon') then raise exception 'Unknown charge type.'; end if;
  if length(coalesce(trim(p_label), '')) = 0 then raise exception 'A charge label is required.' using errcode='check_violation'; end if;
  if length(p_label) > 120 then raise exception 'Charge label is too long.' using errcode='check_violation'; end if;
  if coalesce(p_qty,0) <= 0 or p_qty > 100000 then raise exception 'Enter a valid quantity.' using errcode='check_violation'; end if;
  if p_type = 'addon' and p_unit_rate is not null and p_unit_rate <= 0 then
    raise exception 'A charge amount must be greater than zero.' using errcode='check_violation';
  end if;
  select consignee_id, status into v_consignee, v_status from public.job_orders where id = p_jo;
  if not found then raise exception 'Job order not found.'; end if;
  -- BT-06: a completed (container-released) order must not gain a new ungated bill; re-inspection
  -- billing goes through the re-X-ray child-JO path, not a charge on the closed parent.
  if v_status in ('cancelled','rejected','completed') then
    raise exception 'Can''t add a charge to a % job order.', v_status using errcode='check_violation';
  end if;
  v_rate := case when p_type = 'addon' then coalesce(p_unit_rate, public.effective_rate(v_consignee, p_label))
                 else public.effective_rate(v_consignee, p_label) end;
  v_amount := case when v_rate is null then null else round(v_rate * p_qty, 2) end;
  if v_amount is null or v_amount <= 0 then
    raise exception 'No rate is configured for "%" — set the rate before adding this charge.', trim(p_label) using errcode='check_violation';
  end if;
  v_bill := case when p_type = 'addon' then 'proposed' else 'billed' end;
  insert into public.charges (job_order_id, charge_type, label, qty, unit_rate, amount, vatable, bill_status, created_by)
  values (p_jo, p_type, trim(p_label), p_qty, v_rate, v_amount, coalesce(p_vatable,true), v_bill, auth.uid())
  returning id into v_id;
  perform public.log_charge_audit(v_id, 'created', jsonb_build_object('type',p_type,'label',trim(p_label),'qty',p_qty,'amount',v_amount,'bill_status',v_bill));
  return v_id;
end;
$function$;

-- ---------- BT-07: file_release_order — validate a provided consignee (recreated from 0230) ----------
create or replace function public.file_release_order(p_consignee uuid, p_bl text, p_doc_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cust uuid := public.current_customer_id();
begin
  if v_cust is null or not exists (select 1 from public.customers where id = v_cust and status = 'approved') then
    raise exception 'Your account must be approved to file a release.';
  end if;
  if coalesce(trim(p_bl), '') = '' then raise exception 'A BL number is required.'; end if;
  if length(p_bl) > 60 then raise exception 'BL number is too long.'; end if;
  -- BT-07: a release may be filed with no consignee, but a PROVIDED one must exist.
  if p_consignee is not null and not exists (select 1 from public.consignees where id = p_consignee) then
    raise exception 'Select a valid consignee.' using errcode = 'check_violation';
  end if;
  insert into public.release_orders (release_number, customer_id, consignee_id, bl_number, doc_path, status)
  values ('RO-' || lpad(nextval('release_no_seq')::text, 6, '0'),
          v_cust, p_consignee, upper(trim(p_bl)), nullif(p_doc_path, ''), 'submitted')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.file_release_order(uuid, text, text) from public, anon;
grant execute on function public.file_release_order(uuid, text, text) to authenticated;

-- ---------- BT-04: request_consignee — length caps + per-customer pending cap (recreated from 0230) ----------
create or replace function public.request_consignee(
  p_name text, p_address text default null, p_tin text default null,
  p_doc_2303 text default null, p_doc_2307 text default null,
  p_customer_name text default null, p_address2 text default null,
  p_tel text default null, p_mobile text default null, p_email text default null
)
returns json language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_customer_id(); v_id uuid; v_code text; v_constraint text; v_pending int;
begin
  if v_cust is null then raise exception 'Only customer accounts can request consignees.'; end if;
  if not exists (select 1 from public.customers where id = v_cust and status = 'approved') then
    raise exception 'Your account can''t request consignees until it''s approved.';
  end if;
  -- BT-04: cap pending requests per customer (anti-flood; sibling of open_ticket's 5-open cap).
  select count(*) into v_pending from public.consignees where requested_by = v_cust and status = 'pending';
  if v_pending >= 25 then
    raise exception 'You have 25 consignee requests still awaiting KTC review — please wait for those before requesting more.' using errcode = 'check_violation';
  end if;
  if length(coalesce(trim(p_name), '')) < 2 then
    raise exception 'Enter the consignee name.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_address), '') = '' then
    raise exception 'Enter the business address.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_tin), '') = '' then
    raise exception 'Enter the TIN / VAT Reg #.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_doc_2303), '') = '' then
    raise exception 'Attach the BIR 2303 (Certificate of Registration).' using errcode = 'check_violation';
  end if;
  begin
    -- BT-04: cap every field so a scripted caller can't bloat the table or the staff bell title.
    insert into public.consignees (name, address, tin, doc_2303_path, doc_2307_path,
                                   customer_name, address2, tel, mobile, email,
                                   status, requested_by, requested_at)
    values (left(trim(p_name), 120), left(trim(p_address), 300), left(trim(p_tin), 40),
            left(trim(p_doc_2303), 300),
            nullif(left(trim(coalesce(p_doc_2307, '')), 300), ''),
            nullif(left(trim(coalesce(p_customer_name, '')), 160), ''),
            nullif(left(trim(coalesce(p_address2, '')), 300), ''),
            nullif(left(trim(coalesce(p_tel, '')), 40), ''),
            nullif(left(trim(coalesce(p_mobile, '')), 40), ''),
            nullif(left(trim(coalesce(p_email, '')), 160), ''),
            'pending', v_cust, now())
    returning id, code into v_id, v_code;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'consignees_name_lower_key' then
      raise exception 'A consignee with that name already exists; search for it in the list.'
        using errcode = 'check_violation';
    else
      raise exception 'Couldn''t save this consignee; a record conflict occurred (ref %). Please try again or contact KTC.', coalesce(v_constraint, 'unknown')
        using errcode = 'check_violation';
    end if;
  end;
  perform public.notify_staff('review_consignee_requests', 'consignee',
    'New consignee "' || left(trim(p_name), 80) || '" requested; needs review.', null, null);
  return json_build_object('id', v_id, 'code', v_code, 'name', left(trim(p_name), 120));
end;
$$;
revoke all on function public.request_consignee(text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.request_consignee(text, text, text, text, text, text, text, text, text, text) to authenticated;

-- ---------- BT-04: resubmit_consignee — length caps (recreated from 0230) ----------
create or replace function public.resubmit_consignee(
  p_id uuid,
  p_name text default null, p_address text default null, p_tin text default null,
  p_doc_2303 text default null, p_doc_2307 text default null,
  p_customer_name text default null, p_address2 text default null,
  p_tel text default null, p_mobile text default null, p_email text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_customer_id(); v_hit boolean; v_constraint text;
begin
  if v_cust is null then raise exception 'Only customer accounts can resubmit consignees.'; end if;
  begin
    update public.consignees
       set name          = coalesce(nullif(left(trim(coalesce(p_name, '')), 120), ''), name),
           address       = coalesce(nullif(left(trim(coalesce(p_address, '')), 300), ''), address),
           tin           = coalesce(nullif(left(trim(coalesce(p_tin, '')), 40), ''), tin),
           doc_2303_path = coalesce(nullif(left(trim(coalesce(p_doc_2303, '')), 300), ''), doc_2303_path),
           doc_2307_path = coalesce(nullif(left(trim(coalesce(p_doc_2307, '')), 300), ''), doc_2307_path),
           customer_name = coalesce(nullif(left(trim(coalesce(p_customer_name, '')), 160), ''), customer_name),
           address2      = coalesce(nullif(left(trim(coalesce(p_address2, '')), 300), ''), address2),
           tel           = coalesce(nullif(left(trim(coalesce(p_tel, '')), 40), ''), tel),
           mobile        = coalesce(nullif(left(trim(coalesce(p_mobile, '')), 40), ''), mobile),
           email         = coalesce(nullif(left(trim(coalesce(p_email, '')), 160), ''), email),
           status = 'pending', note = null, requested_at = now()
     where id = p_id and requested_by = v_cust and status in ('needs_info', 'rejected');
    v_hit := found;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'consignees_name_lower_key' then
      raise exception 'A consignee with that name already exists; search for it in the list.'
        using errcode = 'check_violation';
    else
      raise exception 'Couldn''t save this consignee; a record conflict occurred (ref %). Please try again or contact KTC.', coalesce(v_constraint, 'unknown')
        using errcode = 'check_violation';
    end if;
  end;
  if not v_hit then raise exception 'Request not found or not editable.'; end if;
end;
$$;
revoke all on function public.resubmit_consignee(uuid, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.resubmit_consignee(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
