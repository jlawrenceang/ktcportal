---
title: Consignees Core
tags: [core, consignees, wave-1]
type: core
wave: 1
status: complete
owner: Admin
last_updated: 2026-06-22
---

# 📦 Consignees Core

> **Maturity:** COMPLETE

## Purpose

The consignee master — admin CRUD, search/pagination over a large list, approval, and accreditation (name + address + TIN + BIR 2303 document). Consignees are the targets brokers select on job orders.

## Runtime routes (key)

- `/admin/consignees` — full admin management (`src/admin/Consignees.tsx`)

## Capabilities

- **Search** — debounced `.or(...)` ilike across name/code.
- **Pagination** — `PAGE = 200`, `.range(...)` (needed: 2,488 rows imported).
- **CRUD** — add (name required; code optional/auto), inline edit (code/name/address/TIN/2303), delete.
- **Duplicate guards** — friendly `23505` mapping (e.g. duplicate code/name).
- **Approval** — status filter, approve/reject, "approve all pending".
- **Accreditation** — address + TIN + 2303 document upload; **2303 required to approve**. View 2303 via signed URL.
- **CSV import** — `parseCsv` + `rowsToConsignees` (detects name/code columns).
- **Customer-requested consignees** (`0132`/`0138`/`0139`) — a customer who can't find their consignee files one via `request_consignee` (name + **address + TIN** required, **BIR 2303** required / 2307 optional). It's created **pending + usable immediately** (file-now; KTC verifies the BIR docs in parallel) and reviewed in this same admin screen: approve / reject / **needs_info** (recoverable — the requester edits & resubmits in-app). Consignee review gate = admin + **CSR** (`review_consignee_requests`). The requester is notified on every verdict.
- **CIS = consignee accreditation** — the Customer Information Sheet (company profile + BIR docs) belongs to the **consignee**, not a broker account (a broker can also be a consignee — one customer pool). `0133` first modeled it on the broker and gated all filing; **`0136` reverted** that. **Print CIS** renders the *filled* sheet from consignee data as a PDF.

## Backend surface (key)

- `consignees` table — `id, code, name, status, address, tin, doc_2303_path` + request cols `doc_2307_path`, `requested_by`, `requested_at`, `note` (review/rejection reason). `status` ∈ `pending · approved · rejected · needs_info` (`0138`).
- Code default (migration `0006_consignee_code_default.sql`); name unique (`0007_consignee_name_unique.sql`); approval (`0008`); accreditation docs (`0009`); customer requests + needs-info loop (`0132`/`0138`/`0139`); relaxed approval (`0120`)
- RPCs: `request_consignee`, plus the admin approve/reject/needs-info path
- Storage bucket for 2303 / 2307 documents
- 2,488 consignees imported from `Customer.csv` via `scripts/import-consignees.mjs`

## Done

- Full CRUD, search, pagination, approval workflow, accreditation fields + 2303 upload/view, duplicate guards, CSV import.

## Partial / open

- 2,488 imported consignees start un-accredited — processed over time.
- Per-broker accredited-consignee assignment (which consignees a broker may use) — see [[Pending Items]].

## Related

- [[Job Orders]] · [[Administration]]
- [[Consignee Accreditation]] — workflow
- ADR-0005
