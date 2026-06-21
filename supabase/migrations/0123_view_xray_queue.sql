-- ============================================================
-- 0123 — dedicated view_xray_queue gate (owner, 2026-06-21)
--
-- The X-ray queue is an OPERATIONS planning view, also visible to the CHECKER
-- (spotter) and CSR (to answer customer status questions) — but NOT the cashier,
-- whose lane is payment verification + ERP invoice/OR cross-checking only.
--
-- The cashier keeps view_job_orders (needed for their payment work), so gating
-- the queue on view_job_orders would wrongly include them. This is a separate
-- UI/nav gate; no RLS depends on it (the data is already governed by
-- view_job_orders). Owner bypasses every gate (failsafe). Owner-tweakable in
-- Settings → Roles & Gates.
-- ============================================================
insert into public.role_permissions (role, permission, allowed) values
  ('admin',      'view_xray_queue', true),
  ('operations', 'view_xray_queue', true),
  ('checker',    'view_xray_queue', true),
  ('csr',        'view_xray_queue', true),
  ('cashier',    'view_xray_queue', false)
on conflict (role, permission) do nothing;
