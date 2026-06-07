---
title: Release Gate
tags: [system, release, gate, pointer]
type: system
---

# 🚦 Release Gate

Every plan, implementation, review, and merge must pass all six checks. **The authoritative gate lives in `docs/agent/release-gate.md`** — this note is a pointer, not a copy.

The six checks, by number:

1. Security and authority enforcement (backend-enforced; owner failsafe + invite-only staff + server-side CAPTCHA intact).
2. Data and schema integrity (forward-only migrations; aligned contracts; atomic privileged ops).
3. Contract and terminology consistency (canonical role model + enums from `src/lib/types.ts`).
4. Code quality and change hygiene (`npm run lint` clean; docs updated with code).
5. End-to-end workflow cohesion (register → approve → accredit → submit, no gate-bypassing routes).
6. Release readiness and rollback discipline (`lint` + `build` + targeted smoke; rollback noted).

Cite the gate by number in plans and reviews.

## Related
- [[Operational Invariants]]
- [[Runtime Target]]
