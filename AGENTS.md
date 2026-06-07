# AGENTS.md

Codex-oriented mirror of `CLAUDE.md`. Read `CLAUDE.md` first — it is the constitution. This file adds Codex-specific operating stances only; it does not restate rules.

## Pointers

- Constitution: `CLAUDE.md`.
- Modular rule reference: `docs/agent/*` (one concern per file; start at `docs/agent/README.md`).
- Live memory: `docs/obsidian-vault/` (current state, roadmap, sessions, per-core pages).
- Decision history: `docs/adr/`.

## Operating stances

- **Audit before edit.** Confirm the runtime Supabase target and the live schema before any DB change (see `docs/agent/runtime-data-safety.md`). KTC has its own Supabase account; the connected MCP Supabase tools point at jta-sys — do not use them for KTC.
- **Protect controls first.** The owner failsafe, invite-only staff, broker-approval gate, and server-side CAPTCHA are load-bearing. Never weaken them for convenience.
- **Forward-only.** Never edit an applied migration; add a new one. `git push` ships the frontend only.
- **Prioritize** correctness and access-control integrity over UI polish when they conflict.

## Doc precedence

Runtime code > active DB contracts > current-state docs > planning notes > session history.
