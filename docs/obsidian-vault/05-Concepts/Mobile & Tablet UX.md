---
title: Mobile & Tablet UX
tags: [concept, frontend, mobile, design]
type: concept
---

# 📱 Mobile & Tablet UX Pass

Fable's UI was polished but desktop-first. The mobile/tablet pass (shipped 2026-06-14 → 06-16) made the portal genuinely phone- and tablet-ergonomic — brokers work on phones in the field, staff use tablets at floor stations. See [[2026-06-14 Tagalog i18n + Mobile-Tablet UX Pass]].

## Strategy — "Mix" (owner decision)

- **Multi-step wizard** for genuinely long flows.
- **Dense single-page** for short flows (login, payment upload, account).
- Goal: one view fits the screen, minimize scrolling, primary action always reachable, bigger touch targets.
- Scope = **customer + admin** (admin data tables made phone/tablet-friendly too, the hardest part).

## What shipped

- **Job Order wizard** — `src/components/Wizard.tsx`, used by `src/pages/JobOrder.tsx`. Paginated one-step-per-screen with **per-step validation gating Next** and a full re-check on submit (jumps to the offending step). The step is **lifted to page state** so the demo **tour walks the wizard** — each tour step reveals its fields — and resets to step 1 when the tour ends.
- **Unified navigation** — one hamburger **slide-in drawer on all widths** (desktop == mobile, `d76987a`); the dark-mode toggle sits next to the language toggle (in the rail on desktop, in the drawer on mobile).
- **Auto-scaling tile grid** for the launcher/menu; larger logo and touch targets; nav menu affordances.
- **Density / compaction layer** — responsive 2-column fields + a CSS density layer (`3bc84a6`), then **compact sizing across the whole app** — customer + admin tabs (`0deebb7`), including the rate calculator and the Consignees page. Desktop/tablet brought to parity with the mobile layout (`31f0d8f`).

## Boundaries

- **Responsive web only** — no native mobile (the separate role-aware **staff PWA / APK** is a different track; see [[Staff Roles & Gates]]).
- Did **not** touch RLS or access controls (UI/layout layer only).

## Related

- [[Localization (i18n)]] — shipped in the same pass
- [[visionOS Design System]] — the underlying design language
