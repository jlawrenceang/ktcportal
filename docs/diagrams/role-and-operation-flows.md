---
title: Role & Operation Flows
tags: [diagrams, roles, workflow, reference]
type: reference
---

# KTC Online Portal — Role & Operation Flows

Detailed flowcharts of **every path each role can take**, the two operational spines
(Job Order + Release / Pull-out), and where the roles plug in. Diagrams are **Mermaid**
(render in GitHub, Obsidian, and most Markdown viewers).

**Source of truth:** synthesized from the live code + the **live `role_permissions`
table** (queried 2026-06-25) and the SECURITY DEFINER RPC guards. Migrations through **0158**.

## How to read these

- **Rounded box** = screen/state. **Diamond** = decision/gate. **`[*]`** = start/terminal.
- Edge labels name the **action** and, in `[brackets]`, the **role/permission** that may take it.
- "Customer" = the accredited customs broker (non-staff). Staff roles: **owner, admin,
  operations, cashier, checker, csr**. **Owner bypasses every gate** (failsafe) and so is
  omitted from most edge labels — assume owner can do anything a gate allows.
- All writes go through **SECURITY DEFINER RPCs** gated by `has_permission()` (staff) or the
  `broker_*` helpers (customer); the UI only mirrors these — the server is the real gate.

---

## Roles, landings & permission matrix (verified against the live DB)

| Role | Lands on | Essence |
|---|---|---|
| **owner** | `/admin` | Failsafe — bypasses all gates; can edit the matrix itself |
| **admin** | `/admin` | Full back office; everything **except `confirm_xray`** |
| **operations** | `/admin/job-orders` | Intake/accept + RPS + service completion + vessels; **monitors** X-ray (no confirm); no money |
| **cashier** | `/admin/cashier` | Payments + ERP invoice/OR; can complete/hold-reject; **cannot** see the X-ray queue |
| **checker** | `/admin/checker` | **Only** confirms each van's X-ray entry (the spotter) |
| **csr** | `/admin/support` | Support inbox + file-on-behalf + **release document verification** + **consignee request review** |
| **purchaser** | (appmap pending) | Fuel module: procurement + monitoring; **scoped, non-admin** |
| **customer** | `/` | Files/pays own Job Orders & Releases; sees only own data |

Permission matrix (`✓` allowed · blank = denied · owner = `✓` on all):

| Permission | admin | operations | cashier | checker | csr | purchaser |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| view_job_orders | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| view_xray_queue | ✓ | ✓ |  | ✓ | ✓ |  |
| view_fuel_reports | ✓ |  |  |  |  | ✓ |
| file_job_orders | ✓ |  |  |  | ✓ |  |
| accept_orders | ✓ | ✓ |  |  |  |  |
| process_job_orders | ✓ | ✓ |  |  |  |  |
| complete_orders | ✓ | ✓ | ✓ |  |  |  |
| hold_reject_orders | ✓ | ✓ | ✓ |  |  |  |
| confirm_xray |  |  |  | ✓ |  |  |
| assess_rps | ✓ | ✓ |  |  |  |  |
| review_payments | ✓ |  | ✓ |  |  |  |
| record_invoice | ✓ |  | ✓ |  |  |  |
| log_fuel | ✓ |  |  |  |  | ✓ |
| manage_fuel | ✓ |  |  |  |  | ✓ |
| verify_release_docs | ✓ |  |  |  | ✓ |  |
| review_consignee_requests | ✓ |  |  |  | ✓ |  |
| manage_vessel_schedule | ✓ | ✓ |  |  |  |  |
| manage_support | ✓ |  |  |  | ✓ |  |
| manage_approvals | ✓ |  |  |  |  |  |
| manage_customers | ✓ |  |  |  |  |  |
| manage_consignees | ✓ |  |  |  |  |  |
| manage_pricing | ✓ |  |  |  |  |  |

---

## 1. Whole-operation overview

How a shipment moves through the portal, and which role drives each leg. Two independent
spines share one customer account and one back office.

```mermaid
flowchart TD
    REG["Customer registers → confirms email → uploads valid ID"]
    APPROVE{"Account approved?<br/>(admin · manage_approvals)"}
    REG --> APPROVE
    APPROVE -->|"no — pending/rejected/suspended"| GATEC["Limited: JO saved as HELD;<br/>Release filing BLOCKED"]
    APPROVE -->|"yes"| HUB["Approved customer"]

    HUB --> JO0["File Job Order<br/>(special services: X-ray/DEA/OOG)"]
    HUB --> RL0["File Release / Pull-out<br/>(every container)"]

    subgraph JOSPINE["JOB ORDER spine — special services"]
      JO1["submitted"] -->|"accept [operations/admin]"| JO2["processing"]
      JO2 --> JOX["X-ray per van CONFIRMED<br/>[checker · confirm_xray]"]
      JO2 --> JODEA["DEA/OOG service done<br/>[operations · process_job_orders]"]
      JO2 --> JORPS["RPS assessed (none/needed)<br/>[operations/admin · assess_rps]"]
      JO2 --> JOPAY["base + RPS + supplement payments<br/>[cashier · review_payments]"]
      JOX --> JOGATE{{"Two-gate met?<br/>all services + all payments"}}
      JODEA --> JOGATE
      JORPS --> JOPAY
      JOPAY --> JOGATE
      JOGATE -->|"yes (auto)"| JODONE["completed"]
      JODONE -->|"cashier records ERP invoice no.<br/>[record_invoice]"| JOINV["completed + invoiced"]
    end
    JO0 --> JO1

    subgraph RLSPINE["RELEASE / PULL-OUT spine — billing"]
      RL1["submitted"] -->|"verify docs [csr/admin · verify_release_docs]"| RL2["docs_verified"]
      RL1 -->|"hold (needs correction)"| RLH["on_hold"]
      RLH -->|"customer re-uploads"| RL1
      RL2 -->|"set charges, once [verify_release_docs]"| RL3["payable"]
      RL3 -->|"customer pays → confirm [cashier · review_payments]"| RL4["paid"]
      RL4 -->|"record OR + ERP no. [cashier · review_payments/record_invoice]"| RL5["released — pull-out"]
    end
    RL0 --> RL1

    OWN["owner / admin — oversight:<br/>approvals · customers · consignees · pricing · vessels · roles & gates · logs"]
    OWN -.governs.-> JOSPINE
    OWN -.governs.-> RLSPINE
```

---

## 2. Job Order spine — state machine

States: `held · submitted · processing · on_hold · completed · rejected · cancelled`.

```mermaid
stateDiagram-v2
    [*] --> held: pending customer files
    [*] --> submitted: approved customer files (jo_number assigned)
    held --> submitted: broker approved (release_held_job_orders trigger)
    held --> cancelled: cancel_job_order [customer]
    submitted --> processing: accept_orders [operations/admin]
    submitted --> on_hold: hold_reject_orders [ops/cashier/admin]
    submitted --> rejected: hold_reject_orders [ops/cashier/admin]
    submitted --> cancelled: cancel_job_order [customer]
    processing --> on_hold: hold_reject_orders
    processing --> rejected: hold_reject_orders
    on_hold --> submitted: respond_to_hold [customer]
    on_hold --> cancelled: cancel_job_order [customer]
    rejected --> submitted: resubmit_rejected [customer, if recoverable]
    processing --> completed: TWO-GATE met (auto on last gate, or complete_orders)
    completed --> processing: add_supplement reverts [ops/admin]
    rejected --> [*]: terminal if not recoverable
    cancelled --> [*]
    completed --> [*]
```

**TWO-GATE completion** (`jo_ready_to_complete` + `complete_on_payment_confirmed` trigger +
`enforce_two_gate_complete` backstop) — `processing → completed` only when **all** hold:

```mermaid
flowchart LR
    G1["All service lines done<br/>X-ray: every van confirmed [checker]<br/>DEA/OOG: [operations]"]
    G2["Base payment confirmed<br/>[cashier · review_payments]"]
    G3["RPS cleared<br/>not needed, OR paid+confirmed"]
    G4["Every supplement confirmed<br/>JO-####-A/B/C…"]
    G1 --> DONE{{"all true?"}}
    G2 --> DONE
    G3 --> DONE
    G4 --> DONE
    DONE -->|"yes"| C["completed + completed_at stamped"]
    DONE -->|"any open"| P["stays processing"]
```

---

## 3. Release / Pull-out spine — state machine

States: `submitted · docs_verified · payable · paid · released · on_hold · cancelled`.
Customer must be **approved** to file (no held/pending path, unlike JOs).

```mermaid
stateDiagram-v2
    [*] --> submitted: file_release_order [approved customer] (RO-###### assigned)
    submitted --> docs_verified: verify ok [csr/admin · verify_release_docs]
    submitted --> on_hold: verify rejects doc [verify_release_docs]
    on_hold --> submitted: resubmit_release_doc [customer]
    docs_verified --> payable: set_release_charges — SET ONCE, non-zero [verify_release_docs]
    payable --> paid: submit_release_payment [customer] then confirm_release_payment [cashier]
    paid --> released: record_release_or [cashier · review_payments/record_invoice]
    submitted --> cancelled: cancel_release_order [customer/staff]
    docs_verified --> cancelled: cancel_release_order [customer/staff]
    payable --> cancelled: cancel_release_order [customer/staff]
    on_hold --> cancelled: cancel_release_order [customer/staff]
    released --> [*]
    cancelled --> [*]
```

**Additional charges & the OR block** — base charge is set **once**; anything missed is a
**supplement** the customer pays separately, and the **OR is blocked until every supplement
is confirmed**:

```mermaid
flowchart LR
    A["add_release_charge<br/>[csr/admin · verify_release_docs]<br/>on payable or paid"] --> S["release_supplements row (unpaid)"]
    S -->|"customer uploads proof"| SUB["submitted"]
    SUB -->|"confirm [cashier · review_payments]"| CONF["confirmed"]
    SUB -->|"reject"| REJ["rejected → customer re-uploads"]
    REJ --> SUB
    CONF --> OR{{"record_release_or:<br/>all supplements confirmed?"}}
    OR -->|"yes + OR no.(≤6) + ERP OR-INV(8), non-zero, cash"| REL["released"]
    OR -->|"any unpaid"| BLOCK["BLOCKED — settle first"]
```

---

## 4. Per-role flows

### 4.1 Customer (customs broker)

```mermaid
flowchart TD
    L["/login — register or sign in"] --> CONF{"email confirmed?"}
    CONF -->|"no"| AWAIT["Awaiting confirmation (resend)"]
    CONF -->|"yes"| VID["/verify-id — upload ID or skip"]
    VID --> ST{"account status"}
    ST -->|"pending"| PEND["Full portal + banner:<br/>JO files as HELD · Release BLOCKED"]
    ST -->|"rejected"| REJ["PendingPanel — fix + resubmit details/ID"]
    ST -->|"suspended"| SUS["PendingPanel — terminal, contact support"]
    ST -->|"approved"| OK["Full access"]

    OK --> FJO["/job-order — file JO → submitted"]
    PEND --> FJOH["/job-order — file JO → held"]
    OK --> FRL["/releases — file Release → submitted"]

    OK --> MJO["/job-orders — manage"]
    MJO --> EDIT["Edit (held/submitted)"]
    MJO --> RESP["Respond to hold → submitted"]
    MJO --> RESUB["Resubmit rejected (if recoverable) → submitted"]
    MJO --> CAN["Cancel (held/submitted/on_hold) → cancelled"]
    MJO --> PAY["Pay base / RPS / supplements (upload proof)"]
    MJO --> PRINT["Print slip (processing/completed)"]

    OK --> MRL["/releases — manage"]
    MRL --> RDOC["Resubmit doc (on_hold) → submitted"]
    MRL --> RPAY["Pay (payable) + each supplement"]
    MRL --> RCAN["Cancel (pre-payment) → cancelled"]
    MRL --> RCLAIM["paid → claim OR at office"]

    OK --> SUP["/support — open/reply tickets, escalate"]
    OK --> ACC["/account — name (→re-verify), email, password"]
    OK --> BROWSE["/vessels · /calculator · /manual (read-only)"]
```

**Customer is blocked from:** editing an order once `processing`; cancelling once
`processing` (JO) or once `paid` (release); adding supplements; confirming any payment;
filing a Release while not `approved`.

### 4.2 Owner

```mermaid
flowchart TD
    O["/admin — Dashboard"] --> ALL["Bypasses EVERY gate (failsafe)"]
    ALL --> A1["Everything admin can do (below)"]
    ALL --> A2["create_staff — invite staff (username+password)"]
    ALL --> A3["Roles & Gates — edit the permission matrix"]
    ALL --> A4["set_owner_access — root-only owner grants"]
    ALL --> A5["confirm_xray fallback (admin cannot)"]
    ALL --> A6["Cannot be revoked / locked out"]
```

### 4.3 Admin

```mermaid
flowchart TD
    AD["/admin — Dashboard"] --> AP["Approvals — approve/reject customers & consignees<br/>[manage_approvals] → unblocks held JOs & release filing"]
    AD --> CU["Customers — suspend/edit [manage_customers]"]
    AD --> CO["Consignees — manage master list [manage_consignees]"]
    AD --> PR["Settings — rates/fees/pricing [manage_pricing]"]
    AD --> VE["Vessel schedule [manage_vessel_schedule]"]
    AD --> JOA["Job Orders — accept/hold/reject/complete [accept/hold_reject/complete_orders]"]
    AD --> RPSa["Assess RPS [assess_rps]"]
    AD --> PAYa["Confirm payments + record ERP invoice/OR [review_payments/record_invoice]"]
    AD --> RELa["Release docs desk: verify + set charges [verify_release_docs]"]
    AD --> SUPa["Support inbox [manage_support]"]
    AD --> LOGS["Logs / audit [manage_approvals]"]
    AD --> NOX["✗ Cannot confirm X-ray (checker-only)"]
```

### 4.4 Operations

```mermaid
flowchart TD
    OP["/admin/job-orders"] --> ACC["Accept submitted → processing [accept_orders]"]
    OP --> HR["Hold / reject [hold_reject_orders]"]
    OP --> SVC["Mark DEA/OOG/other service done [process_job_orders]"]
    OP --> RPS["Assess RPS — none / per-move [assess_rps]"]
    OP --> COMP["Complete (when two-gate met) [complete_orders]"]
    OP --> XV["X-ray Queue — MONITOR only [view_xray_queue]"]
    XV --> NOC["✗ No Confirm button (no confirm_xray)"]
    OP --> VES["Vessel schedule [manage_vessel_schedule]"]
    OP --> NOM["✗ No payments · no release docs · no file-on-behalf"]
```

### 4.5 Cashier

```mermaid
flowchart TD
    CA["/admin/cashier"] --> Q1["Review online payment proofs — confirm/reject [review_payments]"]
    CA --> Q2["Record walk-in / office payment [review_payments]"]
    CA --> Q3["Record ERP Service Invoice no. (JO) [record_invoice]"]
    CA --> Q4["Confirm/reject release payments + supplements [review_payments]"]
    CA --> Q5["Record release OR + ERP control no. → released [review_payments/record_invoice]"]
    CA --> Q6["Complete / hold / reject orders [complete/hold_reject_orders]"]
    CA --> NOQ["✗ Cannot see X-ray queue · ✗ no accept/RPS · ✗ no release-doc verify"]
```

### 4.6 Checker (X-ray spotter)

```mermaid
flowchart TD
    CK["/admin/checker — X-ray Queue"] --> SCAN["Open a JO's container vans (sorted by JO no. / age)"]
    SCAN --> CONF["Confirm X-ray entry per van [confirm_xray] → record_van_xray"]
    CONF --> SIG["Stamps e-signature (name+time) per van"]
    CONF --> LAST{"last van?"}
    LAST -->|"yes"| ROLL["X-ray service rolls up to done → may auto-complete if paid"]
    LAST -->|"no"| SCAN
    CK --> ONLY["✗ No accept/hold/reject/complete · ✗ no edit · ✗ no payments"]
```

### 4.7 CSR (customer service)

```mermaid
flowchart TD
    CS["/admin/support — inbox"] --> TIX["Open/read/reply/close tickets, escalate (call/email/SMS/Viber) [manage_support]"]
    CS --> FILE["File a Job Order on behalf of a customer [file_job_orders]"]
    CS --> RVER["Release documents desk — verify / hold DO/BL [verify_release_docs]"]
    CS --> RCHG["Set release charges (once) + add charge [verify_release_docs]"]
    CS --> XV["View X-ray queue (read) [view_xray_queue]"]
    CS --> NONE["✗ No order status changes (accept/hold/reject/complete) · ✗ no payments · ✗ no confirm X-ray"]
```

---

## Cross-role hand-off summary

| Hand-off | From → To | Gate |
|---|---|---|
| Account approval unblocks filing | admin → customer | `manage_approvals` |
| JO accepted into processing | operations/admin | `accept_orders` |
| X-ray confirmed per van | checker | `confirm_xray` |
| DEA/OOG done · RPS assessed | operations/admin | `process_job_orders` · `assess_rps` |
| Payments confirmed (JO + release) | cashier/admin | `review_payments` |
| ERP invoice / OR recorded | cashier/admin | `record_invoice` / `review_payments` |
| Release documents verified | csr/admin | `verify_release_docs` |
| Release charges set / supplements | csr/admin | `verify_release_docs` |
| Support handled | csr/admin | `manage_support` |

> Verified 2026-06-25 against the live `role_permissions` table + the RPC guards in
> `supabase/migrations/**` through 0158. If a gate is re-toggled in **Settings → Roles & Gates**, this
> matrix and these flows change with it — the server enforces the live matrix, not this doc.
