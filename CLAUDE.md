# CLAUDE.md

Top-level constitution for Claude Code in this repo. Living memory + detail lives in the project memory (`MEMORY.md` and `project_*.md`).

## Mission

Build and maintain the **KTC Container Terminal** broker portal — a port / container-terminal operations system where accredited brokers submit Job Orders (X-ray, DEA exam, OOG stripping, gate/yard requests) against their approved consignees, and KTC staff run a separate admin portal. Protect access controls before polishing UI. Prefer root-cause fixes over blind edits.

## Non-negotiables

- **Supabase isolation.** KTC has its OWN Supabase account/project: `mdlnfhyylvapzdubhyic`. The connected `mcp__supabase__*` and `mcp__claude_ai_Supabase__*` tools point at **jta-sys**, NOT KTC — never use them for KTC, and never apply KTC schema to jta-sys (or vice versa). Apply KTC migrations via the direct Postgres connection or the KTC SQL Editor.
- **Owner failsafe.** `jla.ktcport@gmail.com` is the server-only owner (`is_owner`) — overrides everything, cannot be locked out or revoked. Never weaken this.
- **Invite-only staff.** Admin/staff are owner-created (`rpc('create_staff')`, username + password, no email). No self-signup as admin.
- **Backend-enforced controls.** Auth, approvals, and access live in RLS + SECURITY DEFINER RPCs — not just the UI. CAPTCHA (Turnstile) is enforced server-side in Supabase.
- **Migrations are forward-only.** `git push` deploys the frontend to Vercel; it does NOT deploy DB changes.
- **Secrets.** The anon key + Turnstile site key are public/safe. The service_role key, DB password, and Turnstile secret must never be committed. `.env.local` is gitignored; env vars live in Vercel + Supabase.
- **Responsive web only.** No native mobile without an explicit ask.

## Stack

Vite + React 18 + TypeScript + Tailwind 3 + react-router-dom 6 + @supabase/supabase-js 2 (SPA). Supabase = Auth + Postgres + RLS + Storage. Deployed on Vercel at `portal.ktcterminal.com` (DNS on Vercel; Cloudflare used only for the Turnstile widget). `npm run lint` = `tsc --noEmit`; `npm run build` = `tsc && vite build`.

## Supporting docs (retrieve from project memory)

- `MEMORY.md` — system identity, scale, design decisions, milestones, pending work, links.
- `project_overview.md` — what the app is, stack, repo, Jotform origin.
- `project_data_model.md` — schema, roles, owner failsafe, access-control decisions.
- `project_supabase_isolation.md` — the separate-Supabase-account rule.
- `project_deployment.md` — Vercel, custom domain, env vars, CAPTCHA.

## Doc precedence

Runtime code > active DB contracts (migrations/RPCs) > MEMORY.md current-state > planning notes > session history. Runtime wins conflicts; fix or update the stale memory in the same change.
