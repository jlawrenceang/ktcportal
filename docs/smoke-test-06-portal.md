# Smoke Test ST06 - CLOSED LEGACY

**Smoke Test ID:** ST06
**Status:** CLOSED / LEGACY - do not execute for current go-live

ST06 proved the ADR-0037 billing cutover from the v2.0.0 period. It is no longer the active smoke test and must not be used as the current execution script.

## Current Smoke Sources

- **Active/current smoke:** `docs/smoke-test-08-go-live.md`.
- **Compatibility pointer:** `docs/go-live-smoke-test.md`.
- **Historical purpose of ST06:** ADR-0037 charges/payment-orders cutover proof.

Production is the runtime contract. Sandbox mirrors the same migrations/schema/functions for test execution, with separate env vars, secrets, and seed data.
