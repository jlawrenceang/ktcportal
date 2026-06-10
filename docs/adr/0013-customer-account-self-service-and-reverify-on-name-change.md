# ADR-0013: Customer account self-service; re-verify on legal-name change

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-10
* Category: Workflow | Security

## Context and Problem Statement

Customers had no way to manage their own account after registering — no profile page to fix a typo'd name, update a contact number, change email, or reset a password from inside the portal. We added a **My Account** page (`/account`). The hard question was **what each field change requires**, because the fields differ in risk:

* **Contact number** — low risk, not an identity field.
* **Email** — the auth identity (Supabase login).
* **Password** — account access.
* **Full name** — the **legal name an admin verified against the customer's valid ID**. Per the Customer Agreement's DPA clause, that **ID is deleted on approval** (ADR data-minimisation, migration `0027`). So after approval there is no ID on file to re-check a renamed customer against.

## Decision Drivers

* Let customers self-serve the common, low-risk edits without admin involvement.
* Keep identity integrity: a verified name must stay matched to the ID that was checked.
* Keep access control backend-enforced — no self-promotion via the profile form.
* Reuse the existing, working email/password infrastructure (Supabase Auth, the `/forgot-password` → `/reset-password` flow, branded Resend templates).

## Considered Options (full name)

* **A — Require re-verification (chosen):** an approved customer changing their legal name is sent back to `status='pending'` to re-upload an ID for an admin to re-verify. Most secure; preserves name↔ID integrity.
* **B — Lock after approval:** name becomes read-only; "contact customer service to change." Safe but needs a manual admin edit for every change.
* **C — Allow free edit:** simplest UX, but breaks the name↔(deleted)ID match. Rejected.

## Decision Outcome

**My Account (`/account`)** lets a customer:

* **Full name / contact number** — edit inline. For a **pending** customer, free edit. For an **approved** customer, changing the name opens a confirm modal and then sets `status='pending'` (clearing `decided_at` / `decision_reason`) so the portal prompts them to re-upload a valid ID — **Option A, re-verification**.
* **Email** — `supabase.auth.updateUser({ email })` with `emailRedirectTo=/confirmed`. Supabase emails a confirmation link to the **new** address; the change only takes effect once clicked (current email stays active until then). The page also syncs `customers.email` to the confirmed auth email on load. **No admin approval** — email re-confirmation is the security boundary.
* **Password** — in-page `updateUser({ password })` (session-authenticated), **plus** a "reset by email" link reusing `/forgot-password`. (In-page does not re-check the current password because the project enforces CAPTCHA on `signInWithPassword`, making a silent re-auth awkward; the 10-min idle logout limits the open-session risk, and the email-reset path is available as the strong route.)

The security boundary for the name change is in the DB: the `guard_broker_protected_fields` BEFORE UPDATE trigger now permits **two** self-initiated status transitions — `rejected → pending` (resubmit, ADR-0012/migration `0026`) **and** `approved → pending` (re-verify, migration `0028`). Every other self-status-change stays blocked (no self-approve, no un-suspend). This is a **self-demotion** only — it reduces the customer's own privileges — so it carries no escalation risk.

### Positive Consequences

* Customers handle routine edits themselves; admins aren't a bottleneck for typos/number changes.
* Name↔ID integrity is preserved — a rename can't silently desync from the verified ID.
* Email/password reuse the already-hardened flows; nothing new to secure server-side.

### Negative Consequences / Trade-offs

* A genuine legal-name change costs the customer a full re-verification cycle (re-upload ID, await admin). Acceptable for a rare, high-integrity action.
* In-page password change trusts the active session rather than re-checking the current password (mitigated by idle logout + the email-reset alternative).
* `customers.email` lags the auth email until the customer next loads `/account` after confirming (no auth→table sync trigger).

## Related ADRs

* Extends the protected-fields self-transition rule from [ADR-0012](0012-pending-brokers-enter-portal-submit-gated.md) (and migration `0026`).
* Complements the valid-ID-deleted-on-decision data-minimisation behaviour (migration `0027`).

## References

* `src/pages/Account.tsx` · `src/components/Shell.tsx` (header link + breadcrumb) · `src/pages/Home.tsx` (card)
* `supabase/migrations/0028_reverify_on_name_change.sql` (guard permits `approved → pending`)
* `src/pages/ForgotPassword.tsx` · `src/pages/ResetPassword.tsx` · `src/pages/Confirmed.tsx`
