# ADR-0003: Use React + Vite + TypeScript + Tailwind as the SPA stack

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-05
* Category: Frontend

## Context and Problem Statement

The portal began as a Jotform form but pivoted to a custom app because per-broker accredited-consignee dropdowns and real login cannot be done natively in Jotform. We need a frontend stack for a small, auth-gated CRUD portal that can reuse the jta-sys visual language.

## Decision Drivers

* Need real authentication, role-gated routes, and dynamic per-broker data — beyond Jotform's capability.
* Reuse the jta-sys v2 "visionOS" design tokens for a consistent KTC look.
* Fast builds, simple hosting on Vercel, minimal moving parts for a small team.
* TypeScript for safety on the auth/role contracts.

## Considered Options

* **Option A** — Vite + React 18 + TypeScript + Tailwind 3 + react-router-dom, plain hooks + `@supabase/supabase-js`.
* **Option B** — Next.js (SSR/app router).
* **Option C** — Continue with Jotform + Google Sheets.

## Decision Outcome

Chosen option: **Option A — a Vite React SPA**, because the portal is a client-rendered, auth-gated CRUD app with no SSR/SEO needs; Vite gives fast builds and trivial Vercel deploys, and plain React hooks keep the dependency surface small. Tailwind + the ported visionOS tokens deliver the KTC aesthetic without a component framework.

### Positive Consequences

* Minimal dependencies; easy to reason about and deploy.
* Reuses jta-sys design tokens (`ktc-glass`, `ktc-btn`, etc.) with KTC accent colors.
* `tsc --noEmit` as the lint/typecheck gate catches contract drift.

### Negative Consequences / Trade-offs

* No SSR (irrelevant for a private, login-gated portal).
* Hand-rolled forms/state instead of a form/query library (acceptable at this size; see `coding-guardrails.md`).

## Pros and Cons of Options

### Option A: Vite React SPA (chosen)

* Good, because lean, fast, Vercel-native, reuses jta-sys design.
* Bad, because no SSR and more manual form/state code.

### Option B: Next.js

* Good, because batteries-included (routing, SSR, API routes).
* Bad, because SSR/app-router complexity is unwarranted for a small gated SPA.

### Option C: Jotform + Sheets

* Bad, because cannot do real login or per-broker dynamic dropdowns — the reason for the pivot.

## Related ADRs

* Extends [ADR-0001](0001-design-ktc-portal-as-two-gated-portals.md)

## References

* `package.json`, `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`
* `src/styles/*` — visionOS v2 tokens + KTC accent
