-- 0152: Rejecting a consignee cancels the open job orders that referenced it. (Item 3b)
-- Previously review_consignee only flipped the consignee to 'rejected', leaving its
-- job orders orphaned (they rendered "No consignee"). Now a reject cancels the open
-- JOs (held/submitted/processing/on_hold) pointing at it, with a customer-visible
-- reason — EXCEPT orders already paid (payment confirmed) or invoiced, which are left
-- for manual staff handling (financial integrity).

create or replace function public.review_consignee(p_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_name text;
begin
  if not (public.has_permission('review_consignee_requests') or public.is_admin()) then
    raise exception 'You don''t have permission to review consignees.';
  end if;
  v_status := case p_action
    when 'approve'    then 'approved'
    when 'reject'     then 'rejected'
    when 'needs_info' then 'needs_info'
    else null end;
  if v_status is null then raise exception 'Unknown action: %', p_action; end if;
  if p_action in ('reject', 'needs_info') and coalesce(trim(p_note), '') = '' then
    raise exception 'Add a note for the customer explaining what''s needed.';
  end if;
  update public.consignees
     set status = v_status, decided_at = now(),
         note = case when p_action = 'approve' then null else trim(p_note) end
   where id = p_id
   returning name into v_name;
  if not found then raise exception 'Consignee not found.'; end if;

  -- On reject, cancel the open job orders that referenced this consignee.
  if p_action = 'reject' then
    update public.job_orders
       set status = 'cancelled',
           admin_note = 'Consignee "' || coalesce(v_name, '') || '" was not approved: ' || trim(p_note)
     where consignee_id = p_id
       and status in ('held','submitted','processing','on_hold')
       and payment_status is distinct from 'confirmed'
       and service_invoice_no is null;
  end if;
end;
$$;
