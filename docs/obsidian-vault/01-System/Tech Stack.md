---
title: Tech Stack
tags: [system, stack]
type: system
---

# 💻 Tech Stack

## Frontend

- React 18 + TypeScript + Vite (SPA)
- TailwindCSS 3 + ported jta-sys visionOS v2 tokens (KTC accent: orange `#F26A21` / red `#D6321E`)
- react-router-dom 6
- `@supabase/supabase-js` 2 (plain hooks; no React Query / form library)

## Backend

- Supabase Postgres (tables + RLS + RPCs + triggers)
- Supabase Auth (email/password brokers; synthetic `@ktc-staff.local` staff usernames)
- Supabase Storage (`valid-ids` bucket; consignee 2303 documents)
- Cloudflare Turnstile CAPTCHA (server-verified by Supabase Auth)

## Hosting

- Vercel (project `ktc-joborderform`, `portal.ktcterminal.com`, DNS on Vercel)
- `vercel.json` — Vite preset + SPA rewrite to `/index.html`

## Build & checks

- `npm run dev` — Vite dev server
- `npm run build` — `tsc && vite build`
- `npm run lint` — `tsc --noEmit`
- No Vitest/Playwright suite yet (future hardening lane)

## Notes

- Runtime truth for routes: `src/App.tsx`
- Runtime truth for DB contract: `supabase/migrations/`
