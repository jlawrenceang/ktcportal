-- 0140_revoke_consignee_decision_trigger_acl.sql  (parked at 0140 with a buffer to end a concurrent-work rename race in the 0133-0136 range)
-- Close a security-invariant violation: the trigger function
-- public.notify_consignee_decision() (added in 0132) inherited the default
-- PUBLIC EXECUTE grant. Trigger functions never need to be client-callable
-- (the definer-ACL gotcha — see 0105 / 0117). Revoke it. Behavior-neutral:
-- the trigger still fires on its table; only direct client EXECUTE is removed.

revoke all on function public.notify_consignee_decision() from public, anon, authenticated;
