---
title: Broker Onboarding
tags: [workflow, brokers]
type: workflow
---

# 🔄 Broker Onboarding

End-to-end chain from a broker registering to being able to submit job orders.

## Steps

1. **Register** (`/login` register tab) — broker enters email + password + full name and uploads a valid ID. `signUp()` creates the Supabase auth user and a `brokers` row with `status = pending`; the ID file lands in the `valid-ids` bucket (`valid_id_path` set).
2. **Pending gate** — on login, an un-approved non-admin broker sees the pending-approval panel in `Shell.tsx`. Broker features are gated off.
3. **Admin review** — staff open `/admin/approvals` (or `/admin/brokers`), view the broker + valid ID (signed URL), and approve → `status = approved`, `decided_at` set.
4. **Access granted** — broker now reaches Home, Accreditation, New Job Order, My Job Orders.

## Invariants

- Un-approved brokers cannot transact (gate in `Shell.tsx`).
- Owner/admins bypass the broker surface entirely (`RoleLanding` → `/admin`).
- `useBroker` filters by `user_id` so an admin viewing all rows still resolves their own broker row.

## Related

- [[Brokers]] · [[Authentication]] · [[Administration]]
- Next: [[Consignee Accreditation]], [[Job Order Submission]]
