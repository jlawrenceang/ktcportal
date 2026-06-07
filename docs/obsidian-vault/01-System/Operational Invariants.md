---
title: Operational Invariants
tags: [system, invariants, pointer]
type: system
---

# 🔒 Operational Invariants

The durable rule set lives in `docs/agent/workflow-invariants.md`. This note summarizes the load-bearing invariants for the graph; do not let it drift from the owning file.

## Access control (do not regress)

- **Owner failsafe** — `jla.ktcport@gmail.com`, server-only `is_owner`, overrides everything, cannot be locked out or revoked. See [[Owner Failsafe]].
- **Invite-only staff** — owner-created via `rpc('create_staff')` (username + password, no email). No self-signup to admin.
- **Broker approval gate** — un-approved non-admin brokers see the pending panel; `status → approved` only from admin.
- **Consignee approval gate** — consignees + accreditations require admin approval; accreditation needs name + address + TIN + 2303 doc.
- **Job orders only against approved consignees.**

## Implementation invariants

- `useBroker` must filter `.eq('user_id', uid)` (admin RLS returns all broker rows).
- `hasAdminAccess(b) = is_admin || is_owner` is the single admin check.
- `create_staff` token columns = `''` (not NULL); creates auth user + promotes broker atomically.
- CAPTCHA is server-enforced; `create_staff` bypasses the auth API so the owner is never blocked. See [[CAPTCHA Bot Protection]].

## Related
- [[Release Gate]]
- [[Authentication]]
- [[RLS Posture]]
