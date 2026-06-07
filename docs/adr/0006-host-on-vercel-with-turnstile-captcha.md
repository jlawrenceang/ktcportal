# ADR-0006: Host on Vercel and gate auth with Turnstile CAPTCHA

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-07
* Category: Integration | Security

## Context and Problem Statement

The portal needs hosting for prod testing (free, not yet public) and protection of the public login/registration endpoints from bots and credential-stuffing. The question is where to host and how to add bot protection without locking out the owner.

## Decision Drivers

* Free hosting suitable for a Vite SPA, with a custom domain and HTTPS.
* Auto-deploy on push; simple env-var management.
* Bot/abuse protection on login + registration that cannot be bypassed by calling the API directly.
* The owner/staff-creation path must never be blocked by CAPTCHA.

## Considered Options

* **Hosting:** Vercel (chosen) vs Netlify vs self-host.
* **CAPTCHA:** Cloudflare Turnstile (chosen) vs hCaptcha vs Google reCAPTCHA.

## Decision Outcome

Chosen: **Vercel** for hosting (project `ktc-joborderform`, custom domain `portal.ktcterminal.com`, DNS on Vercel, `vercel.json` = Vite preset + SPA rewrite, auto-deploy on push to `main`), and **Cloudflare Turnstile** for CAPTCHA on login + registration. The Turnstile token is passed through `signIn`/`signUp` and **verified server-side by Supabase Auth** (Attack Protection), so direct API calls without a token are rejected (`captcha_failed`). CAPTCHA is gated behind `VITE_TURNSTILE_SITE_KEY` (blank disables it). The owner/staff-creation RPC bypasses the auth API, so CAPTCHA never locks the owner out.

### Positive Consequences

* Free, fast, custom-domain hosting with auto-deploys and a usable CLI.
* Bot protection enforced at the server, not just the widget — unbypassable via direct API.
* Turnstile is free, unlimited, and less intrusive than reCAPTCHA/hCaptcha.
* DNS stays on Vercel; Cloudflare is used only for the widget.

### Negative Consequences / Trade-offs

* Env-var changes require a Vercel redeploy (inlined at build time).
* CAPTCHA secret must be managed in Supabase; the secret was rotated after initial setup.
* Cloudflare account needed for Turnstile even though DNS is elsewhere.

## Pros and Cons of Options

### Vercel + Turnstile (chosen)

* Good, because free, server-enforced protection, owner-safe, custom domain.
* Bad, because redeploy-on-env-change and a second vendor (Cloudflare) for the widget.

### Netlify / self-host · hCaptcha / reCAPTCHA

* Good, because viable alternatives.
* Bad, because no advantage over Vercel here; reCAPTCHA/hCaptcha are more intrusive and reCAPTCHA has stricter free limits.

## Related ADRs

* Extends [ADR-0003](0003-use-react-vite-typescript-tailwind-spa.md)
* Builds on [ADR-0002](0002-use-a-dedicated-supabase-account-with-backend-enforced-access.md) (Supabase Auth enforces the token)

## References

* `vercel.json` · `src/components/Turnstile.tsx` · `src/lib/AuthContext.tsx`
* `docs/obsidian-vault/05-Concepts/CAPTCHA Bot Protection.md`
