# Smoke Test ST05 - CLOSED LEGACY

**Smoke Test ID:** ST05
**Date:** 2026-06-21
**Status:** CLOSED / LEGACY - do not execute for current go-live

ST05 is retained only as a historical pointer. It predates the ADR-0035 operations overhaul, the ADR-0037 billing cutover, and the v2.0.11 Android staff-app lane. It described retired behavior such as pending customers filing held Job Orders, `/job-order/:id/pay`, `/admin/cashier`, `/app/cashier`, and JO supplement payment loops.

## Current Smoke Sources

- **Current go-live script:** `docs/smoke-test-08-go-live.md` for v2.0.11+ / migration 0236, including Android Part 15 and the July 1 hardening rows.
- **Billing cutover proof:** `docs/smoke-test-06-portal.md (closed legacy)` for ADR-0037 charges/payment-orders.
- **Adversarial/load reference:** `docs/smoke-test-07-portal.md (closed legacy)`.
- **Release deep dive:** `docs/smoke-test-04-portal.md`.

Production is the runtime contract. Sandbox mirrors the same migrations/schema/functions for test execution, with separate env vars, secrets, and seed data.
