-- ============================================================
-- 0132 — customer-requested consignees (owner, 2026-06-22)
--
-- Mirrors the vessel "not listed -> request" flow for CONSIGNEES: a customer who
-- can't find their consignee requests a new one (name + address + TIN + BIR 2303
-- required, 2307 optional). It is created as a PENDING consignee (reusing the
-- existing approval machine, 0008/0120) and is usable IMMEDIATELY to file
-- (file-now; KTC verifies the BIR docs in parallel — same spirit as vessels).
-- KTC approves/rejects in the existing admin Consignees screen; the requester is
-- notified either way.
-- ============================================================

-- 1) New columns on consignees.
alter table public.consignees add column if not exists doc_2307_path text;
alter table public.consignees add column if not exists requested_by  uuid references public.customers(id);
alter table public.consignees add column if not exists requested_at  timestamptz;
alter table public.consignees add column if not exists note          text;  -- review note (esp. rejection reason, shown to the requester)

-- 2) RLS: customers see approved consignees AND their OWN pending request
--    (so the picker can show/keep the consignee they just requested). Rejected
--    requests are hidden from the picker — the requester learns via notification.
drop policy if exists "approved consignees readable" on public.consignees;
create policy "approved consignees readable" on public.consignees
  for select to authenticated using (
    status = 'approved'
    or public.is_admin()
    or (requested_by = public.current_broker_id() and status = 'pending')
  );

-- 3) Storage: let a customer upload + read their OWN consignee-request docs
--    (folder = their auth uid). Admin keeps full access via the 0009 policy.
drop policy if exists "customer uploads own consignee doc" on storage.objects;
create policy "customer uploads own consignee doc" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'consignee-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "customer reads own consignee doc" on storage.objects;
create policy "customer reads own consignee doc" on storage.objects
  for select to authenticated
  using (bucket_id = 'consignee-docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4) RPC: a customer requests a new consignee. SECURITY DEFINER so it can insert
--    a pending consignee (customers have no direct INSERT on the table). 2303 is
--    required; 2307 optional. Returns the new id/code/name for the picker.
create or replace function public.request_consignee(
  p_name      text,
  p_address   text default null,
  p_tin       text default null,
  p_doc_2303  text default null,
  p_doc_2307  text default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid := public.current_broker_id();
  v_id   uuid;
  v_code text;
begin
  if v_cust is null then raise exception 'No customer profile found.'; end if;
  if not (public.broker_is_approved() or public.broker_is_pending()) then
    raise exception 'Your account can''t request consignees right now.';
  end if;
  if length(coalesce(trim(p_name), '')) < 2 then
    raise exception 'Enter the consignee name.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_doc_2303), '') = '' then
    raise exception 'Attach the BIR 2303 (Certificate of Registration).' using errcode = 'check_violation';
  end if;

  begin
    insert into public.consignees (name, address, tin, doc_2303_path, doc_2307_path, status, requested_by, requested_at)
    values (trim(p_name),
            nullif(trim(coalesce(p_address, '')), ''),
            nullif(trim(coalesce(p_tin, '')), ''),
            trim(p_doc_2303),
            nullif(trim(coalesce(p_doc_2307, '')), ''),
            'pending', v_cust, now())
    returning id, code into v_id, v_code;
  exception when unique_violation then
    raise exception 'A consignee with that name already exists — search for it in the list.'
      using errcode = 'check_violation';
  end;

  return json_build_object('id', v_id, 'code', v_code, 'name', trim(p_name));
end;
$$;
revoke all on function public.request_consignee(text, text, text, text, text) from public, anon;
grant execute on function public.request_consignee(text, text, text, text, text) to authenticated;

-- 5) Notify the requester when KTC approves/rejects their request (only for
--    customer-requested rows; the seeded master list has requested_by = null).
create or replace function public.notify_consignee_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.requested_by is not null
     and old.status = 'pending' and new.status is distinct from old.status then
    if new.status = 'approved' then
      insert into public.notifications (customer_id, kind, title)
      values (new.requested_by, 'consignee_approved',
              'Consignee “' || new.name || '” (' || new.code || ') was approved — you can now use it');
    elsif new.status = 'rejected' then
      insert into public.notifications (customer_id, kind, title)
      values (new.requested_by, 'consignee_rejected',
              'Consignee request “' || new.name || '” was not approved'
              || coalesce(' — “' || new.note || '”', ''));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists consignees_notify_decision on public.consignees;
create trigger consignees_notify_decision after update on public.consignees
  for each row execute function public.notify_consignee_decision();
