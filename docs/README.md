# Documentation Map (Current-State First)

Last updated: 2026-06-07

This repository uses **runtime-first documentation governance**:

1. `src/App.tsx`, active page code, and workflow implementation are the frontend source of truth.
2. `supabase/migrations/` and active RPCs/triggers are the backend source of truth.
3. Current-state docs summarize implementation reality.
4. Historical docs are preserved (session notes are append-only).

---

## 1) Core operating docs (authoritative)

- `CLAUDE.md` — top-level constitution.
- `AGENTS.md` — short Codex-oriented mirror.
- `docs/agent/` — modular instruction reference (one concern per file). Start at `docs/agent/README.md`.

## 2) Decision records

- `docs/adr/README.md` + `docs/adr/0001…` — Architecture Decision Records. ADRs preserve historical decisions; divergences are tracked via dated addenda, not history rewrites.
- `docs/adr/template.md` — ADR template. Write new ones with the `/adr` command.

## 3) Live memory (Obsidian vault)

- `docs/obsidian-vault/01-System/*` — architecture, runtime target, release gate, operational invariants, tech stack.
- `docs/obsidian-vault/02-Cores/*` — per-core operational summaries (Authentication, Brokers, Consignees, Job Orders, Administration).
- `docs/obsidian-vault/04-Workflows/*` — operational chains (broker onboarding, accreditation, job-order submission).
- `docs/obsidian-vault/05-Concepts/*` — domain concepts (owner failsafe, CAPTCHA, RLS posture, design system).
- `docs/obsidian-vault/07-Memory/*` — current state, roadmap, pending items, milestones, release waves, system scale.
- `docs/obsidian-vault/06-Sessions/*` — historical session logs (append-only, non-authoritative).
- `docs/obsidian-vault/09-Future/*` — non-committed ideas.

When a document conflicts with runtime behavior, runtime behavior wins and the document must be updated or archived.
