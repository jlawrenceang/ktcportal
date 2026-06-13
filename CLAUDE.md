# CLAUDE.md

Top-level constitution for Claude Code.

## Mission

Maintain software for **KTC Container Terminal Corp.** — a container-terminal, port-services, and container-depot operator. Current scope: the **KTC Online Portal**, where accredited customers (customs brokers) file Job Orders against consignees and KTC staff run a separate admin portal. North star: grow it modularly toward a Navis-style terminal + depot operating system (`docs/obsidian-vault/09-Future/`). Protect access controls before UI polish.

## Non-negotiables

- **Backend-enforced access.** Auth, approvals, roles live in RLS + SECURITY DEFINER RPCs, not frontend-only. CAPTCHA is server-enforced in Supabase.
- **Runtime authority is `src/lib/supabase.ts`** (production `mdlnfhyylvapzdubhyic`). The connected `mcp__supabase__*` tools point at **jta-sys** — never use them here. See `docs/agent/runtime-data-safety.md`.
- **Owner failsafe.** `jlawrenceang@gmail.com` is the server-only owner — overrides everything, cannot be locked out. Staff invite-only; no admin self-signup.
- **Migrations are forward-only.** `git push` deploys the frontend to Vercel, NOT DB changes.
- **Responsive web only.** No native mobile without an explicit ask.

## Release gate

Every plan, change, review, and merge must pass all six checks in `docs/agent/release-gate.md`; any failure blocks release.

## Supporting docs

- `docs/agent/README.md` — modular rules index.
- `docs/obsidian-vault/` — live memory; sync per `docs/agent/obsidian-memory-policy.md`.
- `AGENTS.md` — Codex mirror. `docs/README.md` — docs map.

## Doc precedence

Runtime code > active DB contracts > current-state docs > planning notes > session history. Runtime wins; fix or archive the stale doc same-change.
