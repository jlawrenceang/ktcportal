# CLAUDE.md

Top-level constitution for Claude Code.

## Mission

Maintain software for **KTC Container Terminal Corp.**, a container-terminal / port-services / depot operator. Current scope: the **KTC Online Portal**. Business background, roadmap, north star, and full scope → `docs/obsidian-vault/01-System/Business Context.md`.

## Non-negotiables

- **Backend-enforced access.** Auth, approvals, roles live in RLS + SECURITY DEFINER RPCs, not the frontend. CAPTCHA server-enforced.
- **Runtime authority `src/lib/supabase.ts`** (prod `mdlnfhyylvapzdubhyic`). The connected `mcp__supabase__*` tools point at **jta-sys** — never use them here. See `docs/agent/runtime-data-safety.md`.
- **Owner failsafe.** `jlawrenceang@gmail.com` is the server-only owner — overrides everything, cannot be locked out. Staff invite-only; no self-signup.
- **Forward-only migrations.** `git push` deploys the frontend to Vercel, not DB changes.
- **Responsive web only.** No native mobile without an explicit ask.

## Operating doctrine

Optimize for the **end state, decisively** — sequence by dependency (defer non-blocking frontend; the endpoint can't wait), break cleanly over thrashing to preserve an intermediate, minimize error but never go in circles. (Global First Principle 10 · memory `operate-ruthless-endpoint-first`.)

## Release gate

Every plan, change, review, and merge passes the six checks in `docs/agent/release-gate.md`; failure blocks release.

## Supporting docs

- `docs/obsidian-vault/01-System/Business Context.md` — business background + product scope.
- `docs/agent/README.md` — modular rules index. `docs/obsidian-vault/` — live memory.
- `AGENTS.md` — Codex mirror + standing agent/tooling authority. `docs/README.md` — docs map.

## Doc precedence

Precedence (high→low): runtime code, active DB contracts, current-state docs, planning notes, sessions. Runtime wins; fix/archive the stale doc same-change.
