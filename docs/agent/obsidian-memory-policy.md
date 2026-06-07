# Obsidian Memory Policy

`docs/obsidian-vault/` is the repo's live memory — an Obsidian-compatible markdown vault. Keep it in sync so future sessions pick up cold without re-exploring the codebase.

## Vault structure

- `01-System/` — architecture, runtime target, release gate, operational invariants, tech stack
- `02-Cores/` — per-core operational summary (Authentication, Brokers, Consignees, Job Orders, Administration)
- `04-Workflows/` — operational chains
- `05-Concepts/` — domain concepts (owner failsafe, CAPTCHA, RLS posture, design system)
- `06-Sessions/` — historical session logs (append-only)
- `07-Memory/` — current state, pending items, roadmap, milestones, release waves, system scale
- `09-Future/` — non-committed ideas
- `Home.md` — entry point
- `README.md` — vault-level instructions

## When to update

**After every session** that produces meaningful changes — new features, schema updates, decisions, milestones, lasting fixes.

### Mandatory updates (per session)

1. Create a session note: `06-Sessions/YYYY-MM-DD Title.md` (what was done, decisions, pending). Wiki-link affected cores/workflows/concepts.
2. Append the session to `06-Sessions/Index.md`.
3. Update `07-Memory/Current State.md` — reflect new "what's live / in progress / next".
4. Prepend to `07-Memory/Completed Milestones.md`.
5. Update `07-Memory/Pending Items.md` — remove completed, add new.
6. Update the affected `02-Cores/<Core>/<Core>.md` if pages, tables, or RPCs changed.
7. Update `07-Memory/System Scale.md` if counts changed (migrations, consignees, routes).
8. Update `Home.md` if at-a-glance metrics changed.

### Optional updates

- New concept → `05-Concepts/<Name>.md`, link from Home and affected cores.
- New workflow → `04-Workflows/<Name>.md`.
- New ADR → reference it from affected core pages.

## Conventions

- **Wiki-links:** `[[Note Name]]` or `[[Note|alias]]`. Prefer wiki-links inside the vault so the Obsidian graph stays connected.
- **Frontmatter:** every note has YAML with `title`, `tags`, `type`, optional `wave`/`status`/`last_updated`.
- **Sessions:** always `YYYY-MM-DD Title.md`.
- **Cores:** each lives in its own folder so cross-core links show clearly in the graph.

## Why

The vault is external memory for KTC. Keeping it current is part of release-gate check 4 (change hygiene). Docs update alongside code or the gate fails.

## Opening the vault

Install Obsidian (free) → `Open folder as vault` → select `docs/obsidian-vault/` → `Ctrl+G` for graph view.
