---
title: 2026-06-13 Doc Governance + ST02 Trial Run
tags: [session, docs, governance, smoke-test, tos, vision]
type: session
---

# 2026-06-13 — Doc Governance + ST02 Trial Run

## What was done

- **ST02 preflight finished green:** owner regenerated the test project's API keys (new `sb_publishable_`/`sb_secret_` format) → **P8 Playwright 16/16** vs the localhost test-project build. Preflight now **P1–P8 PASS**; P9 (rates + payment-details entry) + manual Lanes 1–8 in the owner's hands. Verified all 6 pg_cron jobs green and Vault already holds `service_role_key`/`project_url` (ID purge ACTIVE — the ST02 8.4 setup note was stale).
- **Doc governance hardened to jta-sys parity** after a two-agent structural audit of the jta-sys docs system vs ours (verdict: structure sound, content drifted). [[Current State]] now reflects v1.1.0.
  - `docs/agent/doc-governance.md`: freshness directive (no stale docs — fix or archive in the same change; **deletion is OWNER-only**; vault map always current), what-belongs-where, ≤200-word constitution cap, review checklist, deferred-folder registry.
  - `docs/archive/` created — legacy/superseded docs + the original ST02 script moved in, with a manifest README.
  - `docs/agent/tooling-inventory.md`: all 11 scripts documented; **`SUPABASE_ACCESS_TOKEN` is a secret key, not a `sbp_` PAT** — Management-API scripts broken until regenerated.
  - Vault resync: [[System Scale]] (55 migrations, v1.1.0, 6 crons), [[Current State]] (sessions 10a–10s snapshot), [[Pending Items]] (rewritten), [[Home]] (at-a-glance metrics block). `workflow-invariants.md` gained the brokers→customers naming note.

## Charter expanded — TOS north star (Navis research)

- **OWNER clarified the system identity:** KTC is a **container-terminal + port-services + container-depot** operator (three pillars), and the **endgame is to create/upgrade KTC's existing TOS into a Navis-style operating system**. The portal so far only solved the **ancillary-services queuing** problem (one module). `CLAUDE.md` mission broadened accordingly; persistent memory updated; constitution word-cap relaxed to a one-screen guideline (~220) with the reason recorded.
- **ultracode research run** (5 facet researchers → adversarial fact-check of 14 claims; 13 confirmed, 1 refuted — *PowerYard is a third-party e4Score YMS, not Navis*) → `docs/research/navis-tos-landscape-2026-06-13.md`.
- **Parked as a future goal:** [[Terminal & Depot Operating System (North Star)]] (vault `09-Future/`) + **ADR-0015** (Octopi-class modular TOS; **container/EIR data spine first**; lead with Gate/EIR + Depot M&R; explicit do-not-attempt-early list). Linked from [[Home]], the Future index, and the refreshed [[Roadmap]] (NORTH STAR section). ADR log updated (was stale at 0012 → now 0015).

## Decisions

- Adopted the jta-sys freshness directive verbatim as KTC policy (OWNER, 2026-06-13).
- jta-sys folders (`plans/`, `audits/`, `operator-guide/`, `flows/`) stay deferred — created on first need, exact names pinned in `doc-governance.md`.
- **TOS direction = Octopi-class, modular, container/EIR spine first** (ADR-0015). Explicitly NOT an N4-scale rollout.

## Open question carried forward

- **What is KTC's *existing* TOS today** (vendor / in-house / manual)? Decides create-vs-upgrade + the integration/migration path. Lead question in the vision note + ADR-0015.

## Pending

- ST02 manual Lanes 1–8 + P9 + teardown (sequence reset) — see [[Pending Items]].
- Generate a real `sbp_` personal access token for the Management-API scripts.
- OWNER review of `docs/archive/` (incl. legacy `scripts/apply-theme.sh` deletion call).

Links: [[Job Orders]] · [[Administration]] · [[2026-06-11 App Review + visionOS Theme]]
