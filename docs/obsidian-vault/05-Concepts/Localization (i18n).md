---
title: Localization (i18n)
tags: [concept, frontend, i18n]
type: concept
---

# 🌐 Localization (i18n) — English / Filipino

The portal ships **bilingual (English + Tagalog/Filipino)**, per-browser switchable. Shipped 2026-06-14 → 06-16. See [[2026-06-14 Tagalog i18n + Mobile-Tablet UX Pass]].

## How it works

- **Dependency-free.** No i18n library. `src/lib/i18n.tsx` exposes `useT()` → `t('English text', { vars })`. **English IS the lookup key** — components wrap user-facing strings with `t('…')`, and the Filipino dictionary maps that exact English string to its translation.
- **Dictionary:** `src/lib/translations.ts` — `export const tl: Record<string,string>` (~**1,100 keys**). Anything not in the dict **falls back to English automatically**, so the app is always shippable mid-translation.
- **Interpolation:** `t('Hello {name}', { name })` substitutes `{name}` in either language.
- **Persistence:** per browser via `localStorage` (`ktc_lang` = `en|tl`, `ktc_lang_set` = explicit-choice flag). Default English.
- **Toggle:** `LangToggle` (EN/FIL) lives in both navs and on the login screen.
- **First-run chooser:** `src/components/LanguageGate.tsx` shows once after sign-in (gated on `langChosen`), **before** the demo tour, suppressed on pre-auth / `/confirmed` routes. Picking via the nav toggle or login satisfies it, so returning users never see it.
- **Tours localize for free** — `Tour.tsx` renders `t(step.title/body)`, so walkthroughs run in the chosen language (and are gated until a language is chosen).
- **Manuals localized** as `src/content/manual-*.tl.md` (admin / operations / cashier / checker / customer), loaded via `?raw` language-variant imports + a lang switch in `ManualPage.tsx` and `Manual.tsx`.

## House style (the glossary)

Natural conversational **Taglish** — keep industry terms in English, translate the connective / instruction words. Terms intentionally kept English: **Job Order, container, X-ray, DEA, OOG, consignee, voyage, berth, vessel, rates/charges, email, password, RPS, invoice, OR, serving number**. ("vessel" stays "vessel" not *barko*; "charges"/"rates" stay English not *singil*.) Identity entries (`tl === en`) deliberately preserve a term in English.

## Scope & boundaries

- **In scope:** UI strings, tours, manuals.
- **Out of scope (stay English):** system/transactional **emails**, and the **Customer Agreement / legal** copy (lawyer-reviewed separately — see [[Broker Agreement]]).

## Status

Shipped and live. **One open thread:** the owner reviews `translations.ts` wording before public go-live (owner decision: "I draft, owner reviews"). `translations.ts` is the source of truth for Filipino copy — edit freely.

## Related

- [[Mobile & Tablet UX]] — shipped in the same pass
- [[visionOS Design System]] · [[Roadmap]]
