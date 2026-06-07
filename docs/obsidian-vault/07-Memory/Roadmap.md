---
title: Roadmap
tags: [memory, roadmap, planning]
type: memory
last_updated: 2026-06-07
---

# 🧭 Roadmap (Phased)

**Authoritative sequencing for KTC portal work.** Ordered by what ships next. When a phase finishes, its items move to [[Completed Milestones]] and the next phase becomes *Now*.

Legend: **COMPLETED** · **NOW** · **NEXT** · **LATER** · **PARKED**.

## COMPLETED ✅

- Schema (migrations 0001–0010) + 2,488-consignee import.
- Broker + admin portals; broker onboarding + approval; consignee CRUD + accreditation + approval; owner failsafe + invite-only staff.
- Vercel deploy + custom domain `portal.ktcterminal.com`.
- Turnstile CAPTCHA (server-enforced) on login + registration.
- Layered documentation system (constitution + `docs/agent/*` + ADRs + vault).

## NOW 🎯 — Prod-testing readiness

1. **Manual browser UAT** on `portal.ktcterminal.com` — widget renders, owner → Admin Portal, broker register→approve→submit.
2. **Set Supabase Auth URLs** — Site URL + Redirect URLs → `https://portal.ktcterminal.com`.

## NEXT — Admin processing + scoping

3. **Admin job-order processing** — statuses + decisions on `/admin/job-orders`; dashboard metrics on `/admin`.
4. **Per-broker consignee scoping** — brokers see/submit only against consignees they're accredited for.

## LATER — Go-live hardening

5. **Resend SMTP** — broker email confirmation + password reset (needs SPF/DKIM/MX on ktcterminal.com).
6. **Automated smoke tests** — Playwright against the deployed URL (auth, onboarding, consignee, job order).
7. **Public launch** — remove access restriction once UAT + email are solid.

## PARKED

- Jotform fallback (kept as a styled fallback; not maintained).
- Any native mobile app (responsive web only unless explicitly requested).

## Related

- [[Current State]] · [[Pending Items]] · [[Completed Milestones]] · [[Release Waves]] · [[Home]]
