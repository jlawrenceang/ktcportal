---
title: Pending Items
tags: [memory, pending, backlog]
type: memory
last_updated: 2026-06-07
---

# 📋 Pending Items

Detailed backlog. For sequencing, see [[Roadmap]].

## Prod-testing readiness (NOW)

- [ ] Manual browser UAT on `portal.ktcterminal.com` — Turnstile widget renders; owner login → `/admin`; broker register (valid-ID upload) → admin approve → submit job order.
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
