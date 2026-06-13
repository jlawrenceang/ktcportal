# Architecture Decision Records (ADRs)

ADRs in this folder preserve decision history for the KTC broker portal.

## Reading order

1. `0001` to `0015` in numeric order.
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
| [0007](0007-disable-per-broker-consignee-accreditation.md) | Disable per-broker consignee accreditation (brokers pick from master) | Accepted | 2026-06-09 | Workflow |
| [0008](0008-broker-irr-acceptance-at-registration.md) | Require broker IRR acceptance at registration | Accepted | 2026-06-09 | Workflow \| Security |
| [0009](0009-terms-and-data-privacy-consent-at-registration.md) | Add Terms & Conditions and Data Privacy Act consent at registration | Accepted | 2026-06-09 | Security \| Workflow |
| [0010](0010-e2e-auth-via-test-project-and-service-role-minting.md) | Test authenticated flows via an isolated project + service-role session minting | Accepted | 2026-06-09 | Workflow \| Security |
| [0011](0011-consolidate-legal-docs-into-one-broker-agreement.md) | Consolidate the legal docs into one Broker Agreement (Terms + NDA + DPA) | Accepted | 2026-06-09 | Workflow \| Security |
| [0012](0012-pending-brokers-enter-portal-submit-gated.md) | Let pending brokers into the portal; gate job-order submission on approval | Accepted | 2026-06-09 | Workflow \| Security |
| [0013](0013-customer-account-self-service-and-reverify-on-name-change.md) | Customer account self-service + re-verify on name change | Accepted | 2026-06-10 | Workflow \| Security |
| [0014](0014-admin-job-order-processing-and-printable-slip.md) | Admin job-order processing ("approve = start processing") + printable slip | Accepted | 2026-06-10 | Workflow |
| [0015](0015-modular-terminal-depot-operating-system-north-star.md) | Octopi-class modular terminal + depot operating system as the north star, container/EIR spine first | Accepted | 2026-06-13 | Architecture |

## Governance

- Do not rewrite historical ADR intent to match current code.
- If implementation diverges, add a dated addendum with rationale.
- Runtime truth still comes from code (`src/App.tsx`, active implementation) and migrations (`supabase/migrations/`).
- Write new ADRs with the `/adr` command (see `.claude/commands/adr.md`); use `template.md` as the base and add a row to the log above.
