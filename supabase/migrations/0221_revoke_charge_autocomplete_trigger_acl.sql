-- ============================================================
-- 0221 — Revoke direct EXECUTE on the charge auto-complete trigger function
--        (security invariant; the supabase-definer-acl gotcha)
--
-- 0216 added complete_jo_on_charge_confirmed() as a SECURITY DEFINER trigger
-- function but left it EXECUTE-able by authenticated/anon (PostgREST would expose
-- it). Trigger functions must never be callable directly — revoke it (matches the
-- standing check-security-invariants.mjs invariant for definer trigger functions).
-- ============================================================

revoke all on function public.complete_jo_on_charge_confirmed() from public, anon, authenticated;

notify pgrst, 'reload schema';
