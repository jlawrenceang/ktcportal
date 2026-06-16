# ADR-0019: Make the printed slip self-verifying via a watermark + QR to a public verification page

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-16
* Category: Security | Workflow

## Context and Problem Statement

The printable A6 job-order slip (ADR-0014) is a paper document that circulates outside the portal — a terminal guard, BOC, or anyone holding it might rely on its "paid / completed" text. But printed text is trivially editable: someone could doctor an unpaid or in-process slip to read "PAID / COMPLETED." The slip needed to become **self-verifying** — its real status confirmable live from the database by anyone holding the paper, without a portal login.

## Decision Drivers

* Anti-forgery — the authoritative status must come from the DB at scan time, not from ink on the page.
* No login required — a guard or BOC officer scanning a slip shouldn't need a portal account.
* Minimal disclosure — the public endpoint must reveal only what's needed to confirm authenticity, nothing sensitive.
* Defeat QR-copy attacks — copying a genuine paid order's QR onto a fake slip must be catchable.
* Trust the two-gate guarantee — "PAID/COMPLETED" is only meaningful because completion is backend-enforced (ADR-0016).
* Foundation for a future gate module — the same scan should later support guard gate-in/gate-out logging.

## Considered Options

* **A — Keep the slip as static printed text.** No verification.
* **B — Signed/encoded payload in the QR.** Self-contained but reveals data and can't reflect *live* status changes after printing.
* **C — QR carries only the order's UUID → a public SECURITY DEFINER verify RPC → a `/verify/:id` page showing live status + a physical cross-check (chosen).**

## Decision Outcome

Chosen option: **C** (migrations `0089`, `0090`, `0097`).

**Watermark + QR on the slip (`0089`).** The slip carries a **PENDING / COMPLETED** watermark and a QR pointing at `/verify/<id>`. The QR encodes only the order's **UUID** — unguessable, and printed only on the slip itself.

**Public verify RPC (`0089` → `0090` → `0097`).** `verify_job_order(p_id uuid)` is a SECURITY DEFINER function granted to **anon** (works without login). It returns only the minimal, non-sensitive facts: `jo_number`, `status`, `payment_status`, `rps_status`, `rps_payment_status`, `completed_at`, `consignee`, and the **container numbers**. The status is read live, so a doctored image can't fake a paid/completed order.

**QR-copy defence (`0090`).** The one real attack is copying a genuine paid order's QR onto a forged slip. To defeat it, the verify page shows the resolved order's **consignee + container numbers**, which the verifier matches against the physical slip and the containers in hand — a copied QR resolves to *someone else's* details and is caught.

**Reflects the full gate (`0097`).** The verify RPC returns RPS state too, so the slip's "PAID" badge reflects the *complete* picture (base + RPS), consistent with the two-gate completion rule. Because completion is backend-enforced on every path (ADR-0016), a slip can read "COMPLETED" only if it genuinely is.

**Future gate hook.** The same QR/verify screen is the foundation for a future guard gate module — a guard scanning the QR could log gate-in/gate-out events from the verify screen. (The guard/gate-in-out module itself is intentionally deferred; see `docs/obsidian-vault/09-Future/`. No guard role exists yet.)

### Positive Consequences

* The slip is self-verifying: authenticity and paid/completed status come from the DB at scan time, not from the printed text.
* Anyone holding the paper can verify with no account; disclosure is limited to non-sensitive identity + cross-check fields.
* The consignee + container cross-check defeats the QR-copy attack — the realistic forgery path.
* A clean foundation for the deferred gate-scan module without re-issuing slips.

### Negative Consequences / Trade-offs

* Security rests on the UUID being unguessable and printed only on the slip — anyone who *has* the slip can verify it (acceptable; that's the point, and the data returned is non-sensitive).
* The verify RPC is anon-callable; its return shape is a deliberately minimal contract and must stay minimal as columns are added.
* Container numbers are exposed on the public page (mitigated: needed for the cross-check; they aren't secret to whoever holds the physical slip/containers).

## Pros and Cons of Options

### A: Static printed text
* Good, because nothing to build.
* Bad, because trivially forgeable.

### B: Signed payload in the QR
* Good, because self-contained, no network call.
* Bad, because it bakes data into the paper and can't reflect status changes made after printing.

### C: UUID → public verify RPC → live page (chosen)
* Good, because always-live status, minimal disclosure, copy-attack catchable, login-free, future-gate-ready.
* Bad, because verification requires a network call and exposes a small anon endpoint.

## Related ADRs

* Builds on [ADR-0014](0014-admin-job-order-processing-and-printable-slip.md) (the printable A6 slip the QR/watermark are added to).
* Relies on [ADR-0016](0016-staff-roles-split-gates-two-gate-completion.md) — the PAID/COMPLETED claim is only trustworthy because completion is backend-enforced.

## References

* `supabase/migrations/0089_verify_job_order.sql` (anon `verify_job_order` RPC, QR target)
* `supabase/migrations/0090_verify_payment_and_containers.sql` (payment status + container cross-check)
* `supabase/migrations/0097_rps_in_completion_gate.sql` (verify RPC returns RPS state)
* `src/pages/JobOrderPrint.tsx` (watermark + QR), `src/pages/VerifyJobOrder.tsx` (public `/verify/:id` page)
* `docs/obsidian-vault/09-Future/` (deferred guard / gate module)
