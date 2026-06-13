# Navis & the Terminal/Depot Operating-System Landscape — Research Brief

**Date:** 2026-06-13
**Provenance:** ultracode multi-agent research run (5 parallel facet researchers → adversarial fact-check of 14 load-bearing claims → synthesis). Result: 13 confirmed, **1 refuted** (PowerYard is a third-party e4Score product, *not* a Navis/Kaleris product — see §A correction), 0 left uncertain.
**Purpose:** grounded source-of-record behind the vault vision note `docs/obsidian-vault/09-Future/Terminal & Depot Operating System (North Star).md` and **ADR-0015**. Scope: a single mid-size container terminal, port-services, and depot operator (KTC, Davao) on a modern web stack — explicitly **not** a 30-year enterprise rollout.

---

## A. What Navis Is — Product Family, Positioning, Ownership

**Lead reference for KTC: Navis Octopi, not N4.** The closest analog to KTC's situation is **Octopi** ("Navis Octopi by Kaleris"), a cloud-native SaaS TOS built **exclusively for small container and mixed-cargo terminals**, explicitly sized for roughly **100,000 TEU/year** — almost exactly KTC's profile. Octopi's pitch is the SaaS antithesis of an enterprise rollout: low cost to start, no maintenance fees, no third-party software, fast implementation, continuous updates, runs on any device. Its module scope is the right scope for KTC: containers + general cargo, berth/vessel/yard planning, gate processing, EDI (EDIFACT + ANSI X12), one-click voyage invoicing/tariffs, and real-time KPI/BI dashboards. Octopi was launched in 2015 by Cetus Labs and acquired by Navis (then under Cargotec), completing **March 8, 2019**. Critically, Octopi exists *because N4 is too heavy* — it deliberately omits N4's enterprise scalability, deep customization, optimization, and automation in exchange for simplicity. **That omission list is KTC's roadmap guidance: copy Octopi's scope, consciously skip N4's.**

**The Navis product family, tiered by terminal size and cargo mix:**

- **N4** — the enterprise flagship TOS for large/mega, multi-terminal, and fully automated container terminals. Drives AGVs/AutoStrads/AutoShuttles/AutoTrucks via its Automated Horizontal Transport (AHT) scheduler and bundles optimization engines. Historically on-premise; Navis added **"N4 as a Service" (SaaS)** and **"Navis 360"** managed services; **N4 4.0** is positioned as cloud-native. **Over-spec and over-cost** for a single mid-size operator — but the canonical reference for the *module taxonomy* a Navis-style system eventually needs.
- **Octopi** — cloud SaaS TOS for small/medium container & mixed-cargo terminals (~100k TEU/yr). **KTC's north star.**
- **Master Terminal** (Jade Logistics, NZ; acquired by Navis end-2019) — the **mixed/general-cargo TOS** for breakbulk, bulk, project cargo, logs, steel, RoRo, and containers in one database. **Relevant to KTC's mixed-cargo/depot reality** — a reminder the data model may need to be mixed-cargo, not container-only.
- **SPARCS / Express ("XPS")** — Navis's legacy TOS generations preceding N4. SPARCS was the industry's first computerized TOS; N4 ships migration tooling.
- Kaleris also markets a **"GC TOS"** and a **"Lightweight Turnkey TOS"**, plus **PINC** (cloud YMS using RTLS/RFID/GPS).

**Corporate ownership chain:** Founded **1988**, Oakland CA → acquired by **Zebra Technologies** (~USD 145M, Dec 2007) → divested to **Cargotec** (~USD 190M, Mar 2011; built the tiered portfolio via the Octopi + Master Terminal acquisitions in 2019) → sold to PE firm **Accel-KKR** in 2021 (enterprise value **EUR 380M ≈ USD 448–450M**; the circulating "~$380M USD" figure is a EUR/USD conflation) → merged into **Kaleris** on **September 13, 2022**. Products now sell under the **Kaleris** brand, bundling port TOS, yard management (PINC), transportation, and MRO into one "Execution & Visibility Platform."

> **Correction — "PowerYard":** Do **not** cite PowerYard as a Navis/Kaleris product. It is a real, currently-marketed **third-party** YMS from **e4Score (IGIT Enterprises, Inc.)**, part of its PowerYMS suite (with PowerGate, EZCheck-In). Kaleris brands its own YMS as **"Kaleris YMS" / PINC**. Unrelated vendors.

**Competitive landscape (context, not procurement):**
- *Enterprise container TOS:* Navis N4 (Kaleris), CyberLogitec OPUS Terminal, Tideworks Mainsail/Spinnaker (+ the **Forecast** customer web portal), Total Soft Bank CATOS, Solvo.TOS, RBS TOPS Expert.
- *Mixed/breakbulk & automation:* Master Terminal (Jade/Kaleris), TBA Group (Autostore, CommTrac).
- *Depot-specific tier:* iInterchange (iDepo), eCDMS, ContainerHub, ContVisor, Contcloud, Depot Systems, LogStar, Envision (ESL), MRI Intermodal (tank depots).

**Note on Tideworks Forecast:** the customer-facing web portal is a *distinct, value-adding layer* competitors sell separately. **KTC already has this** — its Online Portal is the Forecast-equivalent.

---

## B. TOS Module Map — Functional Pillars of a Container TOS

A container TOS is interlocking modules that all read/write **one authoritative container record**. They are **layered, not monolithic**: the inventory spine + a clean move/work-instruction model come first; planning/optimization engines sit on top and are added incrementally.

### B1. Container Inventory / Lifecycle — *the data spine*
One authoritative record per container, real-time. **Entities:** container (ID/ISO type/size, status full/empty/import/export/transshipment, weight, hazmat & reefer attributes, seals) + full **location/move history**. Every other module reads/updates this spine. **Build it first.**

### B2. Vessel & Berth Planning (seaside)
Berth allocation (vessel ↔ berth/time vs ETA/ETD, tide, draft, length, crane reach), the **stowage/bay plan** (bay–row–tier), discharge/load sequencing, **crane split**. Ingest inbound **BAPLIE** → build load/discharge lists (**COPRAR**) → crane sequence → emit departure BAPLIE. N4: Vessel/Rail Autostow.

### B3. Yard Planning (landside stack)
Allocates each container a yard position (block→bay→row→tier) via a **decking strategy** segregating by import/export, discharge port/rotation, size/type, status, and weight (heaviest at bottom). Housekeeping/pre-marshalling moves cut future rehandles. **Ideal handling = twice per container**; anything more is a **rehandle**. N4: Expert Decking.

### B4. Gate Operations
Truck interface — appointment/pre-advice, gate-in/out, OCR (number, ISO code, plate, damage), RFID, weighbridge for VGM. **Entities:** appointment, gate transaction, **EIR (Equipment Interchange Receipt)** — records condition, transfers custody. Pre-book → gate-in (OCR + survey → e-EIR) → gate-out (second EIR). **CODECO** reports each move to the line.

### B5. Rail / Intermodal
Mirrors the vessel module for trains — consist/manifest planning, railcar load/discharge sequencing, **RMG** deployment. N4: Rail Autostow.

### B6. Equipment & Labor Management
Models the **CHE** fleet (quay/STS cranes ~30+ moves/hr, RTG/RMG, straddle carriers, reach stackers, empty handlers, terminal tractors), tracks real-time status, runs **work-queue dispatch** — breaking plans into discrete **work instructions** to in-cab terminals. N4 **PrimeRoute** optimizes horizontal-transport routing. AI handles routine reallocation; humans manage exceptions.

### B7. Billing / Tariffs
Captures every billable event and prices it against tariffs/contracts: handling/move (lift on/off, THC); **storage & demurrage** (free-time then accrual *inside* the terminal) vs **detention** (*outside* beyond free time); reefer plug/monitoring; value-added/special services (stripping/stuffing, inspections, OOG).

### B8. Cross-cutting
- **Reefer monitoring** — setpoint vs actual temp, alarms; feeds safety + plug-billing.
- **Dangerous goods (IMDG)** — class, UN number, **segregation table/groups** (Column 16 = prohibitions), control/emergency temps.
- **Reporting/KPIs** — **GMPH/NMPH** (gross/net crane moves/hr), berth productivity, **TTT** (truck turnaround time), yard utilization %, import/export dwell, rehandles/move.

**Binding glue — SMDG-maintained EDI:** BAPLIE, MOVINS, COPRAR, COARRI, CODECO, BERMAN. *(See §D.)*

---

## C. Depot & M&R Map — the Empty-Depot Side

A **container depot** (empty-container depot / ICD / off-dock CY) is where lines and lessors park, inspect, repair, store, and re-release **empty** boxes between voyages. **The operator does NOT own the containers** — it is a **custodian** acting for the box's principal (a carrier like Maersk/Hapag-Lloyd, or a lessor like Triton/Textainer). This custodial relationship drives the whole data model: every box belongs to *some line*, is at *some lifecycle stage*, and every move/repair must be **authorized and billed back to that principal**. **KTC is exactly this kind of operator** — so a depot module is a natural extension.

**The gate is the spine.** On gate-in: identify the box (ISO 6346 + size/type), survey it, issue an **EIR** (number, seal, ISO type, load status, weights, condition). The EIR legally transfers custody/liability. Gate-out issues a second EIR. Each move is reported by **CODECO**.

**The defining workflow — authorize before repair:**

> **survey → EOR → line approval → repair → release**

The estimator codes each damage with the **IICL / ISO 9897** component–location–damage–repair scheme, builds an **EOR (Estimate of Repair)** priced against the depot's tariff + the line's agreed rates, and transmits it to the owner via the **DESTIM** message. The line approves/partially-approves/rejects **each line item**; only approved lines are repaired; the box is upgraded in grade and released. **This authorize-before-repair loop has no equivalent in a pure terminal TOS — it is the heart of depot software.**

**Reefer parallel — PTI:** a **Pre-Trip Inspection** (controller self-test + structural/cleanliness check) before release. Tracked separately from dry-box repairs, reported to the line.

**Stock management — sliced by what the principal cares about:** by **shipping line/principal**; by **ISO 6346 size-type** (20GP, 40HC, 40RF, open-top, flat-rack, tank); by **grade**: **IICL** (strictest) > **Cargo-Worthy (CW)** > **Wind-&-Water-Tight (WWT)** > **As-Is**, plus damaged/under-repair/available. Reservation by grade, age, or FIFO. **Releases are line-driven:** a **COREOR** (release order) or **COPARN** (announcement) authorizes handing out N boxes of a type/grade to a named haulier/booking.

**Lease & redelivery:** a returned leased box is surveyed against IICL; damage **above the lessee's Damage Protection Plan (DPP) threshold** is billed to the lessee, below it is covered; the unit re-enters available stock once repaired.

**DMS vs terminal TOS:**

| | Terminal TOS | Depot DMS |
|---|---|---|
| Built around | vessels, berths, quay cranes, yard-slot planning, stowage, high-throughput CHE | EIR/gate, survey, IICL-coded EOR estimating, line-approval routing, repair work orders, reefer PTI, per-principal stock |
| Missing dimension | — | no vessel/berth/crane/stowage |
| EDI focus | BAPLIE/COPRAR/COARRI/CODECO with lines | DESTIM/CODECO/COPARN/COREOR back to *dozens* of owners |
| Overlap | container identity (ISO 6346), gate moves, yard/inventory visibility, EDI plumbing, billing | (same) |

---

## D. Integration & Data Standards — Why It's Make-or-Break

**A TOS lives or dies on integration because a terminal is structurally a hub, not an island.** It receives instructions it did not author (loadlists, releases, bookings) and emits confirmations + gate events downstream parties depend on near-real-time. Trapped or wrong data → demurrage, mis-stows, gate disputes, SOLAS/VGM non-compliance. Industry material frames EDI as a **baseline capability, not a feature**. **SMDG** publishes the **Message Implementation Guidelines (MIGs)** vendors code against, atop UN/CEFACT's UN/EDIFACT directories.

### Key EDIFACT messages

| Message | Name | Purpose | Direction |
|---|---|---|---|
| **BAPLIE** | Bayplan/Stowage Plan | What containers are on the vessel & where | Terminal ↔ Carrier |
| **MOVINS** | Move/Stowage Instruction | Carrier's stow/move instructions | Line → Terminal |
| **COPRAR** | Container Discharge/Loading Order | The load/discharge list | Line → Terminal |
| **COARRI** | Container Discharge/Loading Report | Confirmation of what was actually moved | Terminal → Line |
| **CODECO** | Container Gate-In/Out Report | Truck/rail/barge gate movements | Terminal/Depot → Line |
| **COPARN** | Container Announcement | Booking/release-acceptance of equipment | Line → Terminal |
| **COREOR** | Container Release Order | Authorizes release to a named third party | Line → Terminal |
| **COPINO** | Container Pre-Notification | Inland carrier notifies of delivery/pickup | Forwarder/Line → Terminal |
| **COHAOR** | Container Special Handling Order | Order to perform special handling/services | Line → Terminal |
| **COEDOR** | Container Stock Report | Inventory/stock status (≈ EOD stock report) | Terminal → Line |
| **DESTIM** | Equipment Damage & Repair Estimate | The depot EOR sent to the owner | Depot → Owner/Lessor |
| **VERMAS** | Verification of Gross Mass | SOLAS VI/2 VGM | (per SOLAS) |
| **IFTMIN / IFTSTA** | Transport Instruction / Status | Generic cross-industry transport & tracking | Cross-industry |

### Container identity — ISO 6346
11 chars: **3-letter owner/BIC code + equipment category (U/J/Z) + 6-digit serial + 1 check digit** (check digit = letter→number conversion, 2^position weighting, modulo 11). A separate **4-char size-type code** encodes length/height/type (e.g. **22G1** = 20ft 8'6" GP, **45G1** = 40ft HC GP, **22R1** = 20ft reefer). **These two standards are the primary keys of the entire domain.**

### Customs & PCS
Customs is an adjacent rail, not a TOS function to author. In the **Philippines**, the Bureau of Customs runs **e2m Customs** with advance **e-Manifest** via accredited **VASPs** — **already live at the Port of Davao**. So KTC's customs touch-point is **reconciliation** with e2m/VASP manifest data, not building customs declarations; the BIR invoice/OR stays in the Frappe ERP. A **Port Community System (PCS)** is a neutral platform connecting all port actors; a modular operator can join one later or expose clean endpoints in the meantime.

**Minimal viable integration surface** (narrow but non-negotiable):
1. **ISO 6346 validation everywhere** a box number is captured.
2. **Vessel-call loop:** inbound COPRAR/COPARN/BAPLIE → outbound COARRI/BAPLIE.
3. **Gate/depot loop:** CODECO in/out + COREOR/COPINO.
4. **Stock/EOD reconciliation:** COEDOR → ERP.
5. **Customs/e2m manifest reconciliation** (not a full declaration engine).

> **Honest caveat:** real carrier EDI onboarding (per-line MIGs, VASP accreditation, e2m specifics) is partner- and jurisdiction-dependent. **EDI is the single biggest hidden cost** in this domain — Octopi itself markets in-house EDI experts as a managed service.

---

## E. Where KTC Sits Today — Honest Gap Analysis

**What KTC's portal essentially is:** the **customer front-door** (the Forecast/Octopi-equivalent web portal competitors sell separately — KTC already has it) **+ a special/value-added-services request & billing layer**. It implements pieces of three TOS modules *without naming them as such*, but the container itself and the vessel call are **still off-system**.

| Module | KTC today | Gap |
|---|---|---|
| **B1 Container spine** | **Absent.** No authoritative container record, no move/event ledger. | **The single biggest missing foundation.** |
| **B2 Vessel/berth** | Absent. | Defer. |
| **B3 Yard planning** | Partial — gate/yard *service requests* (Job Orders) but no position model/decking/rehandle tracking. | Add after the spine. |
| **B4 Gate / EIR** | Partial — Job Order + checker flow is gate-shaped, but **no EIR, no condition capture, no weighbridge/VGM**. | High-value; doubles as depot core. |
| **B5 Rail** | Absent. | Defer. |
| **B6 Equipment & labor** | Partial — the **serving-number queue** is a primitive work-dispatch layer. | Grow into per-CHE work queues. |
| **B7 Billing/tariffs** | Partial — per-service rate config (`service_rates`/`pricing_settings`, 0030), manual payment-proof review, ERP invoice recording. Official **BIR invoice in Frappe ERP**. | Generalize into the full tariff set. |
| **B8 Reefer/IMDG/KPIs** | Absent. | Design into the spine from day one. |
| **D Integration/EDI** | Absent (Sheets-mirror pattern + pg_cron jobs exist). | Longest horizon. |
| **Depot M&R (§C)** | Absent — though KTC **is** a depot operator. | Natural next vertical. |

**Existing strengths (the stack is already right):** Supabase Postgres + RLS + SECURITY DEFINER RPCs; React/Vite SPA on Vercel; role model (owner/admin/cashier/checker + customer); the `held → submitted → processing → on_hold → completed/rejected/cancelled` lifecycle; manual payment-proof submit→review; valid-ID upload+review; per-service pricing config; serving-number queues. **Each is a reusable primitive for the modules above.**

**Honest summary:** KTC has a credible *customer-and-services front-end* but **none of the operational data spine** that makes a system a TOS. That spine is the next build; everything else is a projection over it.

---

## F. Realistic Modular North-Star Roadmap (Octopi-style, NOT N4)

**Product north star: Octopi-class.** KTC's stack already matches the Octopi cloud model. Treat optimization as far-future; grow **module-by-module**.

### Phase 0 (FIRST, non-negotiable): the container + EIR data spine
1. **`containers`** — one authoritative record keyed on **ISO 6346 number + size/type + owner line + grade**; status, seal, vessel+voyage, reefer/hazmat flags, weight. Validate ISO 6346 (BIC code, equipment category, **check digit**) and parse size-type — cheap pure-function logic (Postgres CHECK/RPC + TS validator) that prevents the most common terminal data error.
2. **`container_events` / `moves`** — an **append-only, immutable** ledger of timestamped transitions (gate-in → put-away → yard shift → load → discharge → gate-out) with location, equipment, operator.
3. **EIR record** — the legal in/out document at each gate event; mirrors KTC's existing upload/review patterns.

Design reefer/hazmat attributes + KPI fields **into the spine from day one**.

### Sequenced modules (tied to KTC's three pillars)

| Phase | Module | Pillar | Rationale |
|---|---|---|---|
| **1** | **Gate + e-EIR** (ISO damage coding + photos) | Depot + Terminal | Doubles as the depot core; reuses KTC's upload/review patterns; extends the Job Order + checker flow. |
| **2** | **Depot M&R** — `surveys`, `eor` + `eor_lines` (IICL codes + tariff, reusing the `service_rates` pattern), `work_orders`, reefer **PTI**; stock by line/ISO-type/grade | Depot | The **survey→EOR→line-approval→repair→release** loop is structurally identical to KTC's serving-number + admin-approval flow; EOR line-item approval mirrors the payment-proof review; RLS scopes each principal to its own boxes exactly as customers are scoped today. |
| **3** | **Yard inventory + visual map + storage-day clock** | Terminal + Depot | block→bay→row→tier, rule-based decking, rehandle tracking. |
| **4** | **Billing/tariffs generalization** | All three | Extend rate config into handling/storage/demurrage/reefer/VAS. **Keep the official BIR OR in Frappe — do NOT rebuild it.** |
| **5** | **Equipment/labor work queues** | Terminal | Grow the serving-number queue into per-CHE work queues. |
| **6** | **KPIs/BI dashboards** (dwell, TTT, GMPH/NMPH, utilization) | All three | Reads the event ledger. |
| **7** | **Integration adapters** — model EDIFACT as **internal state transitions first**, then validated/idempotent/logged import-export adapters | All three | COPRAR/COPARN/BAPLIE → "expected work"; COARRI + CODECO → events KTC already half-records; COEDOR → EOD stock into Frappe; DESTIM → depot EOR emit. Customs = **reconcile e2m** (live at Davao). PCS = long horizon. |

### Explicit "do NOT attempt early" (copy Octopi's deliberate omissions)
- **Heavy seaside stowage optimization** (Vessel/Rail Autostow, crane split, full BAPLIE vessel planning).
- **Full EDI suite up front** — start manual + portal capture + CSV/Sheets import; add per-carrier EDI **only when a specific carrier demands it**.
- **Automated equipment control** (PrimeRoute routing, RTG optimization, AGV/AutoStrad control, in-cab RF).
- **Optimizer-based yard decking** — start rule-based.
- **Rebuilding official BIR invoicing** — stays in Frappe ERP.
- **Full PCS membership** — expose endpoints; defer joining.

**Throughline:** treat terminal-TOS features (gate, container identity, yard, billing, EDI) as the shared **backbone**, and build the **depot M&R workflow as a distinct module on top** — matching the "modular Navis-style operating system" goal without the vessel/berth/crane planning KTC doesn't need yet. Octopi and Master Terminal were both lightweight products filling gaps N4 couldn't serve cheaply — exactly the mid-size + depot niche KTC targets.

---

## G. Glossary

- **TOS (Terminal Operating System)** — system-of-record running berth, yard, gate, rail, equipment, inventory, billing, reporting. Navis/Kaleris N4 is the reference.
- **DMS (Depot Management System)** — specialized for empty/inland depot ops: gate/EIR, survey, IICL-coded EOR with line approval, repair work orders, reefer PTI, per-principal stock, EDI. Omits vessel/quay concerns.
- **N4 / Octopi / Master Terminal / SPARCS-XPS** — see §A.
- **Kaleris** — current parent (Sept 2022 Navis merger; Accel-KKR owned).
- **PINC** — Kaleris's cloud YMS (RTLS/RFID/GPS). **PowerYard** — *third-party* e4Score YMS, NOT Navis.
- **TEU** — Twenty-foot Equivalent Unit (Octopi targets ~100k/yr).
- **EIR** — Equipment Interchange Receipt; signed gate-in/out document transferring custody.
- **EOR** — Estimate of Repair; priced IICL-coded damage breakdown sent to the owner for approval before repair.
- **PTI** — Pre-Trip Inspection of an empty reefer before release.
- **IICL** — Institute of International Container Lessors; repair manuals + codes; also a strict grade.
- **ISO 9897** — damage coding (component + location + damage + repair) inside EOR/DESTIM lines.
- **Container grades** — IICL > Cargo-Worthy (CW) > Wind-&-Water-Tight (WWT) > As-Is.
- **DPP** — Damage Protection Plan; lessor insurance with a repair-cost threshold.
- **CHE** — Container Handling Equipment (STS/quay cranes, RTG, RMG, straddle carriers, reach stackers, terminal tractors).
- **Decking strategy / rehandle** — yard stacking policy to minimize non-productive lifts.
- **Demurrage vs detention** — *inside* the terminal beyond free time vs *outside* beyond free time.
- **GMPH/NMPH** — gross/net crane moves per hour. **TTT** — truck turnaround time. **VGM** — Verified Gross Mass (SOLAS).
- **UN/EDIFACT / SMDG / MIG** — the EDI syntax family, the standards user-group, and its per-message implementation guidelines.
- **EDIFACT messages** — BAPLIE, MOVINS, COPRAR, COARRI, CODECO, COPARN, COREOR, COPINO, COHAOR, COEDOR, DESTIM, VERMAS, IFTMIN/IFTSTA — see §D table.
- **ISO 6346** — container ID standard (owner/BIC code + category + serial + check digit; 4-char size-type).
- **PCS** — Port Community System (neutral platform / local Single Window).
- **ASYCUDA / e2m / VASP** — UNCTAD customs system / PH Bureau of Customs e-manifest system (live at Davao) / accredited value-added service providers.
- **Forecast (Tideworks)** — customer web portal; the analog of KTC's existing Online Portal.
