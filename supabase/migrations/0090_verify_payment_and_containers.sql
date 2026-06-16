-- ============================================================
-- 0090 — verify RPC returns payment status + container numbers (owner, 2026-06-16)
--
-- Anti-forgery: the slip's "paid/completed" text is cosmetic — the scan is the
-- proof. The QR carries only the (unguessable) order id; this definer RPC
-- returns the LIVE status, so an edited image can't fake a paid invoice. To
-- defeat the one real attack (copying a genuine paid order's QR onto a fake
-- slip), the verify page now shows the JO's CONSIGNEE + CONTAINER NUMBERS, which
-- the verifier matches against the physical slip and the containers in hand —
-- a copied QR resolves to someone else's details and is caught.
-- ============================================================

-- Return type changes (added payment_status + containers), so drop first.
drop function if exists public.verify_job_order(uuid);
create function public.verify_job_order(p_id uuid)
returns table (
  jo_number    text,
  status       text,
  payment_status text,
  completed_at timestamptz,
  consignee    text,
  containers   text[]
)
language sql security definer set search_path = public as $$
  select jo.jo_number,
         jo.status,
         jo.payment_status,
         jo.completed_at,
         (select c.code || ' – ' || c.name from public.consignees c where c.id = jo.consignee_id),
         (select array_agg(l.container_number order by l.container_number)
            from public.job_order_lines l where l.job_order_id = jo.id)
  from public.job_orders jo
  where jo.id = p_id;
$$;

revoke all on function public.verify_job_order(uuid) from public;
grant execute on function public.verify_job_order(uuid) to anon, authenticated;
