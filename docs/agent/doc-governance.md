# Documentation Governance

How instruction and reference docs stay coherent across `CLAUDE.md`, `AGENTS.md`, `docs/agent/*`, the Obsidian vault, and the rest of `docs/`.

## Source-of-truth precedence

When documentation conflicts, use this order:

1. Runtime code and route tree (`src/App.tsx`, active pages and components).
2. Active DB contracts (`supabase/migrations/`, live RPCs, triggers).
3. Current-state docs (Obsidian core pages, `07-Memory/Current State.md`).
4. Older markdown and planning notes.
5. Historical session records.

When a doc conflicts with runtime, runtime wins. Fix or archive the stale doc in the same change.

## Instruction-file layering

| Layer | File(s) | What it holds |
|---|---|---|
| Constitution | `CLAUDE.md` | Mission, non-negotiables, runtime authority, release-gate pointer, supporting-doc index. Short. |
| Codex mirror | `AGENTS.md` | Short pointer into the constitution + Codex operating stances. |
| Modular reference | `docs/agent/*` | One concern per file. Detail behind the constitution. |
| Live memory | `docs/obsidian-vault/` | Current state, roadmap, sessions, per-core pages. Changes every session. |
| Decision history | `docs/adr/` | Architecture Decision Records. |

Rule: a rule has exactly one owning file. Every other file references it by path. A non-negotiable may be restated as a single one-line anchor in `CLAUDE.md` when an agent must see it before opening any supporting doc — the detail still lives in one owning file.

## What does NOT belong in instruction docs

- Long historical narrative — that lives in `06-Sessions/`.
- Session-by-session changelog detail — that lives in `CHANGELOG.md` / `06-Sessions/`.
- Counts, metrics, dates, "currently X" snapshots — those live in `07-Memory/`.
- Content already maintained in an ADR.

## How to change the instruction system

1. Make the change in the **owning file only**. Remove any duplicate.
2. If behavior or policy shifts materially, add or update an ADR (`/adr`).
3. Update `CHANGELOG.md` under `[Unreleased]`.
4. Verify no rule now lives in more than one file.

## Review checklist (before merging doc changes)

- [ ] No rule duplicated across files.
- [ ] All new rules live in an owning file under `docs/agent/*` or the vault.
- [ ] Stale docs updated or archived, not silently contradicted.
- [ ] ADR added/updated if a policy shifted.
- [ ] `CHANGELOG.md` updated.

## Archival rule

Do not delete historical docs. Session history in `06-Sessions/` is append-only and archival by default. When a current-state doc is superseded, update it in place (runtime-first) rather than forking a stale copy.
