# Architecture Decision Records (ADRs)

ADRs in this folder preserve decision history for the KTC broker portal.

## Reading order

1. `0001` to `0006` in numeric order.
2. Then check each ADR for **Current-State Addendum** sections.

## Log

| # | Title | Status | Date | Category |
|---|---|---|---|---|
| [0001](0001-design-ktc-portal-as-two-gated-portals.md) | Design the KTC system as two role-gated portals | Accepted | 2026-06-05 | Architecture |
| [0002](0002-use-a-dedicated-supabase-account-with-backend-enforced-access.md) | Use a dedicated Supabase account with backend-enforced access | Accepted | 2026-06-05 | Database \| Security |
| [0003](0003-use-react-vite-typescript-tailwind-spa.md) | Use React + Vite + TypeScript + Tailwind as the SPA stack | Accepted | 2026-06-05 | Frontend |
| [0004](0004-owner-failsafe-and-invite-only-staff.md) | Establish an owner failsafe and invite-only staff | Accepted | 2026-06-05 | Security |
| [0005](0005-admin-approval-and-consignee-accreditation-controls.md) | Require admin approval + consignee accreditation controls | Accepted | 2026-06-05 | Workflow |
| [0006](0006-host-on-vercel-with-turnstile-captcha.md) | Host on Vercel and gate auth with Turnstile CAPTCHA | Accepted | 2026-06-07 | Integration \| Security |

## Governance

- Do not rewrite historical ADR intent to match current code.
- If implementation diverges, add a dated addendum with rationale.
- Runtime truth still comes from code (`src/App.tsx`, active implementation) and migrations (`supabase/migrations/`).
- Write new ADRs with the `/adr` command (see `.claude/commands/adr.md`); use `template.md` as the base and add a row to the log above.
