---
title: 2026-06-14 Tagalog i18n + Mobile-Tablet UX Pass
tags: [session]
type: session
date: 2026-06-14
---

# 2026-06-14 → 06-16 — Tagalog i18n + Mobile/Tablet UX Pass

Two initiatives, run in sequence (i18n first, then mobile). Both **shipped to `main`**. Neither touched RLS or access controls.

## 1. Tagalog / Filipino localization — SHIPPED

Dependency-free i18n where **English is the translation key** and missing keys fall back to English (always shippable). Per-browser EN/FIL switch, default English. See [[Localization (i18n)]] for the full design.

- `9763e04` — i18n foundation: `src/lib/i18n.tsx` (`useT`/`t`), per-browser language switch, `LangToggle` in both navs + login.
- `ab7629e` — bulk localize the UI + tours (ran as an ultracode workflow: one agent per file wraps strings with `t()`, then chunked translation against a shared glossary).
- `6e33020` — localize manuals to Filipino (`manual-*.tl.md`) + language-variant `?raw` loading in `ManualPage.tsx` / `Manual.tsx`.
- `1591b8a` — first-run language chooser (`LanguageGate.tsx`), before the demo tour.
- `07ddb66` — fix: chooser must not appear during email confirmation (`/confirmed` establishes a transient session).
- `300403b` — Tagalog backfill: +203 keys for recent UI (dict now ~1,100 keys).
- `dfde65b` — glossary refinement: keep "vessel" and "rates"/"charges" in English (not *barko*/*singil*).

**Owner decisions honored:** scope = UI + tours + manuals (NOT system emails, NOT the Customer Agreement/legal); persistence per browser; **owner reviews `translations.ts` copy before go-live** (the one open thread).

## 2. Mobile / tablet UX pass — SHIPPED

"Mix" strategy: a paginated **wizard** for long flows, **dense single-page** for short ones. Scope = customer + admin. See [[Mobile & Tablet UX]].

- `b8460c7` — wave-1: responsive foundation + Job Order **wizard** (`Wizard.tsx`, used by `JobOrder.tsx`).
- `4bc1228` — mobile nav: hamburger + slide-in drawer.
- `3bc84a6` — desktop compaction: density layer + responsive 2-column fields.
- `ba372b8` / `519524e` — auto-scaling tile grid, larger logo, launcher tiles, nav affordance.
- `255c0cf` — dark-mode toggle moved next to the language toggle.
- `da4160b` — New Job Order: tour walks the wizard, uppercase fields, big-list editor.
- `d76987a` — unify nav: one hamburger drawer on all widths (desktop == mobile).
- `31f0d8f` — desktop/tablet parity with mobile.
- `0deebb7` — compact sizing across the whole app (customer + admin tabs).

## State at end of pass

- Migrations through **0119**, app **v1.4.0**, live on `portal.ktcterminal.com`.
- `tsc --noEmit` clean.
- Open thread: owner copy review of `translations.ts` before public go-live.

## Related

- [[Localization (i18n)]] · [[Mobile & Tablet UX]] · [[visionOS Design System]]
- [[Sessions Index]]

---

#sessions
