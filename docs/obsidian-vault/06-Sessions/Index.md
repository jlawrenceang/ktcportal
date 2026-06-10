---
title: Sessions Index
tags: [sessions, moc]
type: moc
---

# 📅 Sessions Index

Chronological log of development sessions. Each note captures what was done, decided, and pending.

## 2026-06

- [[2026-06-10 Processing + Slip + Account + Polish]] — admin job-order processing (approve=processing / hold / reject w/ note, migration `0029`, ADR-0014); printable A6 invoice-style slip with ON PROCESS watermark; My Account self-service w/ re-verify-on-name-change (migration `0028`, ADR-0013); login lockout, bulk paste, collapsible orders, unified Notice, square frosted-glass dashboard. Tag `checkpoint-2026-06-10`. **Captures the current end-to-end flow + open decisions/gaps for the next session.**
- [[2026-06-07 Deploy + CAPTCHA + Docs System]] — deployed to Vercel at `portal.ktcterminal.com` (custom domain, DNS on Vercel); added Cloudflare Turnstile CAPTCHA to login + registration (server-enforced in Supabase); installed + linked the Vercel CLI; built the full layered documentation system (constitution, `docs/agent/*`, ADRs 0001–0006, Obsidian vault) mirroring jta-sys.
- `2026-06-05 Schema + Portals` — initial schema (migrations `0001`–`0010`), 2,488 consignees imported, owner seeded, broker + admin portals, consignee CRUD + accreditation + approval, owner-only staff creation (`create_staff`).

## Related
- [[Completed Milestones]]
- `CHANGELOG` in repo root
- [[Home]]

---

#sessions #moc
