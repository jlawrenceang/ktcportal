# `docs/agent/` — Modular Instruction Reference

Durable supporting rules for Claude Code, Codex, and any other coding agent working this repo.

## How this system is layered

| Layer | File(s) | Purpose |
|---|---|---|
| Constitution | `CLAUDE.md` | Immutable top-level rules. Short by design. |
| Codex mirror | `AGENTS.md` | Codex-oriented operational mirror. Short. |
| Modular reference | `docs/agent/*` (this folder) | Stable, retrievable-by-path detail for each concern. |
| Live memory | `docs/obsidian-vault/` | What is live today, roadmap, sessions, per-core pages. |
| Decision history | `docs/adr/` | Architecture Decision Records. |
| Historical archive | `docs/obsidian-vault/06-Sessions/` | Dated session material. Read-only. |

Rule: the constitution names a concern, this folder owns the detail, the vault records the current snapshot.

## File map

| File | Read when |
|---|---|
| `release-gate.md` | Planning, implementing, reviewing, or merging any change. |
| `runtime-data-safety.md` | Touching Supabase, migrations, RPCs, triggers, secrets, or deployment. |
| `workflow-invariants.md` | Touching auth, approvals, accreditation, job orders, or the owner/staff model. |
| `coding-guardrails.md` | Writing or editing TypeScript/React, hooks, or commits. |
| `testing-and-release.md` | Verifying a change or gating a release. |
| `tooling-inventory.md` | Picking a tool, CLI, or MCP server. |
| `obsidian-memory-policy.md` | Ending a session, or writing session/milestone/core notes. |
| `doc-governance.md` | Updating `CLAUDE.md`, `AGENTS.md`, any doc under `docs/`, or resolving stale docs. |

## Operating rules for this folder

- One concern per file. No cross-posting rules between files.
- Keep each file compact. If a section grows past ~150 lines, split it.
- Never restate a rule from `CLAUDE.md`/`AGENTS.md` here — assume the reader already has the constitution loaded.
- When a rule changes, update the owning file only, then link forward from any dependent file (no duplicated wording).
- See `doc-governance.md` for update process and precedence.
