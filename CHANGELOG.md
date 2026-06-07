# Changelog

All notable changes to the KTC broker portal. Newest first. Dates are absolute (YYYY-MM-DD).

## [Unreleased]

### 2026-06-07
- Added the layered documentation system mirroring jta-sys: `CLAUDE.md` constitution, `AGENTS.md` Codex mirror, `docs/agent/*` modular instruction reference, `docs/adr/` ADR system (template + index + foundational ADRs 0001–0006), `/adr` command, and the `docs/obsidian-vault/` live-memory vault (01-System / 02-Cores / 04-Workflows / 05-Concepts / 06-Sessions / 07-Memory / 09-Future).
- Added Cloudflare Turnstile CAPTCHA to login + registration (`src/components/Turnstile.tsx`), enforced server-side in Supabase Auth. Gated behind `VITE_TURNSTILE_SITE_KEY`.
- Deployed to Vercel with custom domain `portal.ktcterminal.com` (DNS on Vercel). Added `vercel.json` (Vite preset + SPA rewrite).

### 2026-06-05
- Owner-only staff creation (username + password, no email) via `rpc('create_staff')` in admin Settings.
- Consignee accreditation details (address, TIN, 2303 document) + approval workflow + pagination + search/edit/delete/validation/duplicate guard.
- Initial schema: migrations `0001_init` … `0010_create_staff`. Imported 2,488 consignees from `Customer.csv`.

---

Format: keep an `[Unreleased]` section at the top; add a one-line entry per meaningful change under the session date. See `docs/agent/doc-governance.md`.
