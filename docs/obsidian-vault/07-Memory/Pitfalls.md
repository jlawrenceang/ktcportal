---
title: Pitfalls
tags: [memory, pitfalls]
type: memory
last_updated: 2026-06-25
---

# ⚠️ Known Pitfalls (ktc-portal)

Repo-specific traps. Framework-level / operating traps live in `~/.claude/PITFALLS.md`. Append whenever something breaks (the `evals` close-the-loop routes here): the trap → the fix.

- **`broker` = `customer`.** Code/DB still say `broker` (`useBroker`, `BrokerStatus`, table history), but migration `0021` renamed the table to `customers` and the model is a single customer pool. Same actor — don't treat them as different (see [ADR-0028](../../adr/0028-rename-brokers-to-customers-single-pool.md)).
- **The connected `mcp__supabase__*` tools point at jta-sys, NOT KTC.** Never run them against this repo — KTC's runtime is `mdlnfhyylvapzdubhyic` via `src/lib/supabase.ts`. (Cross-account hazard.)
- **ADRs are `docs/adr/00NN-*.md`, not vault notes.** Link them with relative markdown (`../../adr/00NN-*.md`), never bare `[[ADR-NNNN]]` (doesn't resolve).
- **Don't hardcode migration/ADR counts in docs.** The `System Scale` ADR row drifted (said 0025, disk had 0027). Keep counts in [[Current State]] and link.
