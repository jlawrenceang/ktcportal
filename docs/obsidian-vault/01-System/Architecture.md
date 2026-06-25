---
title: Architecture
tags: [system, architecture]
type: system
last_updated: 2026-06-25
---

# 🏗️ Architecture

> **Terminology:** code/DB say `broker`, but the entity was renamed **`customers`** (migration 0021) and the model is now a single customer pool — read **broker = customer** throughout. This page also predates the **staff mobile shell** (`/app`, `/app/checker|cashier|csr|operations`) and the **release/pull-out + QRPH** surfaces — see [[Business Context]] for the current model and [[System Scale]] for the full live route map. For a current **one-screen system map** (topology, backend-enforced access model, the two operational spines, full route map) see `docs/architecture-overview.md` — this vault page is the **domain/core map**; the overview is the **structural map**.

## Overview

KTC is a web portal with a React + TypeScript SPA frontend and a Supabase backend. Critical access control (auth, approvals, staff creation) runs through RLS + SECURITY DEFINER RPCs. One codebase serves two role-gated portals (ADR-0001).

## Current layers

- **Frontend app:** route tree in `src/App.tsx`; broker pages in `src/pages/*` (under `Shell.tsx`); admin pages in `src/admin/*` (under `AdminShell.tsx`); shared `src/lib/*` (supabase client, AuthContext, useBroker, types) and `src/components/*`.
- **Backend contract:** Postgres tables + RLS policies + RPCs in `supabase/migrations/*`; Storage buckets (`valid-ids`, consignee 2303 docs).
- **Auth:** Supabase Auth (email/password for customers; synthetic `@ktc-staff.local` usernames for staff). Cloudflare Turnstile CAPTCHA enforced server-side.

## Domain map (cores)

- [[Authentication]] — login, owner failsafe, invite-only staff, roles, RLS
- [[Brokers]] — registration, valid-ID upload, approval, broker home
- [[Consignees]] — CRUD, search, pagination, approval, accreditation (TIN, 2303)
- [[Job Orders]] — submission, lines, service requests
- [[Administration]] — admin portal (dashboard, approvals, settings), deployment/ops

## Reality check rule

A page file existing under `src/pages` or `src/admin` does not imply it is wired. Route activation in `src/App.tsx` defines actual availability.

## Related

- [[Runtime Target]]
- [[Tech Stack]]
- [[Operational Invariants]]
