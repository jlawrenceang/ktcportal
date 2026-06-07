---
title: Consignee Accreditation
tags: [workflow, consignees]
type: workflow
---

# 🔄 Consignee Accreditation

How a consignee becomes an approved, accredited target for job orders.

## Steps

1. **Create / import** — admin adds a consignee (name required, code optional/auto) at `/admin/consignees`, or it arrives via CSV import (`scripts/import-consignees.mjs` imported 2,488).
2. **Accreditation details** — admin records **address + TIN** and uploads the **BIR 2303 document** (stored; viewable via signed URL).
3. **Approve** — admin approves. **The 2303 document is required to approve.** Status moves to approved; "approve all pending" exists for bulk.
4. **Usable** — only approved consignees may be selected on job orders.

## Invariants

- Accreditation cannot be approved without name + address + TIN + 2303 (see [[Operational Invariants]]).
- Duplicate codes/names are blocked with friendly `23505` errors.

## Related

- [[Consignees]] · [[Administration]] · [[Job Orders]]
- ADR-0005
