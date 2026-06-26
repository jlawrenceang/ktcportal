# Architecture Decision Records (ADRs)

ADRs in this folder preserve decision history for the KTC portal.

## Reading order

1. `0001` to `0034` in numeric order.
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
| [0016](0016-staff-roles-split-gates-two-gate-completion.md) | Split processing into independently-assignable gates + a two-gate completion rule (staff_transition_order) | Accepted | 2026-06-16 | Workflow \| Security |
| [0017](0017-per-van-xray-checker-esignature.md) | Confirm X-ray per container van, by the Checker only, with an immutable e-signature | Accepted | 2026-06-16 | Workflow \| Security |
| [0018](0018-additional-charge-supplements-under-review.md) | Post-filing extra charges as JO supplements that gate release + revert completed orders to "under review" | Accepted | 2026-06-16 | Workflow \| Database |
| [0019](0019-public-verify-qr-anti-forgery.md) | Self-verifying slip: PENDING/COMPLETED watermark + QR to a public verification page | Accepted | 2026-06-16 | Security \| Workflow |
| [0020](0020-multi-owner-root-only-owner-grants.md) | Multiple owners but only a single root owner grants/revokes owner access | Accepted | 2026-06-16 | Security |
| [0021](0021-cashier-station-walk-in-payment-consolidated-email.md) | Cashier money desk + walk-in payment recording + one consolidated customer email nudge | Accepted | 2026-06-16 | Workflow \| Integration |
| [0022](0022-gate-pass-is-container-eir-not-job-order.md) | Gate pass is a container/EIR-level artifact (not the JO); gate action layer deferred, launch = verify-only | Accepted | 2026-06-16 | Architecture \| Workflow |
| [0023](0023-vessel-schedule-google-sheet-sync.md) | Vessel schedule via a Google Sheet ↔ app sync (hourly + manual) with a computed Last Free Day mirror + in-house line hiding | Accepted | 2026-06-16 | Integration \| Workflow |
| [0024](0024-customer-filed-online-release-pullout-payment.md) | Customer-filed online release/pull-out payment: DO/BL doc verification (CSR) → staff-set charges → online pay → OR at office | Accepted | 2026-06-21 | Architecture \| Database \| Workflow |
| [0025](0025-fuel-monitoring-derived-variance-on-moves-spine.md) | Fuel monitoring as a derived variance module on the moves spine (estimate vs per-dispense actual, effective-dated rates) | Accepted | 2026-06-22 | Architecture \| Database \| Business Logic |
| [0026](0026-terminal-reject-field-targeted-needs-info-and-cancel-cascades.md) | Reject is terminal; on-hold is field-targeted "needs info" (needs_fields); consignee-reject + customer suspend/reject cascade-cancel open JOs (except paid/invoiced) | Accepted | 2026-06-23 | Workflow \| Database |
| [0027](0027-per-service-rate-granularity-and-tiered-foreign-storage.md) | Per-service rate granularity (terminal_rate_config, fan-out) + a tiered foreign storage tariff (storage_tiers, cumulative bands); calculator-only | Accepted | 2026-06-23 | Business Logic \| Database |
| [0028](0028-rename-brokers-to-customers-single-pool.md) | Rename brokers to customers (single customer pool; `broker` kept as a code alias) | Accepted | 2026-06-25¹ | Database \| Workflow |
| [0029](0029-customer-self-service-requests-and-consignee-cis.md) | Customer self-service consignee/vessel requests + consignee document model | Accepted | 2026-06-25¹ | Workflow \| Database |
| [0030](0030-lara-non-llm-deterministic-customer-assistant.md) | Build Lara as a deterministic (non-LLM) customer assistant | Accepted | 2026-06-26 | Frontend \| Architecture |
| [0031](0031-server-side-agreement-consent-enforcement.md) | Enforce Customer Agreement / DPA consent in the database, not the UI | Accepted | 2026-06-26 | Security \| Database |
| [0032](0032-pending-accounts-verify-only-lockdown.md) | Lock pending accounts to verify-only (a data-exposure boundary) | Accepted | 2026-06-26 | Security |
| [0033](0033-block-disposable-email-domains.md) | Block disposable / temporary email domains at signup (server-side) | Accepted | 2026-06-26 | Security |
| [0034](0034-google-oauth-signin-scoped-finish-registration-gate.md) | Google OAuth sign-in + a scoped post-OAuth consent/contact gate | Accepted | 2026-06-26 | Security \| Frontend |

¹ Retroactively captured 2026-06-25; the decisions shipped earlier (0028 at migration 0021; 0029 across ~0132–0139).

## Governance

- Do not rewrite historical ADR intent to match current code.
- If implementation diverges, add a dated addendum with rationale.
- Runtime truth still comes from code (`src/App.tsx`, active implementation) and migrations (`supabase/migrations/`).
- Write new ADRs with the `/adr` command (see `.claude/commands/adr.md`); use `template.md` as the base and add a row to the log above.
