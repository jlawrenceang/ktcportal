# Canonical Manual Smoke Test Template — Route / Click / Backend Contract

**Smoke Test ID:** ST__
**Date:** YYYY-MM-DD
**Status:** DRAFT / READY / IN EXECUTION / COMPLETE
**Target:** (e.g. https://portal.ktcterminal.com or local dev)
**Format Status:** **CANONICAL** — required for all future KTC smoke tests.

## Standing rule

Do not write future smoke tests as step-only checklists. Every smoke test must include: preflight gate, lane, route, objective, start state / preconditions, click-by-click contract table, route closure, lane closeout, defects tracker, and a final go / no-go.

## Result codes

| Code | Meaning |
|---|---|
| PASS | Frontend, backend, and side effects matched |
| AMBER | Main action worked but a side effect / refresh / secondary UI is wrong |
| FAIL | Frontend/backend mismatch, wrong transition, missing write, or broken click |
| BLOCKED | Cannot continue because prerequisite data / permission / runtime path is missing |
| N/A | Not applicable |

## Contract table template

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

## Preflight gate (run first)

| Check | Command | Expected | Result |
|---|---|---|---|
| TypeScript | `npm run lint` (`tsc --noEmit`) | 0 errors | |
| Build | `npm run build` | PASS | |
| Deploy health | `curl -s -o /dev/null -w "%{http_code}" https://portal.ktcterminal.com` | 200 | |
| Bundle target | bundle references `mdlnfhyylvapzdubhyic.supabase.co` | KTC project (not jta-sys) | |
| SPA rewrite | `curl … /admin/consignees` | 200 (not 404) | |
| CAPTCHA enforced | tokenless `POST /auth/v1/token` | `captcha_failed` | |

If any preflight check fails, pause and fix first.

## Defects tracker

| ID | Lane / Route / Action | Severity | Issue Summary | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|---|

## Final summary

| Lane | Status | Key Findings | Go / Hold |
|---|---|---|---|

## Reuse rule

Every future smoke test in this repo must keep this same structure. See `docs/agent/testing-and-release.md`.
