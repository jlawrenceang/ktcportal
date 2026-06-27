-- 0171: ADR-0035 phase-1 revision — separation-of-duties pass (after the role review).
-- (1) Order approval stays with operations + admin: pull accept_orders +
--     hold_reject_orders back off CSR — a CSR can file on behalf AND approve, which is
--     a maker-checker gap. CSR stays intake + comms (file_job_orders, manage_support,
--     review_consignee_requests, verify_release_docs, views).
-- (2) Trim cashier to its money lane: drop hold_reject_orders + complete_orders — the
--     cashier rejects the payment proof, not the operational order; completion is
--     ops/admin (and soon automatic). Cashier keeps review_payments + record_invoice.
update public.role_permissions set allowed = false, updated_at = now()
where (role = 'csr'     and permission in ('accept_orders', 'hold_reject_orders'))
   or (role = 'cashier' and permission in ('hold_reject_orders', 'complete_orders'));
