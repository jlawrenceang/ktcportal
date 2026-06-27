-- 0179: revoke EXECUTE on complete_on_service_done() — a SECURITY DEFINER trigger
-- function (added in 0172, phase 2) that missed its revoke and trips check #1 of
-- check-security-invariants (definer trigger fn EXECUTE-able by authenticated/anon).
-- Trigger-only; not callable directly. Mirrors the 0105/0140/0178 revoke pattern.
revoke all on function public.complete_on_service_done() from public, anon, authenticated;
