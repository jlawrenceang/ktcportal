# /adr — Write an Architecture Decision Record

Write a new Architecture Decision Record (ADR) for the KTC broker portal.

## When to write an ADR

Write an ADR when a decision:
- Affects multiple parts of the system or the overall structure
- Involves a meaningful tradeoff between options
- Future developers need to understand the "why," not just the "what"
- Changes how a core workflow is modeled or enforced (auth, approvals, accreditation, job orders)
- Selects a library, tool, or integration that shapes development patterns
- Establishes a policy (e.g. "all staff are invite-only")

Skip an ADR when a decision is limited in scope, low risk, easily reversible, or already covered by an existing ADR.

## How to write an ADR

1. Read `docs/adr/README.md` to find the next ADR number.
2. Use `docs/adr/template.md` as the base structure.
3. File name: `NNNN-imperative-verb-phrase.md` (present-tense, lowercase, dashes).
4. Fill in all required sections:
   - **Context and Problem Statement** — the "why now" and the question being answered
   - **Decision Drivers** — what forces or requirements shaped the choice
   - **Considered Options** — at minimum 2–3 real alternatives
   - **Decision Outcome** — the chosen option and clear justification
   - **Positive and Negative Consequences** — honest trade-off analysis
   - **Pros and Cons of Options** — structured comparison
5. Set status to `Accepted` if the decision is already in effect, `Proposed` if still under discussion.
6. Add the new ADR to the log table in `docs/adr/README.md`.
7. Add an entry to `CHANGELOG.md` under the current session date.

## ADR quality rules

- **Rationale:** always explain the "why," including pros/cons of alternatives.
- **Specific:** one decision per ADR.
- **Timestamps:** record the date; add new dated amendments rather than editing accepted content.
- **Immutable:** once accepted, don't alter the original — create a new ADR to supersede it.

## Categories

`Architecture | Database | Business Logic | Frontend | Workflow | Security | Integration`

## Status values

`Proposed | Accepted | Deprecated | Superseded by ADR-XXXX | Rejected`

## Arguments accepted

`$ARGUMENTS` — optional description of the decision to document. If provided, use it as the subject. If not provided, ask the user what decision to record.
