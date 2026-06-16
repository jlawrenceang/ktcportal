# Gate Module — gate-in / gate-out (FUTURE)

Status: **future plan**, deferred past launch (owner, 2026-06-16). For the launch blind walkthrough the product ships **verify-only** — the read-only QR confirmation at `/verify/:id` (migrations 0089/0090, [[Verify-QR Anti-Forgery]]). The gate *action* layer (guard role, gate logging, enforced holds) is built later, with the TOS. The verification QR shipped now is forward-compatible with it. Decision recorded in **ADR-0022**.

## The boundary that defines this module: the gate pass is container/EIR-level, NOT the Job Order
(owner realization, 2026-06-16.)

- A **Job Order exists only for the subset of containers that need a special service** (X-ray / DEA / OOG). **Most containers gating in/out have no JO at all.** So a gate pass **cannot** be derived from the JO — it must be keyed on the **container itself** (its **EIR**, equipment interchange receipt).
- A JO also **spans several container vans**, while a gate crossing is **per van / per truck**. Gate tracking is therefore container-grained (the per-van X-ray model already tracks vans individually — [[Two-Gate Completion]]).
- The **JO is a service overlay**: when a JO exists, the gate module **cross-references** it ("before gate-out, is this container's X-ray JO paid + cleared?"). When no JO exists, the container still gates through the normal flow.
- Practical consequence: the gate pass is **its own module/artifact** — its own paper today, a unified EIR-based digital pass later — separate from the JO *service* slip. "Containers without a JO" are out of scope for the current services portal; they belong to the container/EIR spine of the TOS ([[Terminal & Depot Operating System (North Star)]]).

## What exists today (the read / confirm half)
The slip QR points to the public `/verify/:id` page (anon `verify_job_order`): **PAID / NOT PAID**, status, JO number, consignee, container numbers — read live from the DB so an edited image can't fake it ([[Verify-QR Anti-Forgery]]). This already makes the slip a **verifiable gate pass for the JO'd service subset** — but it is a **read, not an action**: scanning neither logs a crossing nor enforces a hold, and any role (or no login) sees the same screen.

## What the gate module adds (the write / action half)
The security/guard scans the **same QR** as a one-button action (like the Checker's confirm): scan → verify → flip. The verify page becomes the guard's gate screen with a single **Gate In / Gate Out** button.

### One-way per direction (owner spec)
It is a **one-way street per selection, not a toggle** — the container's trade decides the single allowed action:

| Trade | The one allowed gate action | After it fires | Blocked (HOLD) when |
|---|---|---|---|
| **Export / Deposit** | **GATE IN** (container deposited into the terminal) | locked — no gate-out, no second gate-in | no clearance, or any pending balance |
| **Import / Withdrawal** | **GATE OUT** (loaded container withdrawn) | locked — no gate-in again (empty return = a separate process) | no clearance, or any pending balance |

- Each container makes **one** authorised crossing per pass. **No double scan / no reverse** — enforced by a `gate_events` log + valid-transition checks (single-use / anti-passback). If a guard waves a truck through without scanning, the system simply has no record; there is no reverse scan to undo it.

### Dual sign-off = the existing two-gate, made explicit on the pass
A pass is **clear for release only when both clearances hold** — this is already the **[[Two-Gate Completion]]** the system enforces server-side:

- **Clear from operations** = services done — the **Checker's** per-van X-ray e-signature **+ operations'** RPS / other services.
- **Clear from cashier** = **all balances** settled — base **+** RPS **+** every additional-charge supplement ([[Additional-Charge Supplements]]).

Neither is skippable. Today these are captured as *state* (`services_done` + `payment_confirmed`) and the X-ray already carries an immutable e-signature; the gate module would surface them as **explicit, logged e-sign-offs on the pass** — "operations release authorized by ⟨name⟩", "cashier cleared by ⟨name⟩" — mirroring the X-ray e-sig pattern.

## Dependencies (build before the gate)
1. **Container / EIR spine** — the gate pass is keyed on the container, so it needs an EIR/container record that exists independently of any JO. Part of the foundational data spine ([[Terminal & Depot Operating System (North Star)]]).
2. **Cashier clearance + a "pending balance" model** — the gate's block condition (Cashier station built first; clearance ≈ all balances confirmed: base + RPS + supplements + any bond).
3. **Import/export (trade) on the container / JO** — not captured today (the JO has been X-ray-only); needed to pick the gate direction.
4. **Guard / security role** + `gate_events` table + the Gate In/Out action on the gate screen.

## Resolved: per-JO vs per-van
**Per van / per container.** Multi-van JOs cross on separate trucks, and containers without a JO have no JO at all — so the unit is the container/EIR, not the JO. Each van gets its own pass (or, for the JO'd subset, the guard picks the van at scan time off the JO slip).

## QR vs barcode
**QR** (decided earlier) — denser, error-correcting, and the same code already drives the verification page. Single-use / anti-passback comes from the `gate_events` log, not from the symbology.

## North star
This is the seed of the Navis/Octopi-style **gate module** of the terminal operating system ([[Terminal & Depot Operating System (North Star)]]). The verification QR shipped now is forward-compatible with it; the gate module turns the *verifiable pass* into an *enforced, single-use, logged* pass.
