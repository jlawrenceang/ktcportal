# Documentation Map (Current-State First)

Last updated: 2026-06-13

This repository uses **runtime-first documentation governance** (governing rules: `docs/agent/doc-governance.md`):

1. `src/App.tsx`, active page code, and workflow implementation are the frontend source of truth.
2. `supabase/migrations/` and active RPCs/triggers are the backend source of truth.
3. Current-state docs summarize implementation reality.
4. Historical docs are preserved in `docs/archive/` and append-only session notes — never deleted by agents (OWNER-only).

---

## 1) Core operating docs (authoritative)

- `CLAUDE.md` — top-level constitution.
- `AGENTS.md` — short Codex-oriented mirror.
- `docs/agent/` — modular instruction reference (one concern per file). Start at `docs/agent/README.md`. Doc governance itself: `docs/agent/doc-governance.md`.

## 2) Decision records

- `docs/adr/README.md` + `docs/adr/0001…0014` — Architecture Decision Records. ADRs preserve historical decisions; divergences are tracked via dated addenda, not history rewrites.
- `docs/adr/template.md` — ADR template. Write new ones with the `/adr` command.

## 3) Live memory (Obsidian vault)

- `docs/obsidian-vault/Home.md` — entry point with at-a-glance metrics (updated every session).
- `docs/obsidian-vault/01-System/*` — architecture, runtime target, release gate, operational invariants, tech stack.
- `docs/obsidian-vault/02-Cores/*` — per-core operational summaries (Authentication, Brokers/Customers, Consignees, Job Orders, Administration).
- `docs/obsidian-vault/04-Workflows/*` — operational chains (onboarding, accreditation, job-order lifecycle, BOC mirror).
- `docs/obsidian-vault/05-Concepts/*` — domain concepts (owner failsafe, CAPTCHA, RLS posture, agreement, design system).
- `docs/obsidian-vault/07-Memory/*` — current state, roadmap, pending items, milestones, release waves, system scale.
- `docs/obsidian-vault/06-Sessions/*` — historical session logs (append-only, non-authoritative).
- `docs/obsidian-vault/09-Future/*` — non-committed ideas.

## 4) Smoke tests

- `docs/smoke-test-template-canonical.md` — canonical structure for all smoke tests.
- `docs/smoke-test-01-portal.md` — ST01 (closed, PASS).
- `docs/smoke-test-02-portal.md` — **ST02 (current)** — lifecycle, payments, roles, security; the trial-run / go-live gate.

## 5) Other

- `docs/email-templates/` — branded Resend email templates.
- `docs/research/` — grounded research briefs (e.g. `navis-tos-landscape-2026-06-13.md`, the source-of-record behind the TOS north star / ADR-0015).
- `docs/archive/` — superseded docs (holding pen; see `docs/archive/README.md`). Includes the legacy pre-portal form/sheets-era specs and the original ST02 lifecycle script.
- Deferred folders (`docs/plans/`, `docs/audits/`, `docs/operator-guide/`, `docs/flows/`) are created on first need — see `docs/agent/doc-governance.md`.

When a document conflicts with runtime behavior, runtime behavior wins and the document must be updated or archived **in the same change**.
