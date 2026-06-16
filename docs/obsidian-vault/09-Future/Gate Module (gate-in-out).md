# Gate Module — gate-in / gate-out (FUTURE)

Status: **future plan** (implement with the TOS as the system matures, owner 2026-06-16). Today we ship only the **verification QR** (`/verify/:id`, migrations 0089/0090) — a read-only "is this slip genuine + paid/completed" check. The gate scan layers on top of that QR later.

## Concept
The security/guard scans the **same QR** as a one-button action (like the Checker's confirm): scan → verify → flip. The verify page becomes the guard's gate screen with a single **Gate In / Gate Out** button.

## Rules (owner spec)
It is a **one-way street per selection, not a toggle** — the JO's trade decides the single allowed action:

| JO trade | The one allowed gate action | After it fires | Blocked (HOLD) when |
|---|---|---|---|
| **Export / Deposit** | **GATE IN** (container deposited into the terminal) | locked — no gate-out, no second gate-in | no cashier clearance, or any pending balance |
| **Import / Withdrawal** | **GATE OUT** (loaded container withdrawn) | locked — no gate-in again (empty return = a separate process) | no cashier clearance, or any pending balance |

- Each container makes **one** authorised crossing per JO. If a guard waves it through without scanning, the system simply has no record — there is no reverse scan to undo it.
- **No double scan / no reverse**: enforced by a `gate_events` log + valid-transition checks.

## Dependencies (build before the gate)
1. **Cashier clearance + a "pending balance" model** — the gate's block condition. Defined by the Cashier station (built first). Clearance ≈ `payment_status='confirmed'` + no outstanding balance (RPS / electrical bond, etc.).
2. **Import/export (trade) on the `job_orders` row** — not captured today (the JO has been X-ray-only). Needed to pick the gate direction.
3. **Guard / security role** + `gate_events` table + the Gate In/Out action on `/verify/:id`.

## Open question for the build
Is a gate scan **per whole JO** (one scan clears all containers) or **per container van** (each truck scans separately)? Multi-van JOs cross on separate trucks → **per-van** is likely right, but the slip QR is per-JO, so either each van gets its own pass or the guard picks the van at scan time.

## North star
This is the seed of the Navis/Octopi-style **gate module** of the terminal operating system (see [[Terminal & Depot Operating System (North Star)]]). The verification QR shipped now is forward-compatible with it.
