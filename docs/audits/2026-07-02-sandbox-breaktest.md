# Sandbox break-test — 2026-07-02

**Method:** ultracode multi-agent adversarial break-test (`sandbox-breaktest` workflow) against the isolated, seeded sandbox (`zwvzadkgeyhkhyshkwhc`, schema current through `0239`). 5 attack dimensions (money/billing · auth/RLS · evil-inputs/upload · races/state-machine · lifecycle/config), each finding **adversarially verified refute-first** (opus, high effort). **10 raw → 7 confirmed exploitable.** All probes read-only; prod hard-guarded; sandbox writes were rolled back.

**Verdict:** no theft/critical, but **1 HIGH + 4 MEDIUM + 2 LOW** — a real remediation batch. Consumes via `/remediate`.

> **Resolution (2026-07-02):** all 7 fixed.
> - **BT-01, BT-02, BT-04, BT-06, BT-07** → migration `0240` — applied + verified on **prod + sandbox**, Jarvis-clean (v2.0.17 batch).
> - **BT-03** (consignee PII scrape) → migration `0241`: a code/name-only `consignees_public` definer view for the 4 broker display embeds + the broker branch of the consignees read policy narrowed to `requested_by = me` (JO/release relationship branches dropped). Sandbox-verified — scrape closed (broker reads 0 arbitrary consignees), broker display renders via the view, staff reads (admin + checker) unaffected.
> - **BT-05** (frontend-only consent gate) → migration `0242`: `has_recorded_consent()` now compares `terms_version` to a single-source `app_config('agreement_version')` (fail-open if the row is missing — never a lockout). Sandbox-verified — 0 current customers would be forced to re-consent.
> - BT-03/BT-05 status: built, Jarvis-reviewed, sandbox-applied + verified. **Prod apply (0241/0242) + frontend ship (v2.0.18) + break-test re-run pending** — see the session wrap for the exact deploy order (view lands before the RLS narrow to avoid a broker-display gap).

## Findings (ranked)

### BT-01 · HIGH · `release-docs` storage bucket has NO server-side size/MIME limit
The `release-docs` bucket (`0124:62`) was created bare — `file_size_limit=null`, `allowed_mime_types=null` — while every peer bucket (`valid-ids`, `payment-slips`, `consignee-docs`, `jo-documents`) enforces 5 MB + an image/PDF allowlist server-side. The only insert enforcement is an RLS policy checking `foldername[1]=current_uid_alive()` (own folder) — no size, no MIME. The 4 MB cap + allowlist live **only in the browser** (`validation.ts:64-82`). Any live authenticated customer can script `supabase.storage.from('release-docs').upload(...)` with their own JWT to store **oversized files (storage DoS)** and **arbitrary content types** (text/html, svg) that peer buckets block — which staff later fetch in `FileViewerModal`. **Fix:** one-line migration — set `file_size_limit` + `allowed_mime_types` on `release-docs` to match peers.

### BT-02 · MEDIUM · `create_payment_order` TOCTOU → "collected" PO covering zero charges + a BIR OR
The eligibility check is a non-locking `exists` read; the final `update charges set payment_order_id = v_po where id = any(p_charge_ids)` (latest `0229:53`) has **no `payment_order_id is null` predicate**. Under READ COMMITTED, two cashiers bundling an overlapping charge → a lost update: the charge migrates to PO2, and PO1 becomes collectible with an **empty charge set** — `confirm_payment_order`'s final-invoice guard passes vacuously, flipping PO1 to `collected` and recording a **BIR Official Receipt over nothing**. **Fix:** add `and payment_order_id is null` to the UPDATE + raise if the affected-row count ≠ requested count (idempotent guard). Money/BIR integrity → Jarvis.

### BT-03 · MEDIUM · Consignee PII-scrape defeats the anti-scrape control (`0218`)
`0218` restricts a broker's read of consignee PII (TIN, address, tel, mobile, email, doc paths) to consignees they have a relationship with. But `search_consignees` enumerates `id/code/name` for any consignee, and `file_job_order`'s consignee check is existence-only (no ownership) — so filing a throwaway JO on any target consignee creates the `job_orders` relationship that `0218`'s RLS reads, **granting full-row PII** (then cancel the JO). Targeted, scriptable — one JO per consignee. **Fix (needs a product call):** column-mask the sensitive PII from the broker read (brokers only need code/name/address to file), or restrict which consignee columns a filing relationship unlocks.

### BT-04 · MEDIUM · `request_consignee` / `resubmit_consignee` unbounded + unthrottled → DoS
No max-length cap on any text field and no per-user rate/count cap (unlike `open_ticket`'s `left()` truncation + 5-open cap, and `0238`'s 3/hour email limit). An approved customer loops the RPC with multi-MB strings → unbounded pending-consignee rows + a `notify_staff` bell row per call (title embeds the raw giant name). **Fix:** `left()` caps on the text fields + a per-user pending-request cap (mirror `open_ticket`).

### BT-05 · MEDIUM · Agreement re-consent gate is frontend-only (latent)
`has_recorded_consent()` (`0162`) is `terms_version is not null` — it never compares to the current `AGREEMENT_VERSION` (`legal.ts:7` = `v4`). The version match lives only in `ProtectedRoute` (client). So the moment the agreement is bumped for a material change, a customer on the old version is UI-walled but can call `file_job_order`/`open_ticket` directly and transact under superseded NDA/DPA terms — the backend-enforced-access non-negotiable is violated for consent-version. **Latent** (all current customers are `v4`; activates on the next bump). **Fix:** make `has_recorded_consent()` compare `terms_version` to a server-side current-version source.

### BT-06 · LOW · `add_charge` bills an already-completed JO
`add_charge`'s status guard (`0227:62-64`) rejects only `cancelled`/`rejected` — a `completed` JO passes, so staff can add a `billed`/`unpaid` charge to a released order (the completion gate only runs at the transition, never on later inserts). Not theft (base already paid), but leaves a released order with an open, ungated bill (the seeded `JO-000547` anomaly). **Fix:** reject `completed` in `add_charge` (chargeable additions to a completed order go through the re-X-ray child-JO path).

### BT-07 · LOW · `file_release_order` doesn't validate the consignee id
Unlike `file_job_order`, `file_release_order` inserts `p_consignee` with no null/existence check — a customer can file a release with `consignee_id=NULL`. Data-integrity/defense-in-depth gap. **Fix:** add the same existence check as `file_job_order`.

## Recommended remediation
1. **Fix-now batch (contained, go-live-relevant):** BT-01 (bucket config — trivial), BT-02 (PO race — Jarvis), BT-04 (DoS caps), BT-06 + BT-07 (small guards). One migration + small edits → Jarvis → apply (prod + sandbox) → re-test.
2. **Needs a product/design call:** BT-03 (how much consignee data a broker may see) and BT-05 (server-side current-version source for consent) — spec + owner decision.
