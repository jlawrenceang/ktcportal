---
title: Current State
tags: [memory, current]
type: memory
last_updated: 2026-06-07
---

# 📌 Current State (Runtime-Aligned)

> **For sequencing of what's next, read [[Roadmap]].** This page is a runtime snapshot — *what is live today*.

## 2026-06-07 — Live on portal.ktcterminal.com with CAPTCHA + full docs

**Deployed + protected.** The portal is live on Vercel at **`portal.ktcterminal.com`** (custom domain, DNS on Vercel, HTTPS valid, SPA deep-links working). Cloudflare **Turnstile CAPTCHA** is live on login + registration and **enforced server-side** in Supabase Auth (verified: auth API returns `captcha_failed` without a token). Vercel CLI installed + linked. Access is gated behind login — not public yet (prod testing).

**Documentation system shipped.** Mirrored jta-sys's layered docs: `CLAUDE.md` + `AGENTS.md`, `docs/agent/*`, `docs/adr/*` (ADRs 0001–0006), and this Obsidian vault. See [[2026-06-07 Deploy + CAPTCHA + Docs System]].

## What is live

- **Auth** — broker email/password registration with valid-ID upload; staff username login; owner failsafe; invite-only staff creation. CAPTCHA enforced. See [[Authentication]].
- **Brokers** — self-register → `pending` → admin approval → portal access. See [[Brokers]].
- **Consignees** — admin CRUD, search, pagination (2,488 imported), approval, accreditation (address/TIN/2303). See [[Consignees]].
- **Job Orders** — broker submission + history; admin processing maturing. See [[Job Orders]].
- **Administration** — approvals, broker/consignee management, owner-only staff settings. See [[Administration]].

## Backend

- Supabase project `mdlnfhyylvapzdubhyic` (KTC's own account). Migrations `0001_init` … `0010_create_staff`, all applied. RLS enabled; role model via `is_owner`/`is_admin`/`status`.

## In progress / not yet

- Admin dashboard metrics + job-order processing workflow.
- Per-broker accredited-consignee scoping.
- Resend SMTP (email confirmations / password resets).
- Supabase Auth Site URL / Redirect URLs not yet pointed at the custom domain.
- No automated test suite yet (lint + build + manual/`curl` smoke).

## Immediate priorities

**See [[Roadmap]] for authoritative sequencing.** Summary: (1) manual browser UAT on the live domain; (2) set Supabase Auth URLs; (3) admin job-order processing; (4) Resend SMTP for go-live.
