# Workflow Invariants

Rules that protect the operational backbone. A regression here is a production incident.

For the *current* snapshot of what is live, read `docs/obsidian-vault/07-Memory/Current State.md`. This file is the durable rule set.

> **Naming note (migration `0021`):** the `brokers` table is now **`customers`** (with `customer_code`/`customer_id` columns), and the user-facing term is "customer". Helper-function *names* were deliberately kept (`current_broker_id`, `broker_is_approved`, `useBroker`, …). Where this file says "broker", read it as the customer role; where it names a function, the name is literal.

## Stable operational boundary

The portal runs these gated chains:

1. **Access & identity** — customer self-registration → admin approval; owner failsafe + root-owner-only owner grants; invite-only staff creation with role.
2. **Customer onboarding** — register (email + password + full name + valid-ID upload) → `pending` → admin approves → customer gains portal access.
3. **Consignee accreditation** — admin adds/edits consignees → accreditation details (name + address + TIN + 2303 doc) → admin approval.
4. **Job orders** — an approved customer (or a `file_job_orders`-gated staff member filing on behalf) submits a job order (service requests: X-ray / DEA / OOG stripping, etc.) by picking any consignee from the master list (per-broker accreditation disabled 2026-06-09; see ADR-0007). A priority queue number is assigned on `submitted` (weekly reset).
5. **Processing & completion** — staff advance the order through the split gates (`accept_orders` → `hold_reject_orders` / `complete_orders`) via `staff_transition_order`; per-van X-ray confirmation is Checker-only; the order reaches `completed` only when the **two-gate** condition is met (all services done AND base payment confirmed AND RPS settled AND every supplement paid).

Work outside this boundary is allowed but requires explicit planning and impact analysis first.

## Access-control invariants (do not regress)

- **Owner failsafe + root owner.** `jlawrenceang@gmail.com` has server-only `is_owner` and is the **root owner** (`is_root_owner`). The owner overrides every gate, sees everything, and **cannot be locked out or revoked**. Multiple owners are allowed for redundancy, but only the root owner may mint/revoke owner access (via `set_owner_access()`); `is_root_owner` is never app-changeable. Staff cannot revoke the owner.
- **Invite-only staff, with role.** Admin/staff accounts are created only by the owner via `create_staff` (username login, no email, synthetic `<username>@ktc-staff.local`), assigned a `staff_role` ∈ {admin, operations, cashier, checker, csr, purchaser} (`purchaser` = the backend-only fuel desk, no frontend yet). There is no self-signup path to staff. Roles map to capabilities through the owner-tuned `role_permissions` matrix; restricted roles are NOT `is_admin` and act only through `has_permission`-checked SECURITY DEFINER RPCs.
- **Permission gates are backend-first.** Staff order transitions go through `staff_transition_order` enforcing the split gates `accept_orders` / `hold_reject_orders` / `complete_orders` (no direct client UPDATE on `job_orders`). Per-van X-ray (`record_van_xray`) is `confirm_xray` = Checker-only; supplements/payments are gated by `process_job_orders` / `review_payments`. Never re-derive a capability in the UI alone.
- **Two-gate completion (do not bypass).** `completed` is reachable only when `jo_ready_to_complete()` holds — all services done AND base payment confirmed AND RPS settled AND every supplement paid. Adding a supplement to a completed order reverts it to `processing` until the supplement clears.
- **Customer approval gate.** Un-approved, non-staff customers must not reach customer features — the Shell shows the pending-approval panel. `status` transitions to `approved` only from the admin portal.
- **Consignee approval gate (admin-side).** Consignees and their accreditations require admin approval; accreditation cannot be approved without name + address + TIN + 2303 document. This is admin-side data quality — as of ADR-0007 it no longer gates which consignees a broker can target.
- **Job-order consignee selection.** Brokers pick any consignee from the master list (searchable). Per-broker accreditation scoping is disabled (ADR-0007) and reversible. Only **approved brokers** can reach the form (the broker-approval gate is unchanged).

## Implementation invariants

- **`useBroker` must filter `.eq('user_id', uid)`.** Admin RLS returns ALL broker rows; without the filter `maybeSingle()` errors or returns the wrong row (this is the bug that dumped the owner into the broker portal).
- **`hasAdminAccess(b) = b.is_admin || b.is_owner`** (`src/lib/types.ts`) is the single admin-access check. Use it; do not re-derive.
- **`create_staff` token columns** must be set to `''` not NULL (GoTrue requirement) and the RPC must both create the auth user AND promote the broker, atomically.
- **CAPTCHA is server-enforced.** The token is passed through `signIn`/`signUp`; Supabase rejects auth without it. `create_staff` bypasses the auth API (direct SQL), so the owner is never locked out by CAPTCHA. CAPTCHA is gated on `VITE_TURNSTILE_SITE_KEY` — blank disables it.

## High-risk debug first pass

When access control or a gate misbehaves, inspect in this order:
1. Runtime target mismatch — are you on the KTC project? (see `runtime-data-safety.md`).
2. `useBroker` user_id filter / `hasAdminAccess` usage.
3. RLS policy vs intended visibility on `brokers` / `consignees`.
4. `create_staff` RPC (token columns, owner-only guard, atomic promote).
5. CAPTCHA enforcement state (Supabase Attack Protection vs `VITE_TURNSTILE_SITE_KEY`).
6. Legacy route / component drift.
