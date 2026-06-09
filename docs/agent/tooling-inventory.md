# Tooling Inventory

Stable reference for repo-level tooling. Update this file when a tool is added or removed; do not restate these lists in `CLAUDE.md` or `AGENTS.md`.

## Commands (`.claude/commands/`)

- `adr.md` — `/adr` slash command for writing Architecture Decision Records. References `docs/adr/template.md`.

## Deploy / hosting tooling

- **Vercel CLI** — installed and linked locally (authed as `jlawrenceang`, project `ktc-joborderform`). Use for read-only checks: `vercel ls`, `vercel env ls`, `vercel domains ls`, `vercel logs`, `vercel inspect <url>`. Domain/account mutations are done in the Vercel dashboard.
- **Cloudflare** — used ONLY for the Turnstile CAPTCHA widget. DNS for `ktcterminal.com` is on Vercel, not Cloudflare. Do not move DNS to Cloudflare.

## Database tooling

- `scripts/run-migrations.mjs` — applies `supabase/migrations/*` over `DATABASE_URL` (session pooler, `ssl rejectUnauthorized:false`).
- `scripts/import-consignees.mjs` — one-off importer (loaded 2,488 consignees from `Customer.csv`).
- Supabase SQL Editor (KTC project `mdlnfhyylvapzdubhyic`) — manual fallback for applying SQL.

## MCP servers

- **None configured for KTC.** The `mcp__supabase__*` / `mcp__claude_ai_Supabase__*` tools available in-session point at **jta-sys**, not KTC — do not use them here (see `runtime-data-safety.md` and ADR-0002). All KTC DB work goes through the direct Postgres connection or the KTC SQL Editor.

## Skills

KTC ships no repo-scoped skills, subagents, or conventions yet. Global/host skills (frontend-design, code-review, etc.) are available via the Skill tool when useful — use selectively for non-trivial work.

## Testing (`e2e/`, Playwright)

- **Playwright** (`@playwright/test`) — headless E2E. Config `playwright.config.ts` (single chromium project; `BASE_URL` env, default `portal.ktcterminal.com`). Chromium installed via `npx playwright install chromium`.
- `e2e/smoke.spec.ts` — Phase 1 unauthenticated smoke (active, 8 tests). `e2e/authenticated.spec.ts` — Phase 2 (`test.fixme`, blocked on a CAPTCHA-free auth path). See `docs/agent/testing-and-release.md`.

## Build & scripts (`package.json`)

- `npm run dev` — Vite dev server.
- `npm run build` — `tsc && vite build`.
- `npm run lint` — `tsc --noEmit`.
- `npm run test:e2e` / `:ui` / `:report` — Playwright.
