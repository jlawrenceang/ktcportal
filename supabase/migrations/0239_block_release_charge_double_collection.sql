-- ============================================================
-- 0239 — Block release-charge collection via the charge path (double-settlement fix)
--
-- Pre-go-live battery (money/billing-integrity) finding: the release / pull-out lane
-- runs TWO unreconciled settlement paths. The AUTHORITATIVE path is the release desk
-- (release_orders: submit/confirm_release_payment → record_release_or). But 0215's
-- seed_release_billing also DUAL-WRITES a shadow charge (charge_type='release') into
-- `charges` toward the eventual release cutover — and those rows match the cashier's
-- Payment Order open-charges queue (bill_status='billed', payment_order_id null,
-- payment_status not confirmed/reversed). So a release paid at the release desk leaves a
-- phantom 'unpaid' release charge that a cashier can independently invoice + collect →
-- a SECOND official receipt for the same money.
--
-- Fix (poka-yoke — client-proof, not just a UI hide): a BEFORE-UPDATE guard trigger blocks
-- a release charge from being SETTLED via the charge path — bundled into a Payment Order,
-- advanced to submitted/confirmed, or invoice-finalized. Release charges stay pristine and
-- are settled ONLY at the release desk (which touches release_orders, never charges).
--
-- Safe by construction:
--   * seed_release_billing INSERT/DELETEs release charges (BEFORE UPDATE never fires), and
--     already skips once a release charge is non-pristine (0215:39-45).
--   * set/add/void_release_charge never UPDATE a charge's payment/invoice/PO fields.
--   * reversal/cancel (payment_status → reversed/rejected/cancelled) stays allowed.
-- The eventual release cutover onto the charges spine will REPLACE this trigger with the
-- single-path collection; until then it is the reconciliation backstop.
-- ============================================================

create or replace function public.block_release_charge_collection()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.charge_type = 'release' then
    -- bundling into a Payment Order (the N:1 collection unit)
    if new.payment_order_id is not null and old.payment_order_id is null then
      raise exception 'Release charges are settled at the release desk, not via Payment Orders.'
        using errcode = 'insufficient_privilege';
    end if;
    -- payment progression through the charge desk
    if new.payment_status is distinct from old.payment_status
       and new.payment_status in ('submitted','confirmed') then
      raise exception 'Release charges are settled at the release desk, not via the charge desk.'
        using errcode = 'insufficient_privilege';
    end if;
    -- recording a final ERP/BIR invoice through the charge desk
    if new.invoice_state is distinct from old.invoice_state and new.invoice_state = 'final' then
      raise exception 'Release charges are invoiced at the release desk, not via the charge desk.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.block_release_charge_collection() from public, anon, authenticated;  -- trigger-only

drop trigger if exists charges_block_release_collection on public.charges;
create trigger charges_block_release_collection
  before update on public.charges
  for each row execute function public.block_release_charge_collection();
