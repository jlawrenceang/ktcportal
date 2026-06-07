---
title: Completed Milestones
tags: [memory, milestones]
type: memory
last_updated: 2026-06-07
---

# 🏁 Completed Milestones

Newest first.

## 2026-06-07 — Deploy + CAPTCHA + Docs System

- Deployed to Vercel; custom domain **`portal.ktcterminal.com`** live (DNS on Vercel, valid HTTPS, SPA deep-links).
- **Cloudflare Turnstile CAPTCHA** on login + registration, **server-enforced** in Supabase Auth (verified `captcha_failed` without a token). Owner-safe (`create_staff` bypasses the auth API).
- Vercel CLI installed + linked.
- **Layered documentation system** mirroring jta-sys: constitution (`CLAUDE.md` + `AGENTS.md`), `docs/agent/*`, ADRs 0001–0006 + `/adr` command, and this Obsidian vault.
- Session: [[2026-06-07 Deploy + CAPTCHA + Docs System]].

## 2026-06-05 — Schema + Portals

- Initial schema: migrations `0001_init` … `0010_create_staff`, all applied + verified against the KTC DB.
- Imported **2,488 consignees** from `Customer.csv`.
- Owner seeded (`jla.ktcport@gmail.com`, `is_owner`).
- Broker portal (register w/ valid-ID upload, pending→approved gate, home) + admin portal (approvals, brokers, consignees, job orders, settings).
- Consignees: search, pagination, CRUD, duplicate guards, approval, accreditation (address/TIN/2303).
- Owner-only staff creation via `rpc('create_staff')` (username + password, no email) — verified end-to-end.

## Related

- [[Current State]] · [[Roadmap]] · [[Home]]
