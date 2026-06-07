---
title: 2026-06-07 Deploy + CAPTCHA + Docs System
tags: [session]
type: session
date: 2026-06-07
---

# 2026-06-07 — Deploy + CAPTCHA + Docs System

## What was done

- **Deployed to Vercel.** Project `ktc-joborderform`, custom domain **`portal.ktcterminal.com`** (apex `ktcterminal.com` aliased). DNS managed by Vercel; the Cloudflare nameserver migration was deliberately **not** completed (Cloudflare used only for Turnstile). Smoke-tested: SPA shell, logo, SPA deep-links (`vercel.json` rewrite), and that the bundle points at the KTC Supabase project.
- **Added CAPTCHA.** Cloudflare Turnstile on login + registration (`src/components/Turnstile.tsx`), token threaded through `signIn`/`signUp`, **server-verified by Supabase Auth** (Attack Protection). Verified enforcement via `curl` (auth API returns `captcha_failed` without a token). Site key in `VITE_TURNSTILE_SITE_KEY`; secret rotated and stored only in Supabase. See [[CAPTCHA Bot Protection]].
- **Installed + linked the Vercel CLI** (authed as `jlawrenceang`) — confirmed env vars, domains, and the latest production deployment from the CLI.
- **Built the layered documentation system** mirroring jta-sys: `CLAUDE.md` constitution, `AGENTS.md` Codex mirror, `CHANGELOG.md`, `docs/agent/*` (9 files), `docs/adr/*` (template + index + ADRs 0001–0006), the `/adr` command, and this Obsidian vault (01-System, 02-Cores, 04-Workflows, 05-Concepts, 06-Sessions, 07-Memory, 09-Future).

## Decisions

- Hosting + CAPTCHA captured in [[Job Orders|ADR-0006]] (Vercel + Turnstile).
- Documentation structure adopted from jta-sys, reframed for port/terminal operations.

## Pending

- Manual browser pass on `portal.ktcterminal.com` (widget renders, owner → Admin Portal).
- Resend SMTP for broker email confirmations / password resets (go-live).
- Update Supabase Auth Site URL + Redirect URLs to the custom domain.

## Related

- [[Current State]] · [[Completed Milestones]] · [[Administration]] · [[Authentication]]
