---
title: CAPTCHA Bot Protection
tags: [concept, security, captcha]
type: concept
---

# 🛡️ CAPTCHA Bot Protection

Cloudflare Turnstile on login + registration, enforced server-side by Supabase Auth.

## How it works

1. The Turnstile widget renders on the login form (`src/components/Turnstile.tsx`), gated behind `VITE_TURNSTILE_SITE_KEY` (blank = CAPTCHA off).
2. The widget produces a single-use token; it's passed through `signIn`/`signUp` (`src/lib/AuthContext.tsx`) as `options.captchaToken`.
3. **Supabase Auth verifies the token server-side** against the Turnstile **secret** key (Supabase → Authentication → Attack Protection). Without a valid token the auth API returns `captcha_failed` — so a bot cannot bypass it by calling the API directly.

## Keys

- **Site key** (public, in `VITE_TURNSTILE_SITE_KEY`): `0x4AAAAAADf_oKtFqQwj9HoP`.
- **Secret key** (private): lives only in Supabase Auth. Rotated after initial setup. Never in the repo or chat.

## Owner-safe

`rpc('create_staff')` bypasses the auth API, so CAPTCHA never blocks the owner from creating staff. See [[Owner Failsafe]].

## Operational notes

- Turnstile hostnames must include `portal.ktcterminal.com` (and `ktc-joborderform.vercel.app`).
- Changing `VITE_TURNSTILE_SITE_KEY` in Vercel requires a redeploy (build-time inlining).
- DNS is on Vercel; Cloudflare is used ONLY for this widget.

## Related

- [[Authentication]] · [[Owner Failsafe]]
- ADR-0006 · `docs/agent/runtime-data-safety.md`
