---
title: Operational Invariants
tags: [system, invariants, pointer]
type: system
---

# 🔒 Operational Invariants

The durable rule set lives in `docs/agent/workflow-invariants.md`. This note summarizes the load-bearing invariants for the graph; do not let it drift from the owning file.

## Access control (do not regress)

- **Owner failsafe** — server-only `is_owner`, overrides everything, cannot be locked out or revoked. Only the **root owner** (`is_root_owner`, never app-changeable) may mint/revoke secondary owners via `set_owner_access`. See [[Owner Failsafe]], [[Multi-Owner & Root Grants]].
- **Invite-only staff** — owner-created via `rpc('create_staff')` (username + password, no email; role ∈ admin/operations/cashier/checker/csr). No self-signup to admin.
- **Permission-gated capabilities** — every staff action is checked against the owner-tunable `role_permissions` matrix via `has_permission` (owner bypasses all). Restricted roles are NOT `is_admin`. See [[Staff Roles & Gates]].
- **Gated JO transitions** — explicit accept/hold/reject/complete go through `staff_transition_order` with the split gates (`accept_orders`/`hold_reject_orders`/`complete_orders`); no direct status UPDATE.
- **Two-gate completion** — an order completes only when all services + base payment + RPS (if needed) + every supplement are confirmed. Server-enforced; backstopped by `enforce_two_gate_complete`. See [[Two-Gate Completion]].
- **X-ray confirmation = Checker only** (`confirm_xray`); admin + operations cannot confirm X-ray.
- **Customer approval gate** — un-approved non-admin customers see the pending panel; `status → approved` only from admin.
- **Privilege grants are alerted** — any account gaining admin/owner/a staff role (by any path, incl. direct DB write) logs + emails the owner.

## Implementation invariants

- `useBroker` must filter `.eq('user_id', uid)` (admin RLS returns all broker rows).
- `hasAdminAccess(b) = is_admin || is_owner` is the single admin check.
- `create_staff` token columns = `''` (not NULL); creates auth user + promotes broker atomically.
- CAPTCHA is server-enforced; `create_staff` bypasses the auth API so the owner is never blocked. See [[CAPTCHA Bot Protection]].

## Related
- [[Release Gate]]
- [[Authentication]]
- [[RLS Posture]]
- [[Staff Roles & Gates]] · [[Two-Gate Completion]] · [[Multi-Owner & Root Grants]]
