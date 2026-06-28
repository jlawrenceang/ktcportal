-- ============================================================
-- 0195 — Revoke direct EXECUTE on the release trigger functions
--
-- check-security-invariants flagged four SECURITY DEFINER *trigger* functions
-- created by 0188 (the release-billing loop) as EXECUTE-able by authenticated/
-- anon. Trigger functions must never be directly callable (the definer-ACL
-- gotcha fixed for the JO side in 0105): they run only from their AFTER triggers
-- with NEW/OLD set. Revoke from public/anon/authenticated; the triggers still
-- fire (trigger execution doesn't need EXECUTE granted to the caller).
-- Backend-only; no behavior change for legitimate flows.
-- ============================================================

revoke all on function public.notify_release_change()              from public, anon, authenticated;
revoke all on function public.notify_staff_release_new()           from public, anon, authenticated;
revoke all on function public.notify_staff_release_supp_payment()  from public, anon, authenticated;
revoke all on function public.cancel_open_releases_on_status()     from public, anon, authenticated;
