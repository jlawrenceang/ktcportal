---
title: Job Order Submission
tags: [workflow, job-orders]
type: workflow
---

# 🔄 Job Order Submission

How an approved broker submits a Job Order for terminal services.

## Steps

1. **Open** — approved broker goes to `/job-order` (New Job Order).
2. **Select consignee** — choose an **approved** consignee (only approved consignees are valid targets).
3. **Add service requests** — one or more lines from `SERVICE_REQUESTS` (X-ray, DEA exam, OOG stripping, gate/yard requests).
4. **Submit** — `job_orders` header + `job_order_lines` written.
5. **Track** — broker sees it under `/job-orders`; staff process it under `/admin/job-orders`.

## Invariants

- Job orders only target approved consignees.
- Brokers see only their own job orders; admins see all (RLS).

## Open

- Admin-side status/processing workflow on `/admin/job-orders` is maturing.
- Per-broker consignee scoping (show only consignees the broker is accredited for).

## Related

- [[Job Orders]] · [[Brokers]] · [[Consignees]]
