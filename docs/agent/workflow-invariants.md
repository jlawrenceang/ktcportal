# Workflow Invariants

Rules that protect the operational backbone. A regression here is a production incident.

For the current snapshot of what is live, read `docs/obsidian-vault/07-Memory/Current State.md`. Production is the contract source; sandbox mirrors the same migrations/schema/functions for isolated testing with separate env vars, secrets, and seed data.

## Stable operational boundary

The portal runs these gated chains:

1. **Access & identity** - customer self-registration -> admin approval; owner failsafe + root-owner-only owner grants; invite-only staff creation with role.
2. **Customer onboarding** - pending customers are verify-only until admin approval; they cannot file or hold Job Orders.
3. **Consignee accreditation** - admin/CSR review maintains consignee data quality and BIR 2303 requirements.
4. **Job orders** - an approved customer, or a gated staff user filing on behalf, submits a JO against an approved consignee.
5. **Processing & completion** - staff advance explicit statuses through `staff_transition_order`; per-van X-ray is checker-only; `completed` requires all services done and every billed, non-reversed `charges` row confirmed.
6. **Money spine** - JO billing uses ADR-0037 `charges` / `payment_orders`. The old base/RPS/supplement pay-page path is retired and must not be reintroduced as payment truth.

Work outside this boundary is allowed but requires explicit planning and impact analysis first.

## Access-control invariants

- **Owner failsafe + root owner.** `jlawrenceang@gmail.com` has server-only owner/root-owner authority and cannot be locked out or revoked by staff.
- **Invite-only staff, with role.** Staff accounts are created only through owner/admin-controlled staff creation. There is no self-signup path to staff.
- **Permission gates are backend-first.** UI gates mirror server RPC/RLS gates; they are not the security boundary.
- **Staff transitions use `staff_transition_order`.** No direct client update path may bypass `accept_orders`, `hold_reject_orders`, or `complete_orders`.
- **X-ray is checker-only.** `record_van_xray` is gated by `confirm_xray`.
- **Charge/payment-order gates are server-side.** Charge invoices use `record_invoice`; proof review and Payment Order collection use `review_payments`; charge approval/cancellation/reversal follows ADR-0037 RPC gates.
- **Two-gate completion must not be bypassed.** `jo_ready_to_complete()` is services-done plus all billed, non-reversed charges confirmed.
- **Customer approval gate.** Unapproved non-staff customers stay verify-only.
- **Server-side CAPTCHA.** Supabase auth must reject tokenless public sign-in/sign-up when CAPTCHA is enabled.

## Implementation invariants

- `useBroker` must filter `.eq('user_id', uid)`.
- `hasAdminAccess(b) = b.is_admin || b.is_owner` is the single admin-access check.
- Staff creation must create the auth user and promote the customer row atomically.
- KTC DB work must target Supabase ref `mdlnfhyylvapzdubhyic`; connected generic Supabase MCP tools are not KTC.

## High-risk debug first pass

1. Runtime target mismatch.
2. `useBroker` user_id filter / `hasAdminAccess` usage.
3. RLS policy vs intended visibility.
4. Staff creation / owner-only guards.
5. CAPTCHA enforcement state.
6. Charge/payment-order gate and `jo_ready_to_complete()` drift.