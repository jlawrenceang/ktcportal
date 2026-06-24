# Documentation Governance

How instruction and reference docs stay coherent across `CLAUDE.md`, `AGENTS.md`, `docs/agent/*`, the Obsidian vault, and the rest of `docs/`. This file is the governing body for the documentation system: when doc-handling questions arise, this file decides.

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
| Constitution | `CLAUDE.md` | Mission, non-negotiables, runtime authority, release-gate pointer, supporting-doc index. **≤150w soft / 200 hard** (owner-confirmed at 198); narrative → Business Context. |
| Codex mirror | `AGENTS.md` | Short pointer into the constitution + Codex operating stances. No duplicate rules. |
| Modular reference | `docs/agent/*` | One concern per file. Detail behind the constitution. Stable; retrievable by path. |
| Live memory | `docs/obsidian-vault/` | Current state, roadmap, sessions, per-core pages. Changes every session. |
| Decision history | `docs/adr/` | Architecture Decision Records. Historical intent is never rewritten — divergences get dated addenda. |
| Operational docs | `docs/*.md` | Smoke tests, specs, guides. Runtime-aligned. |
| Archive | `docs/archive/`, `06-Sessions/` | Historical, read-only. |

Rule: a rule has exactly one owning file. Every other file references it by path. A non-negotiable may be restated as a single one-line anchor in `CLAUDE.md` when an agent must see it before opening any supporting doc — the detail still lives in one owning file.

## What belongs where

- `CLAUDE.md` contains the mission, non-negotiables, runtime-authority line, release-gate pointer, supporting-doc index, doc-precedence line — **and nothing else**. If new content can't live in `docs/agent/*`, question whether it belongs in the constitution at all.
- `AGENTS.md` contains only the re-pointer plus Codex-specific stances.
- `docs/agent/*` holds durable rules — nothing that should live in the vault.
- The vault holds snapshots: what is live, what is pending, what was done — with wiki-links.

What does NOT belong in instruction docs:

- Long historical narrative — that lives in `06-Sessions/`.
- Session-by-session changelog detail — that lives in `CHANGELOG.md` / `06-Sessions/`.
- Counts, metrics, dates, "currently X" snapshots — those live in `07-Memory/`.
- Content already maintained in an ADR.

## Freshness directive (OWNER, 2026-06-13)

1. **No stale documents, ever.** Docs update in the same change that makes them stale — never in a later "doc pass." If updating a superseded doc isn't worth it, it moves to `docs/archive/` immediately. A green release-gate check 4 requires this.
2. **Deletion is OWNER-only.** `docs/archive/` is the holding pen: agents archive, never purge. The OWNER periodically reviews the archive and decides deletion or revival. Nothing leaves the repo without an explicit OWNER call.
3. **The vault map is always current.** Every working session updates the navigational layer — `Home.md`, `07-Memory/Current State.md`, `Pending Items.md`, the session note + `06-Sessions/Index.md`, and wiki-links on affected notes (see `obsidian-memory-policy.md`).

## How to change the instruction system

1. Make the change in the **owning file only**. Remove any duplicate.
2. If behavior or policy shifts materially, add or update an ADR (`/adr`).
3. Update `CHANGELOG.md` under `[Unreleased]`.
4. Verify no rule now lives in more than one file.
5. Keep `CLAUDE.md` ≤150 words (soft cap); 150–200 requires explicit owner confirmation; never exceed 200 (hard cap, per the global bible). The mission, two-pillar roadmap, and background now live in `docs/obsidian-vault/01-System/Business Context.md`, not the constitution — that move brought `CLAUDE.md` to 198 words (owner-confirmed). If new content can't live there or in `docs/agent/*`, question whether it belongs in the constitution at all.

## Review checklist (before merging doc changes)

- [ ] No rule duplicated across files.
- [ ] `CLAUDE.md` within cap (≤150 soft / 200 hard).
- [ ] All new rules live in an owning file under `docs/agent/*` or the vault.
- [ ] Stale docs updated or archived, not silently contradicted.
- [ ] ADR added/updated if a policy shifted.
- [ ] `CHANGELOG.md` updated.
- [ ] Vault navigational layer updated if state changed.

## Archival rule

Do not delete historical docs. Move superseded docs to `docs/archive/` with their original name (plus an optional dated suffix), note the successor at the top of the archived file or in `docs/archive/README.md`, and fix any links that pointed at the old location — all in the same change. Session history in `06-Sessions/` is append-only and archival by default. Current-state docs are updated in place (runtime-first) rather than forked into stale copies.

## Deferred folders (create on first need, jta-sys naming)

These jta-sys folders are intentionally absent while KTC stays small. Create them with these exact names the first time content exists — do not invent variants:

- `docs/plans/` — execution programs (`YYYY-MM-DD-slug.md`) with an executor-protocol README.
- `docs/audits/` — multi-agent review/audit findings.
- `docs/operator-guide/` — read-only "how the system behaves" runbooks for staff (until then, the role manuals in `src/content/manual-*.md` and ST smoke tests fill this role).
- `docs/flows/` — visual flow diagrams / route-action matrices (until then, `04-Workflows/` in the vault is the home).
