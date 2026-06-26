# ADR-0030: Build Lara as a deterministic (non-LLM) customer assistant

* Status: Accepted
* Deciders: owner
* Date: 2026-06-26
* Category: Frontend | Architecture

## Context and Problem Statement

Customers (customs brokers) need quick in-portal help — how to file, how to track an order, what the charges mean. Should the assistant be an LLM (open-ended Q&A) or a deterministic rule-based bot? An LLM bills per message, can be deliberately drained or abused, and can hallucinate a wrong answer about an order's *real* status.

## Decision Drivers

* No per-message cost and nothing a malicious user can "drain."
* No wrong answers on factual queries (an order's status, how to pay).
* Instant and always available — no external API to be slow or down.
* The long tail still reaches a human, not a confident guess.

## Considered Options

* **A** — an LLM chatbot (Claude/GPT API) for open-ended Q&A.
* **B** — a deterministic decision tree + keyword matcher, zero LLM.
* **C** — a hybrid: rules now, a gated LLM fallback later.

## Decision Outcome

Chosen option: **B**, with **C designed-for but not built**. Lara is a hand-written 93-node decision tree + keyword matcher (`src/components/chat/**`), six topic tiles plus a standing "Talk to a person" and an always-on text box. **Tool-based truth:** the "track my order" lookup is a real, RLS-scoped DB read that reports the *actual* status + payment pill — never a guess. **Tiered fallback:** a two-strike miss opens a support ticket through the existing `open_ticket` RPC (tagged by where the conversation dead-ended) so the long tail reaches a person. An LLM fallback is designed-for (gated / rate-limited / hard-capped) and added only if ticket data shows recurring open-ended misses.

### Positive Consequences

* Free to run; nothing to abuse; deterministic and correct on the known questions.
* No external API dependency (no latency/outage surface); no new route, table, or migration.

### Negative Consequences / Trade-offs

* Cannot answer truly novel open-ended questions — those become a ticket (by design).
* The tree is hand-maintained: new features need new nodes, or Lara silently won't cover them.

## Pros and Cons of Options

### A — LLM chatbot
* Good, because it answers anything phrased any way.
* Bad, because per-message cost, drain/abuse surface, and hallucinated answers on factual queries (an order's real status) are unacceptable for a billing-adjacent portal.

### B — deterministic tree
* Good, because zero cost, zero abuse surface, correct-by-construction on the known questions, and a human handles the rest.
* Bad, because it's bounded to what's modeled and must be maintained by hand.

## Related ADRs

* Extends the support-ticket flow; the fallback reuses `open_ticket`. Mounted customer-side (`Shell.tsx`), hidden for pending/locked accounts (see [ADR-0032](0032-pending-accounts-verify-only-lockdown.md)).

## References

* `docs/lara-chatbot-design.md` (+ `-spec.md`); `src/components/chat/{types,nodes,match,actions,useChat,ChatWidget}`; [[Lara (Customer Assistant)]].
