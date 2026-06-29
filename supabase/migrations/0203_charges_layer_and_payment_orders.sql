-- ============================================================
-- 0203 — The charges layer + payment_orders + container link
--        (ADR-0037 Phase A + 2026-06-29 addendum; owner 2026-06-29)
--
-- The uniform billing spine: a Job Order is the customer SERVICE REQUEST (X-ray
-- these vans; owns the queue, status, consignee). Each billable — base X-ray, an
-- RPS move, an add-on — is a row in `charges`, each carrying its OWN ERP+BIR
-- invoice (draft→final), payment, maker-checker approval, attribution, and
-- payment_order link. Payment Orders bundle whole charges (N:1) for collection.
-- This is the anti-fraud spine (authenticity / authorization / accountability /
-- reconciliation). Additive only — the legacy base/RPS/supplement columns stay
-- live until the M4 cutover, so prod keeps working.
-- ============================================================

-- ---------- payment_orders: the cashier's collection unit (N:1 over charges) ----------
create sequence if not exists public.payment_order_seq;

create table if not exists public.payment_orders (
  id                   uuid primary key default gen_random_uuid(),
  po_number            text unique,
  customer_id          uuid not null references public.customers(id) on delete cascade,
  consignee_id         uuid references public.consignees(id),
  status               text not null default 'open'
    check (status in ('open','submitted','collected','cancelled')),
  collection_or_no     text,                       -- ONE OR per collection (BIR: 1 OR, N sales invoices)
  payment_status       text not null default 'unpaid'
    check (payment_status in ('unpaid','submitted','confirmed','rejected')),
  payment_proof_path   text,
  payment_submitted_at timestamptz,
  payment_confirmed_at timestamptz,
  payment_note         text,                       -- cashier reason on reject (customer-visible)
  created_by           uuid,
  created_at           timestamptz not null default now()
);
create index if not exists payment_orders_customer_idx on public.payment_orders (customer_id, created_at desc);

-- ---------- charges: one row per billable item (the uniform pipeline) ----------
create table if not exists public.charges (
  id                   uuid primary key default gen_random_uuid(),
  job_order_id         uuid not null references public.job_orders(id) on delete cascade,
  charge_type          text not null check (charge_type in ('xray','rps','addon')),
  label                text not null,
  qty                  numeric(12,2) not null default 1,
  unit_rate            numeric(12,2),              -- null = rate not configured (render "—", never ₱0)
  amount               numeric(12,2),              -- snapshot when billed (qty × unit_rate, or flat)
  vatable              boolean not null default true,
  -- maker-checker: add-ons are PROPOSED, then APPROVED before the customer is billed.
  -- Base X-ray + assessed RPS are seeded 'billed'. Anti-fraud control: no silent charge.
  bill_status          text not null default 'billed' check (bill_status in ('proposed','billed')),
  approved_by          uuid,
  approved_at          timestamptz,
  -- per-charge invoice (ERP + BIR), draft → final; payment confirms ONLY against final
  erp_invoice_no       text,
  bir_invoice_no       text,
  invoice_state        text not null default 'draft' check (invoice_state in ('draft','final')),
  invoice_recorded_at  timestamptz,
  -- payment (mirrors the JO proof flow; proof lives in payment-slips)
  payment_status       text not null default 'unpaid'
    check (payment_status in ('unpaid','submitted','confirmed','rejected')),
  payment_proof_path   text,
  payment_submitted_at timestamptz,
  payment_confirmed_at timestamptz,
  payment_note         text,
  payment_order_id     uuid references public.payment_orders(id) on delete set null,
  -- attribution (accountability — ~400 staff + discovered fraud)
  created_by           uuid,
  created_at           timestamptz not null default now()
);
create index if not exists charges_jo_idx on public.charges (job_order_id);
create index if not exists charges_po_idx on public.charges (payment_order_id) where payment_order_id is not null;

-- ---------- RLS: customer sees own (via JO/PO ownership); staff via gate; writes RPC-only ----------
alter table public.payment_orders enable row level security;
alter table public.charges        enable row level security;

drop policy if exists "customer reads own payment_orders" on public.payment_orders;
create policy "customer reads own payment_orders" on public.payment_orders
  for select to authenticated
  using (customer_id = public.current_broker_id());

drop policy if exists "staff reads payment_orders" on public.payment_orders;
create policy "staff reads payment_orders" on public.payment_orders
  for select to authenticated
  using (public.is_admin() or public.has_permission('review_payments'));

drop policy if exists "customer reads own charges" on public.charges;
create policy "customer reads own charges" on public.charges
  for select to authenticated
  using (exists (select 1 from public.job_orders j
                 where j.id = charges.job_order_id and j.customer_id = public.current_broker_id()));

drop policy if exists "staff reads charges" on public.charges;
create policy "staff reads charges" on public.charges
  for select to authenticated
  using (public.is_admin()
         or public.has_permission('review_payments')
         or public.has_permission('accept_orders')
         or public.has_permission('complete_orders')
         or public.has_permission('hold_reject_orders'));
-- (No INSERT/UPDATE/DELETE policies — all writes go through SECURITY DEFINER RPCs in M2.)

-- ---------- wire the container identity onto JO lines (populated by RPC in M2) ----------
alter table public.job_order_lines add column if not exists container_id uuid references public.containers(id);
create index if not exists job_order_lines_container_idx on public.job_order_lines (container_id) where container_id is not null;

comment on table public.charges is
  'ADR-0037 Phase A: uniform billable items under a Job Order. Each carries its own ERP+BIR invoice (draft→final), payment, maker-checker approval, attribution, and payment_order link. Invoice-before-confirm gate applies to ALL charge types (M2).';
comment on table public.payment_orders is
  'ADR-0037 Phase A: cashier collection unit; bundles whole charges N:1. One collection OR; per-charge sales invoices stay on charges.';
