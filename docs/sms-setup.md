# SMS notifications — setup & activation runbook

**Status: scaffold built + dormant** (2026-06-29). The plumbing ships with the app; **nothing sends a text until a gateway is connected** (the trigger is a silent no-op until the Vault `sms_url`/`sms_secret` rows exist — same safety model as web-push `0114`).

SMS is a 4th notification channel beside in-app + email + web-push. It is **selective**: only high-value customer notifications text the customer (a text is costlier + more intrusive than a push).

## What's built

| Piece | File | Role |
|---|---|---|
| Transport | `supabase/functions/send-sms/index.ts` | POSTs `{ to, message }` to the android-sms-gateway; gated by `x-sms-secret`. |
| Trigger | `supabase/migrations/0193_sms_notifications.sql` | AFTER INSERT on `notifications` → texts the owning customer for whitelisted kinds; **dormant** until Vault armed. Adds `customers.sms_opt_out` + `set_sms_opt_out()` RPC + `ph_e164()` normalizer. |
| Deploy/config | `scripts/setup-sms.mjs` | Deploys the function, sets secrets, writes Vault (arms the trigger). |

**Whitelisted kinds** (edit the `in (...)` list in 0193 to change): `on_hold`, `rejected`, `completed`, `payment_confirmed`, `payment_rejected`, `release_payable`, `release_on_hold`, `release_rejected`, `release_released` — the "you must act" + "it's decided / ready" moments.

## Activation (owner)

1. **Phone gateway** — on a **dedicated Android phone + SIM** (kept charged + online), install **"SMS Gateway for Android"** (sms-gate.app). Pick **Cloud** mode (free relay `https://api.sms-gate.app`, no registration) for the serverless backend; copy its Basic-auth **user/pass**.
2. **`.env.local`** — add `SMS_GATEWAY_USER` + `SMS_GATEWAY_PASS` (and optionally `SMS_GATEWAY_URL`). Ensure a **personal** `SUPABASE_ACCESS_TOKEN` (`sbp_…`) is present (the same token the other Management-API scripts need).
3. **Run** `node scripts/setup-sms.mjs` — deploys + arms the Vault. (Running it *without* the gateway creds is fine: it arms dormant; rerun after adding them to go live.)
4. **Smoke test** — the script prints a `curl` one-liner; send yourself a text.

## Cost / reliability

- **Free software**; you pay only the carrier SMS rate (≈ free on a bundled/unli SIM). One phone = a single point of failure — keep it powered + online; a consumer SIM does tens–low-hundreds/hour before carrier throttling, so this is for **transactional** texts, not blasts.
- **Graduating later** to a managed gateway (Semaphore PH ~₱0.50/SMS with a sender ID, or Twilio) = change `SMS_GATEWAY_*` + the POST body in `send-sms`; the trigger + auth gate are unchanged.

## Deferred to activation (not built yet, on purpose)

- **Customer opt-out toggle** in `/account` — the `sms_opt_out` column + `set_sms_opt_out()` RPC exist and the trigger respects them, but the UI toggle is held back until SMS is live (no point offering to opt out of a dormant channel). Add a "Receive SMS updates" switch to `src/pages/Account.tsx` calling `set_sms_opt_out` when you flip SMS on.
- **Staff SMS** — staff use synthetic `@ktc-staff.local` accounts with no stored mobile; this scaffold is customer-only. Add a staff-phone column + a `staff_notifications` trigger if staff SMS is ever wanted.
