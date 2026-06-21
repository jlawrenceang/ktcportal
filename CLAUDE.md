# CLAUDE.md

Top-level constitution for Claude Code.

## Mission

Maintain software for **KTC Container Terminal Corp.** — a container-terminal, port-services, and container-depot operator. Current scope: the **KTC Online Portal**, where accredited customers (customs brokers) file Job Orders against consignees and KTC staff run a separate admin portal. North star: grow it modularly toward a Navis-style terminal + depot operating system (`docs/obsidian-vault/09-Future/`). Protect access controls before UI polish.

## Pillars & roadmap

Two pillars on **one Supabase database**:

- **Pillar 1 — the KTC Online Portal (this repo, live).** Accredited customers file **Job Orders** for special/ancillary services (X-ray, DEA, OOG) and KTC staff process them. Plus the **release / pull-out** flow (ADR-0024): customers file online — pick consignee + BL no. + upload **DO/BL** → **CSR** documents-desk verifies → staff enter charges → online pay (QRPH) → cashier confirms → **OR claimed at office** for pull-out. Customer-facing queue terms are **batch (filing day) + working-hours aging**, not a serving/priority number; the X-ray queue is an **operations** view (gate `view_xray_queue`), the checker is the spotter who confirms.
- **Pillar 2 — Yard Operations (planned, not built).** An offline-first PWA **move logger** + a `moves` **event-log** spine from which inventory, container aging, bay occupancy, and per-equipment (billing) move counts are all **derived** (Postgres views), never hand-stored. This is the start of the container/EIR data spine (ADR-0015/0022). Full plan: `docs/obsidian-vault/09-Future/Yard Operations — Pillar 2 (Move Logger + Yard).md`. Phases: 0 schema+views → 1 logger → 2 inventory+aging → 3 yard map → 4 billing tie-in (`job_order_id` on billable moves) → 5 planning sim → 6 vessel-schedule optimization. Principle: **derived over hand-maintained; planned vs actual strictly separate; ship each phase before the next.**

## Non-negotiables

- **Backend-enforced access.** Auth, approvals, roles live in RLS + SECURITY DEFINER RPCs, not frontend-only. CAPTCHA is server-enforced in Supabase.
- **Runtime authority is `src/lib/supabase.ts`** (production `mdlnfhyylvapzdubhyic`). The connected `mcp__supabase__*` tools point at **jta-sys** — never use them here. See `docs/agent/runtime-data-safety.md`.
- **Owner failsafe.** `jlawrenceang@gmail.com` is the server-only owner — overrides everything, cannot be locked out. Staff invite-only; no admin self-signup.
- **Migrations are forward-only.** `git push` deploys the frontend to Vercel, NOT DB changes.
- **Responsive web only.** No native mobile without an explicit ask.

## Release gate

Every plan, change, review, and merge must pass all six checks in `docs/agent/release-gate.md`; any failure blocks release.

## Supporting docs

- `docs/agent/README.md` — modular rules index.
- `docs/obsidian-vault/` — live memory; sync per `docs/agent/obsidian-memory-policy.md`.
- `AGENTS.md` — Codex mirror. `docs/README.md` — docs map.

## Doc precedence

Runtime code > active DB contracts > current-state docs > planning notes > session history. Runtime wins; fix or archive the stale doc same-change.
