---
title: Consignees Core
tags: [core, consignees, wave-1]
type: core
wave: 1
status: complete
owner: Admin
last_updated: 2026-06-07
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

## Backend surface (key)

- `consignees` table — `id, code, name, status, address, tin, doc_2303_path`
- Code default (migration `0006_consignee_code_default.sql`); name unique (`0007_consignee_name_unique.sql`); approval (`0008`); accreditation docs (`0009`)
- Storage bucket for 2303 documents
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
