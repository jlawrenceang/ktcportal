# Port TOS / Navis-Class Best Practices — Domain Research Seed

**Domain research seed — reference only, NOT adopted. Tackle when ktc-portal is opened (supports OKR O3, Navis-class TOS endpoint). Scraped 2026-06-28 (framework session).**

Companion to `docs/research/navis-tos-landscape-2026-06-13.md` (the landscape/product-family brief). This document goes one layer deeper: operational patterns, technical standards, and implementation lessons for each TOS domain. Cross-references to the landscape doc are noted where it already covers a topic.

---

## 1. Gate Operations / EIR — OCR & Automation

### Practice: OCR for container number + plate recognition at gate

**What it is.** Modern terminals deploy Optical Character Recognition (OCR) cameras at gate-in/out lanes to automatically read the ISO 6346 container number, ISO size-type, and truck plate. OCR replaces manual data entry and reduces human error at the gate transaction boundary.

**Why it matters.** OCR error rates at the gate run 10–30% without optimization — primarily due to poor lighting, bad weather, container surface damage, motion blur, and camera hardware issues. Each error requires a manual intervention that stalls the lane, increases truck dwell, and degrades data quality in the TOS.

**Current state of the art (2025).** A peer-reviewed 2025 study of Tangier Med Port (Africa's busiest container terminal) evaluated a hybrid Genetic Algorithm + Neural Network (GA-NN) model for tuning OCR system parameters in real time. Key finding: GA-based adaptive optimization of OCR thresholds, camera angles, and preprocessing steps significantly reduced error rates and improved system uptime. The study frames OCR as a constrained optimization problem with hardware, software, environment, and operational variables — not just an ML classification problem.

**Implications for KTC.**
- KTC's near-term gate is manual + checker (the existing `checker` role). When gate volumes grow, OCR is the natural automation path.
- Build the gate data model first (ISO 6346 number, size-type, plate, condition, EIR) — so OCR results can feed into it later without re-engineering the data shape.
- For a small terminal at KTC's volume, a commercial fixed-OCR installation (rather than custom GA-NN tuning) is realistic. The study's value is its parameter taxonomy — the right metrics to spec against a vendor: error rate, uptime SLA, false-negative handling.

**Source.** Springer Discover Applied Sciences, Vol 7 article 714, July 1 2025, open access. DOI: 10.1007/s42452-025-07289-3. Confidence: high — peer reviewed, open access, recent, specific terminal case study.

---

### Practice: Truck appointment systems to reduce gate congestion

**What it is.** A gate appointment system (TAS — Truck Appointment System) requires trucks to pre-book a time window before arriving at the terminal gate, preventing the "morning rush" surge that creates long queues on public roads and inside the terminal.

**Why it matters.** Coordinated appointment systems reduce truck turnaround time (TTT) by approximately 30% in documented deployments. Fewer trucks queuing simultaneously means lower emissions, lower staff overtime, and lower road congestion near the port — increasingly a license-to-operate requirement in urban ports.

**Related to KTC.** KTC's existing release/pull-out flow (`ADR-0024`) has customers filing online and receiving approval before arriving — this is effectively an appointment-like gate pre-clearance. The same pattern (submit → approve → pick up with a time window) should govern the Pillar 2 truck gate when built.

**Source.** loadmaster.ai yard planning article, 2025/2026, citing C3 Solutions industry research. Confidence: medium — industry blog citing analyst data; directionally confirmed by broad TOS literature.

---

## 2. Yard Operations — Block Stacking & Slot Allocation

### Practice: Rule-based slot allocation before algorithmic optimization

**What it is.** Yard planning software assigns each inbound container to a specific block, bay, row, and tier position (block→bay→row→tier). The core rules segregate containers by: import/export status, discharge port/rotation, ISO size-type (20ft vs 40ft), hazmat class, reefer/dry, and weight (heaviest at bottom of stack). Within those lanes, First-In-First-Out (FIFO) or arrival-sequence ordering minimizes future rehandles.

**Why it matters.** The metric is rehandles per container move. Industry best: 2 lifts per container (one in, one out). Each additional lift is a "rehandle" — unproductive, time-consuming, and wear-intensive on equipment. Rule-based decking (segregate by export-rotation, keep same-vessel containers in the same block) typically achieves near-optimal rehandle rates at small terminal volumes. Optimizer-based AI decking (using predictive retrieval probability models) is appropriate for large, complex yards — over-engineered for a small terminal.

**For KTC.** The landscape doc (ADR-0015, Phase 3) already specifies rule-based decking as the right starting point. Confirm: the segregation rules above are what that means operationally. The position model (block→bay→row→tier) needs to be designed into the data model with the container spine, not bolted on later.

**Source.** loadmaster.ai article on yard planning for small inland container terminals, 2025/2026. Confidence: high for rule patterns — consistent with TOS literature; appointment stat (30%) is medium-confidence (single cited source).

---

### Practice: Real-time yard view as the single pane of glass

**What it is.** A live dashboard showing container slot occupancy, crane assignments, gate bookings, and equipment positions — fed by RFID tags, crane telemetry, and TOS event updates. In IoT-enabled deployments, this has reduced manual inventory errors by up to 40% according to industry analyst data.

**For KTC.** This is Phase 6 (KPIs/dashboards) on the modular roadmap. Design the `container_events` ledger spine (Phase 0) to be queryable as a live view — this is what the "derived over hand-maintained" principle in the landscape doc means in practice.

**Source.** loadmaster.ai, citing C3 Solutions data. Confidence: medium for the 40% stat; high for the pattern.

---

## 3. Depot / M&R — Empty Container Management

### Practice: The survey → EOR → line-approval → repair → release workflow is the non-negotiable core

*(This is already well-covered in the landscape doc §C. This section adds implementation nuances.)*

**Key nuance — container repair decision model.** Academic research (PMC/Springer, 2020) formalizes the repair-vs-retire decision: the critical variables are repair cost vs residual container lifespan, future failure rate post-repair, and the lessee's Damage Protection Plan threshold. In practice, depot software needs to support the estimator in quickly computing whether a repair is economically justified — not just recording the damage codes. EOR line-item approval should include a "decline to repair / mark as damaged stock" path for containers where repair cost exceeds the line's agreed threshold.

**Key nuance — grade transitions matter to billing.** When a container moves from IICL grade to Cargo-Worthy (CW) or below, that is a billable event against the lessee under the DPP. The grade field in the container spine must be immutable history (append-only via `container_events`), not an overwritable current-state field, so grade-at-departure can always be proven.

**Source.** PMC article PMC7581502, 2020. Confidence: medium-high — peer reviewed academic source; operationalized by decades of depot practice.

---

### Practice: IICL/ISO 9897 damage coding is the EOR vocabulary

**What it is.** Each damage item in an Estimate of Repair (EOR) is coded using a four-element structure: Component (e.g., floor board) + Location (e.g., left front) + Damage type (e.g., crack) + Repair action (e.g., replace). The IICL repair manual (5th edition) is the physical standard; ISO 9897 is the electronic-interchange standard used in the DESTIM EDI message. Both code to the same semantic.

**For KTC.** The EOR line-item schema (`eor_lines`) should include: component_code, location_code, damage_code, repair_action_code (all IICL-aligned), plus dimensions (area/length for pricing), unit, quantity, unit_cost, approved (boolean), and approval_notes. The `service_rates` pattern already in the KTC codebase can be reused for the tariff/pricing layer.

**Source.** IICL manual + landscape doc §C synthesis. Confidence: high — industry standard.

---

## 4. Reefer Monitoring & PTI

### Practice: PTI is a structured pre-release verification protocol, not an ad-hoc inspection

**What it is.** A Pre-Trip Inspection (PTI) is a standardized inspection of an empty reefer container before cargo loading. It verifies: structural integrity (door seals, floor, walls), refrigeration unit performance (compressor, evaporator, condenser), electrical safety, airflow condition, temperature control accuracy (setpoint vs actual), alarm and sensor operation, and overall readiness. Most major shipping lines specify their own PTI standards; depot software must record pass/fail per item and link the result to the container record and the release authorization.

**When PTI is triggered.**
- Before export cargo loading
- After any reefer repair work
- After long idle storage periods
- Before repositioning for sensitive cargo
- When required by the specific shipping line's operating instructions

**Key operational fact.** A reefer container can appear operational externally while having a faulty sensor, slow refrigerant leak, or defrost failure that only manifests during the voyage. PTI is what catches latent failures before cargo is loaded. Industry consensus: a skipped PTI is a liability transfer to the depot operator — if a claim arrives, the absence of a documented PTI record is presumptive negligence.

**For KTC.** Phase 2 of the depot module (landscape doc §F) includes reefer PTI. The data model needs a `reefer_pti_records` table with: container_id (FK), performed_at, performed_by, pass/fail per inspection item, setpoint_temp_c, achieved_temp_c, duration_minutes, and result (PASS/FAIL/CONDITIONAL). Link it to gate-out authorization: a reefer cannot be released without a PASS PTI result within a configurable staleness window (typically 24–72 hours per line instructions).

**Source.** SNTReefer Reefer PTI Guide (published May 22, 2026, sntreefer.com). APM Terminals Gothenburg PTI service page. Confidence: high — both from industry practitioners; SNTReefer guide is 2026 and comprehensive.

---

### Practice: Reefer monitoring ≠ PTI — in-yard monitoring is a separate operational layer

**What it is.** For reefers sitting in the terminal/depot yard on power plug racks, in-yard monitoring continuously records temperature, setpoint compliance, and alarm events. This is distinct from PTI (which is a point-in-time pre-departure check). Billing for reefer plug-time is a separate tariff line (per hour or per day).

**For KTC.** Even before a full monitoring system: design the container spine to carry `reefer_setpoint_c` (float, nullable), `reefer_monitoring_required` (boolean), and an alarm/event log table linked to container_events. The billing module (Phase 4) prices reefer plug-time from the plug-in to plug-out events in the ledger.

---

## 5. EDI / Integration — EDIFACT, APIs, and PCS

*(The landscape doc §D has the full EDIFACT message table. This section adds implementation strategy and the PCS/API modernization context.)*

### Practice: EDIFACT is still the backbone; REST/JSON is the integration layer

**What it is.** Despite 40+ years of evolution, UN/EDIFACT remains the foundational standard for B2B data exchange in container shipping. Modern systems add REST/JSON or XML API layers on top — but when communicating with shipping lines, port authorities, and customs, EDIFACT messages are still expected. Industry analysis (World Bank PCS study, 2023): "Notwithstanding these improvements, the data standards underpinning UN/EDIFACT remain the cornerstones of trade."

**The evolution pattern.** 1980s: raw EDIFACT over VAN (Value-Added Network). 1990s: EDIFACT standardized into SMDG Message Implementation Guidelines. 2000s: EDIFACT via internet/SFTP replaces VAN. 2010s: ports begin exposing REST/JSON APIs alongside EDIFACT (the "Port Community System" era). 2020s: cloud-native TOS vendors (Octopi, Envision ESL) design REST-first internally, with EDIFACT as an adapter. **The right build order for KTC: model state transitions in internal Postgres events first; EDIFACT becomes an import/export adapter on top of that model.**

**For KTC (from landscape doc §D, reinforced here).** The minimal viable integration surface is:
1. ISO 6346 validation on every container number input (cheap, pure-function, do it from day 1).
2. Internal event model first — gate-in/out events, move events — so the state machine is right before any EDI.
3. Add CODECO (gate move reports to lines) when a specific carrier demands it.
4. COPRAR/BAPLIE (vessel discharge/load lists) when KTC needs vessel planning, not before.

**Source.** World Bank "Port Community Systems" report (2023), Chapter 1 and Chapter 5. UNESCAP Webinar on Interoperability of PCS (2025). Confidence: high — World Bank primary source, confirmed by UNESCAP.

---

### Practice: PCS reduces truck dwell from hours to minutes — but requires neutral governance

**What it is.** A Port Community System (PCS) is a neutral digital platform connecting all port stakeholders (terminal operators, shipping agents, customs, truckers, freight forwarders) through a shared data infrastructure. It standardizes document exchange, automates gate clearance, and provides a single submission point for manifests and cargo documentation.

**Case studies.**
- Port of Cotonou (Benin): PCS implemented 2011, reduced average large-truck stay from 269 hours to 3 hours within one year.
- King Abdullah Port (Saudi Arabia): PCS as backbone of operations, contributing to high World Bank CPPI rankings.

**For KTC.** KTC is not operating at PCS-membership scale today. The practical path: expose clean webhook/API endpoints (CODECO-equivalent) that future PCS integration can consume, rather than building PCS membership now. KTC's existing webhook/notification patterns (pg_cron + email) are the precursor. The ASEAN regional PCS movement (UNESCAP 2025) is relevant as the Philippines modernizes customs integration.

**Source.** World Bank PCS study (2023). UNESCAP 2025 webinar record. Confidence: high for case studies (well-documented); medium for Philippines PCS timeline (still emerging).

---

## 6. Billing / Tariffs — Storage, Demurrage & Detention

### Practice: Demurrage and detention are legally distinct; the TOS must model them separately

**Canonical definitions (from shipping-line tariff practice).**
- **Demurrage**: a charge for a container remaining on the carrier's terminal (inside the port/terminal) beyond the free-time allowance. While incurring demurrage, the equipment is in the carrier's/operator's possession. Free-time calculation: typically starts the first business day after container discharge.
- **Detention**: a charge for a container held outside the terminal beyond the free-time allowance, in the shipper/consignee's possession. Free-time calculation: starts the day after equipment departs the terminal.

**Standard free-time structure.** The industry standard (carrier-side) is 3–5 free calendar or business days for imports, with escalating daily rates thereafter (e.g., USD 50/day days 1-3, USD 100/day days 4-7, USD 150/day thereafter). Terminal operators (like KTC) apply their own storage tariff on top of this (port storage charge), distinct from the carrier's demurrage charge.

**Government holds.** Most carriers offer 3 additional business days of free time for government-mandated holds (BOC examination). This exception is a standard tariff clause — important for KTC's Philippines context, where BOC exams are common.

**For KTC.** The billing/tariffs module (Phase 4) needs: a `free_time_rules` table (by container type, status, cargo class) + a `storage_events` ledger (container arrives in yard → exits yard, with timestamps) + a daily run (pg_cron) that computes accrued storage charges against the tariff schedule. The key design constraint: storage charges must be computable from the event ledger, not from hand-entered data. Also: demurrage (operator's terminal charge) vs detention (carrier's charge for time off-terminal) are *different billing relationships* — do not conflate them in the schema.

**Source.** Seaboard Marine Demurrage & Detention tariff page (updated 2024-11-05), a US carrier whose definitions are canonical. Confidence: high for definitions; medium for specific day counts (varies by carrier/port).

---

### Practice: Per-service rate config (already built) is the right foundation — extend it

**KTC has this.** The existing `service_rates` / `pricing_settings` table (migration 0030) and the `ADR-0027` per-service rate granularity design are already a tariff layer. Phase 4 extends this model to: handling/move tariffs (THC), storage rates (per diem per TEU/FEU), reefer plug tariffs (per hour/per day), and VAS/special-service rates (stripping, stuffing, inspection, OOG). The structural pattern is already proven.

---

## 7. Container Identity — ISO 6346 in Practice

### Practice: Validate ISO 6346 at every input point; don't defer to batch correction

**What it is.** ISO 6346 defines an 11-character container identifier: 3-letter owner/BIC prefix + 1 equipment category letter (U = freight container, J = detachable freight container equipment, Z = trailers/chassis) + 6-digit serial number + 1 check digit. The check digit is computed by: mapping each character to a number (A=10, B=12, ..., Z=38, skipping multiples of 11), multiplying each by 2^position, summing, dividing by 11, and taking the remainder. A separate 4-character size-type code (e.g., `22G1` = 20ft GP, `45G1` = 40ft HC, `22R1` = 20ft reefer, `42R1` = 40ft reefer) is carried alongside the container number.

**Common errors in practice.**
- Transposing characters (especially I/1, O/0, Q/0).
- Omitting the equipment category letter.
- Incorrect check digit from manual entry.
- Using a valid ISO number from the wrong box (mismatch between physical container and manifest data).

**Implementation tools.** BIC maintains a free online check digit calculator (bic-code.org). A JavaScript/TypeScript pure-function implementation of ISO 6346 validation is <50 lines of code; a Java reference implementation exists on GitHub (mixaverros88/check-digit-iso-6346). There is no reason to defer this — it is cheap, deterministic, and prevents the most common container data error.

**For KTC.** The landscape doc (§F Phase 0) already specifies: "Validate ISO 6346 (BIC code, equipment category, check digit) and parse size-type — cheap pure-function logic (Postgres CHECK/RPC + TS validator)." This finding reinforces that recommendation. Build it as a Postgres CHECK constraint + a client-side TS validation function, not just one or the other.

**Source.** Wikipedia ISO 6346 article (well-maintained, accurate). BIC check digit calculator (bic-code.org). pier2pier.com ISO 6346 guide (2025). GitHub java implementation. Confidence: high — ISO standard, authoritatively documented.

---

## 8. Equipment & Labor — Work Instruction Dispatch

### Practice: Model equipment types and work queues before automating dispatch

**What it is.** Container Handling Equipment (CHE) types relevant to KTC: reach stackers (most common at small terminals for both terminal and depot work), empty handlers (lighter, faster for empty depot work), terminal tractors + chassis (horizontal transport). Each piece of CHE generates a work instruction: "pick container X from position A, put it at position B." The TOS manages the queue of open work instructions and dispatches them to equipment operators (via in-cab RF terminals or a simple tablet/mobile app).

**Progression path for small terminals.**
1. Paper/whiteboard dispatch → manual radio coordination (where KTC likely is).
2. Simple digital work queue: TOS generates a work order list per shift; supervisor assigns to equipment/operator. No real-time optimization.
3. Active dispatch: TOS pushes work instructions to in-cab terminals, tracks completion, re-optimizes queue when exceptions arise.
4. Automated/optimized dispatch (N4 PrimeRoute level): route optimization, conflict detection, automated equipment allocation. Far-future for KTC.

**For KTC.** The existing serving-number queue is a primitive work dispatch pattern. Grow it: Phase 5 of the roadmap is "grow the serving-number queue into per-CHE work queues." The data model needs: equipment table (type, ID, current status, current location) + work_instruction table (container_id, action, from_location, to_location, assigned_to_equipment, status, completed_at).

---

## 9. Philippines-Specific Context

### BOC e2m and VASP ecosystem — what KTC needs to know

**The e2m system.** The Bureau of Customs' Electronic-to-Mobile (e2m) system is the Customs declaration and manifest processing platform for the Philippines. All sea manifests (Inward Foreign Manifest for shipping lines; Consolidation Cargo Manifest for NVOCCs/forwarders) must be submitted through BOC-accredited Value Added Service Providers (VASPs) before vessel arrival.

**Timing requirements (from BOC CMO):**
- IFM (shipping line): 12 hours before vessel arrival.
- CCM (NVOCC/forwarder): 6 hours before arrival.
- Late submission fine: PHP 10,000. Non-compliant (after arrival): PHP 20,000.

**KTC's touchpoint.** KTC, as a terminal/depot operator, receives an electronic copy of the manifest lodged through the VASP from the shipping line. The KTC TOS needs to reconcile this manifest data against its own container records (what physically arrived vs what the manifest says) — not author the customs declaration. The VASP sends KTC the bill-of-lading numbers that are registered in e2m; those BL numbers become the linkage for the customs examination workflow.

**Recent Mindanao context (June 2026).** BOC signed an MOA with PHIVIDEC-IA and MICTSI (Mindanao Container Terminal, Tagoloan, Misamis Oriental) on June 9, 2026, allocating a dedicated 10,000 sqm facility for seized container storage and enforcement operations at MCT. While this is Northern Mindanao (Tagoloan, not Davao), it signals active BOC investment in Mindanao port infrastructure enforcement — relevant to KTC's operating context.

**Source.** Scribd — Draft BOC CMO on e-manifest submission (implementing CAO 1-2007, 6-2007, 2-2013). BOC customs.gov.ph June 17, 2026 press release. PortCalls Asia reporting. Confidence: high for the IFM/CCM rules (official BOC document); medium for implications for KTC specifically (judgment call).

---

### Practice: Philippines PPA regulation and port concession context

**What it is.** Philippine Ports Authority (PPA) oversees port operations. Private terminal operators (like KTC) operate under PPA concession/lease. Any tariff schedule must be approved or filed with PPA; any expansion of services requires PPA concession compliance. The BOC and PPA joint administrative orders (e.g., JAO 20-01 during COVID) show how these agencies coordinate on cargo release.

**For KTC.** Before building out the tariff/billing module (Phase 4), verify: which rates require PPA filing vs are purely contractual with customers. The free-time schedule and storage rates in KTC's current service agreements are the source of truth — not generic industry norms.

---

## 10. Cloud-Native TOS Architecture Trends (2025-2026)

### Trend: Next-gen TOS vendors moving to cloud-native, AI, and digital-twin architectures

**What is happening.** TOS vendors in 2025-2026 are marketing cloud-native architectures, AI-driven planning, and digital twin capabilities. Envision ESL (a smaller TOS vendor) explicitly markets a "next-generation CTOS" with AI, cloud-native architecture, and digital twin tech. Kaleris markets N4 as increasingly cloud-ready. Octopi has been cloud-native SaaS since 2015.

**What this means practically for a small terminal.** The "digital twin" marketing is mostly irrelevant at small-terminal scale — it is optimization-layer technology (simulating what-if scenarios for cranes and berths at large, complex terminals). The relevant shift is: cloud-native SaaS TOS (Octopi model) vs on-premise enterprise TOS (N4 model). The SaaS model means lower upfront cost, faster implementation, vendor-managed infrastructure, and continuous updates — at the cost of less customizability. KTC's existing Supabase + Vercel stack is already cloud-native; it maps better to the Octopi architecture philosophy than to N4.

**Key insight: KTC is building what Octopi would build for a greenfield terminal — but owning the entire stack.** The risk is over-engineering. The mitigation: treat each module as shippable independently (landscape doc §F sequencing), and resist adding optimization layers before the spine is proven.

**Source.** Envision ESL blog (envisionesl.com, 2025/2026). Kaleris news releases. SLS Bucharest Octopi live case (kaleris.com, July 2024). Confidence: medium — vendor marketing; but the Octopi case study is concrete evidence of small-terminal SaaS adoption.

---

### Octopi live case study (July 2024) — what actually works

**SLS Bucharest Intermodal Terminal** went live with Navis Octopi by Kaleris in June 2024 (announced July 2024). Results:
- Accelerated train discharge via digital planning: offsite planners create the train plan in advance → onsite team has accurate info at time of work.
- Efficient coordination of reachstacker movements across the site.
- Enhanced customer experience: real-time cargo location/status visible to customers directly through Octopi; automated email delivery receipts to customers on truck interchange completion.
- Implementation partner: DSP (Data and System Planning, Switzerland) — Kaleris implementation partner since 2007.

**For KTC.** The "automated email delivery receipts on truck interchange completion" is exactly the pattern KTC's release/pull-out flow (ADR-0024) already implements manually — this is validation that the pattern is correct. The digital planning pre-shift model (plans made offsite in advance, synced to onsite team) is what the Pillar 2 move-logger should enable.

**Source.** Kaleris.com press release, July 8 2024. Confidence: high — official vendor release from a live deployment.

---

## 11. Key Gaps Not Covered Here

The following TOS domains were not scraped in depth in this session — prioritize for the next research pass when O3 is active:

1. **Vessel / berth planning specifics** — specifically how small terminals handle pre-arrival BAPLIE ingestion and manual bay planning without a full vessel autostow module. (Landscape doc §B2 covers the entities; what's missing: practical procedures for a 1-2 berth terminal.)
2. **Specific Philippines VASP names and APIs** — which VASPs are BOC-accredited at Davao Port, what data formats they accept from terminal operators.
3. **EIR format standards** — the physical/digital form of an Equipment Interchange Receipt at Philippines terminals; no open standard was found; may be PPA or industry-specific.
4. **Reefer plug/power infrastructure** — how power monitoring for in-yard reefer racks feeds the billing system. Vendor-specific (Emerson, Stulz, Thermo King systems).
5. **IICL 5th edition online access** — the actual repair code tables are behind IICL membership/purchase. The open version is ISO 9897 (the EDI code mapping).

---

## Sources

| Source | URL | Date | Signal quality |
|---|---|---|---|
| Springer — OCR gate optimization (GA-NN) | https://link.springer.com/article/10.1007/s42452-025-07289-3 | July 2025 | High — peer-reviewed, open access |
| Kaleris — SLS Bucharest Octopi live | https://kaleris.com/news/sls-bucharest-intermodal-terminal-goes-live-with-navis-octopi-by-kaleris/ | July 2024 | High — official vendor, live deployment |
| SNTReefer — Reefer PTI guide | https://www.sntreefer.com/en/reefer-pti-guide/ | May 2026 | High — technical practitioner guide, recent |
| World Bank — Port Community Systems report | https://thedocs.worldbank.org/en/doc/68e8007a36a64995a1d299069ffd7852-0430012023/original/Port-Community-System-Conference-Edition.pdf | 2023 | High — primary multilateral research |
| Seaboard Marine — Demurrage & Detention tariff | https://www.seaboardmarine.com/demurrage-detention/ | Nov 2024 | High — authoritative carrier tariff document |
| loadmaster.ai — Yard planning for small terminals | https://loadmaster.ai/yard-planning-software-for-small-inland-container-terminals/ | 2025/2026 | Medium — industry vendor blog, well-cited |
| PMC — Container repair/maintenance decision model | https://pmc.ncbi.nlm.nih.gov/articles/PMC7581502/ | 2020 | High — peer-reviewed |
| BOC customs.gov.ph — MCT MOA (June 2026) | https://customs.gov.ph/boc-gains-dedicated-facility-to-enhance-customs-operations-at-mindanao-container-terminal/ | June 2026 | High — official Philippine government |
| Scribd — BOC CMO draft on e-manifest/VASP | https://www.scribd.com/document/214359480/Draft-Bureau-of-Customs-memo-on-submission-of-e-manifest | ~2013 (rules still in force) | High — official BOC document (note: draft/older; verify current CMO number) |
| pier2pier.com — ISO 6346 guide | https://www.pier2pier.com/blog/iso-6346-container-codes-guide/ | 2025 | Medium — logistics industry blog, technically accurate |
| BIC — Check digit calculator | https://www.bic-code.org/check-digit-calculator/ | Current | High — authoritative (BIC is the ISO 6346 registrar) |
| UNESCAP — PCS interoperability webinar | https://www.unescap.org/events/2025/webinar-interoperability-port-community-systems-towards-paperless-maritime-trade | 2025 | Medium — event notice, limited content scraped |
| SCMR — Navis acquires Octopi | https://www.scmr.com/article/navis_acquires_octopi_terminal_operating_system_for_small_container_and_mix | March 2019 | High — confirming acquisition |
| Envision ESL — Next-gen TOS blog | https://www.envisionesl.com/blog/next-generation-container-terminal-operating-systems | 2025/2026 | Medium — vendor marketing blog |

---

*See also: `docs/research/navis-tos-landscape-2026-06-13.md` (the complementary product-family and module-map brief). The two documents together form the domain research foundation for O3 (KR1: gating ADR on KTC's current TOS). ADR-0015 (`docs/adr/0015-modular-terminal-depot-operating-system-north-star.md`) is the architectural decision this research supports.*
