-- ============================================================
-- 0117 — re-sweep SECURITY DEFINER trigger-function ACLs (owner, 2026-06-18)
--
-- The 0105 sweep was a one-time DO block; SECURITY DEFINER *trigger* functions
-- created since (notify_*, audit_privilege_grant, complete_on_payment_confirmed,
-- request_vessel_on_unlisted, sync_open_supplement, guard_vat_rate, …) inherited
-- the default PUBLIC EXECUTE grant again. This is HARMLESS in practice — Postgres
-- refuses to call a trigger-returning function directly, PostgREST won't expose
-- it as an RPC, and trigger firing never checks the invoker's EXECUTE privilege —
-- but it's the exact hygiene 0105 standardized away. Re-revoke comprehensively
-- (no functional impact), and `scripts/check-security-invariants.mjs` now makes
-- this a STANDING release check so the snapshot can't drift again.
-- ============================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
