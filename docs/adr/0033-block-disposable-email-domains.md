# ADR-0033: Block disposable / temporary email domains at signup (server-side)

* Status: Accepted
* Deciders: owner
* Date: 2026-06-26
* Category: Security

## Context and Problem Statement

With open self-signup (including "Continue with Google"), throwaway/temporary email domains enable cheap fake-account abuse — the owner had previously seen ~130 fake accounts drain free credits on another product. How do we block disposable emails without an external API call on every signup?

## Decision Drivers

* Server-enforced — a frontend check is bypassable.
* No per-signup external dependency (latency / cost / outage surface).
* Must not block real providers (gmail, outlook, icloud, …) or the existing customers.
* Pairs with the other anti-abuse layers (Turnstile, the pending lockdown, the approval gate).

## Considered Options

* **A** — a frontend-only domain check.
* **B** — a third-party email-validation API called per signup.
* **C** — a seeded blocklist table checked inside `handle_new_user`.

## Decision Outcome

Chosen option: **C** (migration `0164`). A `disposable_email_domains` table is seeded with the full maintained **7,578-domain** blocklist (`github.com/disposable-email-domains`). `handle_new_user` extracts `lower(split_part(new.email,'@','2'))` and `raise`s if it's in the table — which rolls back the `auth.users` insert, so the signup fails cleanly and server-side. An optional inline form hint flags obvious throwaways as the user types (advisory only; the DB trigger is the wall). Google OAuth emails (gmail etc.) are real and pass; real providers were verified absent from the seed; the two existing customers (real gmail) are unaffected (the gate is new-signups-only).

### Positive Consequences

* Server-enforced, no external dependency or latency, with broad coverage of lazy abuse.
* Real providers verified absent from the seed → no false rejections of legitimate customers.

### Negative Consequences / Trade-offs

* The blocklist **goes stale** over time — refreshing it from the upstream source is a standing maintenance obligation (record it where the next maintainer will see it).
* A determined abuser can register a non-listed domain — this raises the bar, it is not absolute (the approval gate remains the real filter).

## Pros and Cons of Options

### A — frontend-only
* Good, because instant feedback.
* Bad, because trivially bypassed (it's just a client check) → not real enforcement.

### B — per-signup validation API
* Good, because always current.
* Bad, because it adds an external dependency, latency, and cost to every signup, and a new outage surface.

### C — seeded blocklist in the trigger
* Good, because server-enforced, dependency-free, comprehensive.
* Bad, because the list must be periodically refreshed.

## Related ADRs

* Complements [ADR-0006](0006-host-on-vercel-with-turnstile-captcha.md) (Turnstile) and [ADR-0032](0032-pending-accounts-verify-only-lockdown.md) (pending lockdown) as the layered anti-abuse posture for open signup.

## References

* Migration `0164`; upstream list `github.com/disposable-email-domains/disposable-email-domains`.
