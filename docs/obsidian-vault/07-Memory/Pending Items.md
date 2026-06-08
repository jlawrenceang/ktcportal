---
title: Pending Items
tags: [memory, pending, backlog]
type: memory
last_updated: 2026-06-07
---

# 📋 Pending Items

Detailed backlog. For sequencing, see [[Roadmap]].

## Prod-testing readiness (NOW)

- [ ] Execute **ST01 browser lanes** (`docs/smoke-test-01-portal.md`, lanes 1–5) on `portal.ktcterminal.com`. Preflight P1–P7 already PASS (2026-06-07); lanes 1–5 need a manual walk.
- [ ] Supabase Auth → URL Configuration: Site URL `https://portal.ktcterminal.com`; add Redirect URL `https://portal.ktcterminal.com/**`.

## Admin / processing (NEXT)

- [ ] `/admin/job-orders` — status workflow + decisions (process/complete/reject).
- [ ] `/admin` dashboard — live metrics (pending brokers, pending consignees, open job orders).
- [ ] Per-broker accredited-consignee scoping — restrict job-order targets to a broker's accredited consignees.

## Go-live hardening (LATER)

- [ ] Resend SMTP — broker email confirmation + password reset. Needs SPF/DKIM/MX on `ktcterminal.com` and Supabase SMTP config.
- [ ] Automated smoke tests (Playwright vs deployed URL).
- [ ] Process the 2,488 imported consignees through accreditation over time.
- [ ] Public launch (remove access restriction).

## Ops notes

- Turnstile secret rotated; lives only in Supabase. Site key in Vercel env (`VITE_TURNSTILE_SITE_KEY`).
- Changing a Vercel env var requires a redeploy.

## Related

- [[Roadmap]] · [[Current State]] · [[Home]]
