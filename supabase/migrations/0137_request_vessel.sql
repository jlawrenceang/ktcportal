-- ============================================================
-- 0137 — request_vessel: register an unlisted vessel as a PENDING request from a
-- modal (mirrors request_consignee, 0132). The JO-insert trigger
-- request_vessel_on_unlisted (0068) still dedupes on the same partial unique
-- index, so this just lets the request be created at modal-submit time — the
-- customer immediately sees the vessel tagged "pending approval".
-- ============================================================

create or replace function public.request_vessel(p_name text, p_voyage text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid := public.current_broker_id();
  v_name text := upper(trim(coalesce(p_name, '')));
  v_voy  text := upper(trim(coalesce(p_voyage, '')));
begin
  if v_cust is null then raise exception 'No customer profile found.'; end if;
  if not (public.broker_is_approved() or public.broker_is_pending()) then
    raise exception 'Your account can''t request vessels right now.';
  end if;
  if length(v_name) = 0 then
    raise exception 'Enter the vessel name.' using errcode = 'check_violation';
  end if;

  insert into public.vessel_requests (vessel_name, voyage_number, requested_by)
  values (v_name, v_voy, v_cust)
  on conflict (vessel_name, voyage_number) where status = 'pending' do nothing;

  return json_build_object('vessel_name', v_name, 'voyage_number', v_voy);
end;
$$;
revoke all on function public.request_vessel(text, text) from public, anon;
grant execute on function public.request_vessel(text, text) to authenticated;
