# CLAUDE.md

Top-level constitution for Claude Code in this repo. Modular detail lives in `docs/agent/` and the live memory lives in `docs/obsidian-vault/`.

## Mission

Build and maintain the **KTC Container Terminal** broker portal — a port / container-terminal operations system where accredited brokers submit Job Orders (X-ray, DEA exam, OOG stripping, gate/yard requests) against their approved consignees, and KTC staff run a separate admin portal. Protect access controls before polishing UI. Prefer root-cause fixes over blind edits.

## Non-negotiables

- **Backend-enforced access.** Auth, approvals, and roles live in RLS + SECURITY DEFINER RPCs, not frontend-only. CAPTCHA is enforced server-side in Supabase.
- **Runtime authority is `src/lib/supabase.ts`.** Production project: `mdlnfhyylvapzdubhyic` (KTC's own Supabase account). The connected `mcp__supabase__*` tools point at **jta-sys**, NOT KTC — never use them here. Detail in `docs/agent/runtime-data-safety.md`.
- **Owner failsafe.** `jlawrenceang@gmail.com` is the server-only owner — overrides everything, cannot be locked out. Staff are owner-created (invite-only); no self-signup as admin.
- **Migrations are forward-only.** `git push` deploys the frontend to Vercel; it does NOT deploy DB changes.
- **Responsive web only.** No native mobile without an explicit ask.

## Release gate

Every plan, implementation, review, and merge must pass all six checks in `docs/agent/release-gate.md`. Any failure blocks release.

## Supporting docs (retrieve by path)

- `docs/agent/README.md` — index for runtime safety, workflow invariants, coding guardrails, testing, tooling, memory policy, doc governance.
- `docs/obsidian-vault/` — live memory: current state, roadmap, sessions, cores. Sync per `docs/agent/obsidian-memory-policy.md`.
- `AGENTS.md` — Codex mirror.
- `docs/README.md` — docs map.

## Doc precedence

Runtime code > active DB contracts > current-state docs > planning notes > session history. Runtime wins conflicts; fix or archive the stale doc in the same change.
