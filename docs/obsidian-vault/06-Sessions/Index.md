---
title: Sessions Index
tags: [sessions, moc]
type: moc
---

# 📅 Sessions Index

Chronological log of development sessions. Each note captures what was done, decided, and pending.

## 2026-06

- [[2026-06-14 Tagalog i18n + Mobile-Tablet UX Pass]] — two sequenced initiatives, both shipped (06-14→06-16): **Tagalog/Filipino i18n** (dependency-free, English-as-key with English fallback, ~1,100 keys, per-browser EN/FIL toggle, first-run `LanguageGate`, localized tours + `manual-*.tl.md`) and the **mobile/tablet UX pass** ("Mix": JO `Wizard.tsx` for long flows + dense single-page for short; unified hamburger drawer on all widths; app-wide density/compaction). No RLS changes. Open thread: owner reviews `translations.ts` copy before go-live.
- [[2026-06-16 Vessel Monitoring v2 + Pro Load Test + Busy Banner]] — v1.4.0 (migrations **0107–0111**, ADR-0023): vessel schedule synced from ops' live Google Sheet (`vessel-sync` hourly + "Sync sheet" button), 14-col date+time layout, computed Last Free Day mirrored back, derived vessel_visit, in-house line hiding; "servers are busy" banner + Refresh; ultracode review (15 findings, high/medium fixed in 0111) + Pro-tier prod load test (~136 filings/s @ 300 in-flight, zero integrity failures).
- [[2026-06-16 Staff Roles, Supplements, Per-Van X-Ray, Verify]] — big multi-build day (migrations **0076–0104**): staff role matrix (csr role + split accept/hold-reject/complete gates + checker-only X-ray), multi-owner + root grants, two-gate completion (services + base payment + RPS + supplements), per-van X-ray + e-signature, public verify-QR anti-forgery, cashier station + walk-in payment, additional-charge supplements + under-review, comment escalation (staff-only notes + complaint flag), generalized priority queue, staff edit, plus the earlier same-day rate-calculator/charge-rules/support-tickets/admin-bottom-nav/staff-notifications cluster.
- [[2026-06-13 Doc Governance + ST02 Trial Run]] — ST02 preflight closed green (P8 Playwright 16/16 after key regen; crons verified); doc governance hardened to jta-sys parity (freshness directive, OWNER-only deletion, `docs/archive/` holding pen, full script inventory) + vault resynced to v1.1.0 (55 migrations).
- [[2026-06-11 App Review + visionOS Theme]] — two-track full review (backend RLS sweep: clean, one cap-race medium → fixed in migration `0031` w/ advisory lock; frontend flow/UX sweep: double-submit guard added, Approvals ID-deletion failure surfaced) + **visionOS theme layer v2** (material tiers, ambient aurora, spring card physics, status chips, skeletons, focus ring).
- [[2026-06-10 Processing + Slip + Account + Polish]] — admin job-order processing (approve=processing / hold / reject w/ note, migration `0029`, ADR-0014); printable A6 invoice-style slip with ON PROCESS watermark; My Account self-service w/ re-verify-on-name-change (migration `0028`, ADR-0013); login lockout, bulk paste, collapsible orders, unified Notice, square frosted-glass dashboard. Tag `checkpoint-2026-06-10`. **Captures the current end-to-end flow + open decisions/gaps for the next session.**
- [[2026-06-07 Deploy + CAPTCHA + Docs System]] — deployed to Vercel at `portal.ktcterminal.com` (custom domain, DNS on Vercel); added Cloudflare Turnstile CAPTCHA to login + registration (server-enforced in Supabase); installed + linked the Vercel CLI; built the full layered documentation system (constitution, `docs/agent/*`, ADRs 0001–0006, Obsidian vault) mirroring jta-sys.
- `2026-06-05 Schema + Portals` — initial schema (migrations `0001`–`0010`), 2,488 consignees imported, owner seeded, broker + admin portals, consignee CRUD + accreditation + approval, owner-only staff creation (`create_staff`).

## Related
- [[Completed Milestones]]
- `CHANGELOG` in repo root
- [[Home]]

---

#sessions #moc
