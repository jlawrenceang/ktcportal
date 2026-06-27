-- 0170: ADR-0035 phase 1 — CSR (customer service) gains the Approve & process and
-- Hold/Reject actions, alongside admin + operations. The csr rows already exist at
-- allowed=false, so flip them on; idempotent upsert in case a row is missing.
insert into public.role_permissions (role, permission, allowed, updated_at) values
  ('csr', 'accept_orders',     true, now()),
  ('csr', 'hold_reject_orders', true, now())
on conflict (role, permission) do update set allowed = true, updated_at = now();
