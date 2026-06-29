-- ============================================================
-- 0214 — charges become release-aware (ADR-0037 Phase A cutover · Stage 1.6a)
--
-- Folding the release / pull-out desk onto the unified billing spine. Today a
-- release (`release_orders`, keyed by Bill of Lading) carries its OWN flat base
-- `amount` + `release_supplements` + a single ERP control no + physical OR — it is
-- NOT linked to a job order, and `charges.job_order_id` was NOT NULL, so a charge
-- could not attach to a release. This migration opens that seam:
--   • `charges.release_order_id` (nullable FK) — the second parent.
--   • `charges.job_order_id` made nullable.
--   • XOR check: a charge belongs to EXACTLY ONE of a job order or a release.
--   • `charge_type` widened with 'release' — a flat, explicit-amount pull-out charge
--     that bills immediately (preserving today's release workflow; the base X-ray
--     'service' + 'rps' stay spine-priced, 'addon' stays maker-checker).
--   • RLS so a customer reads the charges on their own releases.
--
-- ADDITIVE / NON-BREAKING: existing charges all have job_order_id set + the new
-- column null → they satisfy the XOR. payment_orders is already entity-neutral
-- (customer_id + bundles charges N:1), so no change there. The dual-write of release
-- billing into charges + the release-aware charge RPCs land in 0215; the release UI
-- switch + ERP+BIR-required-for-release confirm + the old-column drops are Stage 2.
-- Owner decisions 2026-06-29: releases DO carry ERP + BIR (like every charge); build now.
-- ============================================================

-- second parent: a release the charge belongs to
alter table public.charges add column if not exists release_order_id uuid
  references public.release_orders(id) on delete cascade;

-- a charge may now hang off a release instead of a job order
alter table public.charges alter column job_order_id drop not null;

-- exactly one parent (job order XOR release)
alter table public.charges drop constraint if exists charges_one_parent;
alter table public.charges add constraint charges_one_parent
  check ((job_order_id is not null) <> (release_order_id is not null));

-- widen charge_type for the flat release/pull-out charge
alter table public.charges drop constraint if exists charges_charge_type_check;
alter table public.charges add constraint charges_charge_type_check
  check (charge_type in ('service','rps','addon','release'));

create index if not exists charges_release_idx
  on public.charges (release_order_id) where release_order_id is not null;

-- RLS: a customer reads the charges on their OWN releases (the existing
-- "customer reads own charges" policy only matches job-order ownership, which now
-- excludes release charges since their job_order_id is null).
drop policy if exists "customer reads own release charges" on public.charges;
create policy "customer reads own release charges" on public.charges
  for select to authenticated
  using (
    charges.release_order_id is not null
    and exists (select 1 from public.release_orders r
                where r.id = charges.release_order_id and r.customer_id = public.current_broker_id())
  );
-- (staff read policy is parent-agnostic — no job_orders join — so it already covers release charges.)

notify pgrst, 'reload schema';
