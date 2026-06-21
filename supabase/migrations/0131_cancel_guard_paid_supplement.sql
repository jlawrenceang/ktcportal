-- ============================================================
-- 0131 — cancel guard: don't strand a paid/pending supplement (owner 2026-06-21)
--
-- Pre-go-live review found a rare race: an additional charge (release_supplements)
-- can be paid + confirmed while the base release is still 'payable' (a supplement
-- payment doesn't change the base status), then the base release cancelled — leaving
-- a confirmed payment on a cancelled release with no in-app OR/refund trail. Block
-- cancelling when any supplement is already submitted or confirmed; staff settle/
-- refund it (or record the OR) first. Unpaid/rejected supplements don't block.
-- ============================================================

create or replace function public.cancel_release_order(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_status text; v_staff boolean;
begin
  select customer_id, status into v_owner, v_status from public.release_orders where id = p_id;
  if not found then raise exception 'Release not found.'; end if;
  v_staff := public.has_permission('verify_release_docs') or public.has_permission('review_payments');
  if not (v_owner = public.current_broker_id() or v_staff) then
    raise exception 'You can''t cancel this release.';
  end if;
  if v_status not in ('submitted', 'docs_verified', 'payable', 'on_hold') then
    raise exception 'This release can no longer be cancelled — it''s already paid or released.';
  end if;
  if exists (select 1 from public.release_supplements s
             where s.release_order_id = p_id and s.payment_status in ('submitted', 'confirmed')) then
    raise exception 'This release has a paid or pending additional charge — settle or refund it before cancelling.';
  end if;
  update public.release_orders
     set status     = 'cancelled',
         staff_note = case when v_staff and coalesce(trim(p_reason), '') <> ''
                          then trim(p_reason) else staff_note end
   where id = p_id;
end;
$$;
