---
title: Runtime Target
tags: [system, supabase, runtime, pointer]
type: system
last_updated: 2026-06-25
---

# 🎯 Runtime Target

- **Runtime authority:** `src/lib/supabase.ts` (built from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`).
- **Production project id:** `mdlnfhyylvapzdubhyic` (KTC's own dedicated Supabase account).
- **Hosting:** Vercel project `ktc-joborderform` → `portal.ktcterminal.com`.

**Full runtime-data-safety rules, caveats, and secret handling live in `docs/agent/runtime-data-safety.md`** (repo docs). Read it before any DB, migration, or secret change. Critical: KTC has its OWN Supabase account — the in-session `mcp__supabase__*` tools point at **jta-sys**, not KTC; never use them here (ADR-0002).

## Related
- [[Release Gate]]
- [[Operational Invariants]]
- [[Architecture]]

---

#system #supabase #runtime #pointer
