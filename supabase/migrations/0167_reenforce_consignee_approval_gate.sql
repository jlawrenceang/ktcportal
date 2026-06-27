-- 0167: re-enforce the consignee approval completeness gate (the 2303 rule).
-- New rule (2026-06-27): a consignee really needs its business address, TIN, and
-- BIR 2303 before it can be APPROVED (made usable in job orders). Migration 0120
-- had relaxed this to a soft UI warning; this restores the hard DB guard (the 0009
-- body). It is the single backstop for EVERY creation path — admin add form, CSV
-- import, customer request, resubmit — since they all land as 'pending' and must
-- pass through approval to become usable.
--
-- Grandfathering: it fires only on the transition INTO approved, so the legacy
-- seeded master list (already approved without docs) is left untouched and stays
-- editable. New approvals are blocked until complete. (Reverts 0120; restores 0009.)
create or replace function public.guard_consignee_approval()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'approved'
     and (coalesce(trim(new.address), '') = '' or coalesce(trim(new.tin), '') = '' or coalesce(trim(new.doc_2303_path), '') = '') then
    if tg_op = 'UPDATE' and old.status = 'approved' then
      return new;  -- already approved before this rule -> grandfathered, leave it be
    end if;
    raise exception 'Consignee needs a business address, TIN, and an attached BIR 2303 before it can be approved.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
