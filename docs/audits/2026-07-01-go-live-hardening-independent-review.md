# Go-Live Hardening Independent Review - 2026-07-01

Scope: blind-walkthrough remediation checkpoints shipped on 2026-07-01, ending at commit `830bd2a` and production deployment `ktc-joborderform-6bbtfhqfl`.

## Shipped And Verified

- **Route/menu flicker** - route reflow fade was replaced by a dedicated KTC transition overlay. Local Playwright timing check confirmed the overlay exists immediately after navigation, remains visible at ~0.75s, and clears by ~1.55s.
- **Trusted MFA device** - migration `0236` adds hashed trusted-device tokens and current-session trust. `aal_satisfied()` and `claim_session()` now accept either real aal2 or a valid trusted MFA session. Applied to production and sandbox.
- **Email change flow** - migration `0235` sends ownership confirmation to the new email and a security notice to the old email; the account email is not updated until the new email confirms.
- **Bulletin archive** - migration `0233` adds archive/restore behavior and hides archived posts from the active customer board.
- **Tariff image modal** - migration `0234` adds tariff image storage support; admin can upload up to 5 images, and customers can view published tariffs from the calculator.
- **Lara UI** - launcher uses the owner-provided avatar, edge-pinned drag behavior, compact options, and minimize/close controls.
- **Vessel/admin/customer hardening** - customer/staff/admin vessel views and Show Past behavior were aligned where implemented; admin port tile removed.
- **CIS/request tracking** - filled CIS print mirrors entered data; customer consignee request status/date/remarks are visible in `/requests`.

Verification performed:

- `npm run lint` passed.
- `npm run build` passed against prod ref `mdlnfhyylvapzdubhyic`.
- Production deployment READY: `https://ktc-joborderform-6bbtfhqfl-jlawrenceangs-projects.vercel.app`.
- Production aliases include `https://portal.ktcterminal.com` and `https://ktcterminal.com`.
- Vercel log scan for the deployment window returned no logs.
- DB objects for `0236` verified on both production and sandbox.

## Review Notes / Residual Risk

- **Manual ST08 is still required.** The shipped checks are documented in `docs/smoke-test-08-go-live.md`, but the owner-side blind walkthrough has not been fully executed end to end.
- **Trusted MFA needs real-account confirmation.** Static/build checks prove the contract shape, but the actual owner/admin browser flow should be confirmed in ST08: same browser skips MFA within the trust window; private/new browser still asks.
- **Route transition is intentionally visible.** The new loader blocks interaction while visible and should be judged by the 1-1.5s transition target, not by the old near-instant page fade.
- **Blind-walkthrough list is not closed.** Remaining items still need audit/implementation or explicit deferral, including pending-account restriction edge cases, dark-mode contrast sweep, notification settings relocation, notification clear/hide options, large-image rendering limits, release/pull-out disablement, full rate-calculator tariff logic, tutorial video management, and broader smoke execution.
- **Version label was not bumped.** Runtime still displays `v2.0.11`; provenance for this checkpoint is commit `830bd2a`, deployment `ktc-joborderform-6bbtfhqfl`, and migrations through `0236`.

## Current Workspace Addendum - Batch 2

After the docs checkpoint (`c309cbd`), the working tree now contains an additional front-end hardening batch covering New Job Order filing UX, OAuth/idle/MFA loader recovery, Lara mobile behavior and draft handoff, customer vessel-calendar filtering, and JO detail simplification. These are tracked in ST08 as CUST-37 through CUST-41, OWN-10, DEV-07, and DEV-08.

Review status for this addendum:

- `npm run lint` passed locally.
- No new DB migration is included; supporting JO images reuse `jo-documents` + `add_jo_support`.
- Live browser smoke and deployment verification are still pending for this addendum.
- Screenshot prevention remains limited to practical deterrence (ProtectedDoc watermark/copy/print/save blocks); web browsers cannot fully prevent OS/device screenshots.

## Current Recommendation

Keep ST08 as the only active smoke test. Execute the new July 1 rows first because they cover the latest changed surfaces, then continue the broader all-role lanes. Treat any money invariant, RBAC content leak, or trusted-MFA bypass as a go-live blocker.
