# Tooling Inventory

Stable reference for repo-level tooling. Update this file when a tool is added or removed; do not restate these lists in `CLAUDE.md` or `AGENTS.md`.

## Commands (`.claude/commands/`)

- `adr.md` — `/adr` slash command for writing Architecture Decision Records. References `docs/adr/template.md`.

## Deploy / hosting tooling

- **Vercel CLI** — installed and linked locally (authed as `jlawrenceang`, project `ktc-joborderform`). Use for read-only checks: `vercel ls`, `vercel env ls`, `vercel domains ls`, `vercel logs`, `vercel inspect <url>`. Domain/account mutations are done in the Vercel dashboard.
- **Cloudflare** — used ONLY for the Turnstile CAPTCHA widget. DNS for `ktcterminal.com` is on Vercel, not Cloudflare. Do not move DNS to Cloudflare.

## Database tooling

- `scripts/run-migrations.mjs` — applies `supabase/migrations/*` over `DATABASE_URL`; tracks applied files in `public._migrations` and applies only new ones. **Latest applied = `0104`** (`0104_open_supplement_flag.sql`); all forward-only. Add a new `01xx` file and run it.
- `scripts/verify-schema.mjs` — read-only schema sanity check against `DATABASE_URL`.
- `scripts/import-consignees.mjs` — one-off importer (loaded 2,488 consignees from `Customer.csv`).
- Supabase SQL Editor (KTC project `mdlnfhyylvapzdubhyic`) — manual fallback for applying SQL.
- Pooler note: the session pooler (`:5432`) occasionally exhausts mid-session — swap to the transaction pooler (`:6543`) for one-off scripts.

## Ops / setup scripts (`scripts/`)

All read the gitignored `.env.local`; none print or commit secrets.

| Script | Purpose | Needs |
|---|---|---|
| `set-vault-secrets.mjs` | Upserts Resend key/sender into Supabase Vault for the email triggers. Reads `.env.local` over any stale ambient `RESEND_API_KEY` shell var. | `DATABASE_URL`, `RESEND_API_KEY`, `RESEND_FROM` |
| `setup-id-purge.mjs` | Puts `service_role_key` + `project_url` in Vault so the hourly `purge_expired_ids()` cron can delete expired ID files via the Storage API (already run — purge is ACTIVE). | `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL` |
| `setup-boc-mirror.mjs` | Deploys + configures the BOC Sheets mirror Edge Function (deploy, secrets, Vault wiring for the hourly cron). Blocked until Google service-account creds exist. | `SUPABASE_ACCESS_TOKEN` (PAT), Google creds |
| `set-auth-email-template.mjs` | Installs the branded confirm-signup template + subject into GoTrue via the Management API (only programmatic way — templates aren't in Postgres). | `SUPABASE_ACCESS_TOKEN` (PAT) |
| `set-auth-security.mjs` | Tightens server-side GoTrue security settings (e.g. password min length). | `SUPABASE_ACCESS_TOKEN` (PAT) |
| `check-auth-rate-limits.mjs` | Read-only print of Auth rate-limit/security settings (verifies the server limits behind the cosmetic client lockout). | `SUPABASE_ACCESS_TOKEN` (PAT) |
| `send-test-email.mjs` | Sends the confirm-signup template to yourself via Resend to preview rendering. | `RESEND_API_KEY`, `RESEND_FROM` |

> ⚠️ **Management-API scripts are currently broken:** `SUPABASE_ACCESS_TOKEN` in `.env.local` holds a project **secret API key** (`sb_secret_…`), not a personal access token (`sbp_…`). The Management API rejects it (verified 2026-06-13). Generate a PAT (Dashboard → Account → Access Tokens) before running the four PAT-marked scripts.

## MCP servers

- **None configured for KTC.** The `mcp__supabase__*` / `mcp__claude_ai_Supabase__*` tools available in-session point at **jta-sys**, not KTC — do not use them here (see `runtime-data-safety.md` and ADR-0002). All KTC DB work goes through the direct Postgres connection or the KTC SQL Editor.

## Skills

KTC ships no repo-scoped skills, subagents, or conventions yet. Global/host skills (frontend-design, code-review, etc.) are available via the Skill tool when useful — use selectively for non-trivial work.

## Testing (`e2e/`, Playwright)

- **Playwright** (`@playwright/test`) — headless E2E. Config `playwright.config.ts` (single chromium project; `BASE_URL` env, default `portal.ktcterminal.com`). Chromium installed via `npx playwright install chromium`.
- `e2e/smoke.spec.ts` — Phase 1 unauthenticated smoke (active, 11 tests). `e2e/authenticated.spec.ts` + `e2e/helpers/session.ts` — Phase 2 authenticated harness (service-role magic-link minting; runs when `E2E_SUPABASE_URL`/`E2E_SERVICE_ROLE_KEY` set, else skips). See `docs/agent/testing-and-release.md`, `e2e/README.md`, ADR-0010.

## Build & scripts (`package.json`)

- `npm run dev` — Vite dev server.
- `npm run build` — `tsc && vite build`.
- `npm run lint` — `tsc --noEmit`.
- `npm run test:e2e` / `:ui` / `:report` — Playwright.
