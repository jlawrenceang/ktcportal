# Release Gate (Mandatory)

Every plan, implementation, review, and merge must explicitly pass all six checks. Any failure blocks release.

## 1. Security and authority enforcement
- Privileged actions and critical transitions must be backend-enforced (RPC/RLS), not frontend-only. Staff status transitions go through `staff_transition_order` and the permission gates — never a direct client UPDATE on `job_orders`.
- The owner failsafe (`is_owner`) and invite-only staff model must never be weakened. Owner-grant changes are **root-owner-only** (`is_root_owner` → `set_owner_access()`); secondary owners cannot mint or revoke owners.
- CAPTCHA enforcement must stay server-side (Supabase Auth), not just the widget.
- Any unresolved auth/role state must block mutation paths (fail closed).

## 2. Data and schema integrity
- Never edit an already-applied migration. Use forward-only patch migrations.
- Keep runtime schema, migrations, RPCs, triggers, and client contracts aligned.
- Protect transactional consistency so partial updates cannot commit (e.g. `create_staff` creates the auth user AND promotes the broker, or neither).

## 3. Contract and terminology consistency
- Use the canonical role model: `is_owner` / `is_root_owner` / `is_admin`, the staff `staff_role` set (**admin / operations / cashier / checker / csr**, gated by `role_permissions` + `has_permission`), and customer `status`. Plus the `SERVICE_REQUESTS` / accreditation-status / JO-status enums from `src/lib/types.ts`.
- JO statuses are exactly: `held` · `submitted` · `processing` · `on_hold` · `completed` · `rejected` · `cancelled`. Do not introduce ad-hoc status/role/permission strings in UI, SQL, or RPCs.
- Completion is **two-gated**: an order may reach `completed` only when all services are done AND base payment is confirmed AND (RPS not needed or paid) AND every supplement is paid (`jo_ready_to_complete()`). Do not bypass it.
- Update types, UI, and SQL together when a contract term changes.

## 4. Code quality and change hygiene
- Keep changes modular, typed, compact, and auditable. `npm run lint` (tsc) must pass clean.
- Avoid large jumbled mutations and dead/duplicate paths.
- Doc updates belong in the same change as the code (see `doc-governance.md`).

## 5. End-to-end workflow cohesion
- Keep the gated chains intact: register → approve → accredit → submit job order.
- No dead routes or screens that bypass the broker-approval or consignee-approval gates.
- Source-of-truth consistency across UI, RLS, and RPCs.

## 6. Release readiness and rollback discipline
- Required checks: `npm run lint`, `npm run build`, and a targeted smoke test on the touched flow (see `testing-and-release.md`).
- **For any change touching SQL/migrations**, also run `node scripts/check-security-invariants.mjs` — it fails the release if a `SECURITY DEFINER` trigger/internal helper became client-callable (the 0105 ACL rule, now a standing check) or the owner-guard trigger (`guard_broker_protected_fields`) is missing. A new internal/trigger definer function must `revoke … from public, anon, authenticated`.
- For DB changes, record what migration was applied and how to reverse it.
- Record assumptions, residual risks, and rollback steps before merge.

## How to apply

- Cite the gate in plans and reviews (e.g. "Gate check 2 — adds forward-only migration `0011_*`").
- When you block a change, name the failing check by number.
