# Smoke Test ST02 — Customer Lifecycle (KTC Online Portal)

**Smoke Test ID:** ST02
**Date:** 2026-06-10 (refreshed)
**Status:** READY TO EXECUTE — server guardrails verified; browser lanes manual
**Target:** https://portal.ktcterminal.com
**Format:** Canonical (see `docs/smoke-test-template-canonical.md`)

## Purpose

Verify the current end-to-end customer lifecycle: register (one consent tick + contact number) → **confirm email → /confirmed → sign in with password** → portal as *pending* → **/verify-id** (attach → view/remove → submit) → admin **view/download → approve** (blocked without an ID) → **approved popup**, ID **deleted** (DPA), held orders **released** as `JO-000001`. Plus: rejection/resubmit (3 outcomes), caps (10 held / 10 open), 48h TTL, idle logout, customer profile + history. Covers migrations `0014`–`0027`.

## Preflight — ✅ PASS (2026-06-10)

| Check | Expected | Result |
|---|---|---|
| `npm run lint` / `npm run build` | clean | ✅ |
| Deploy `HEAD /` | 200 | ✅ |
| Migrations tracked | 27 (… `0027_admin_delete_valid_ids`) | ✅ |
| Accounts | owner + Jen (approved); 0 job orders | ✅ |

## Lane G — Server guardrails (automated, ✅ verified earlier)
Held order → no number; approve → released + `JO-000001`; held cap 10; open cap 10; completed frees a slot; reject/suspend handling; concurrent numbering distinct; rename integrity (customers); resubmit guard (rejected→pending only). 

---

## Lane A — Full lifecycle (register → confirm → sign in → verify → approve)

**Start:** logged out at `/login`. Use a throwaway email you control.

| ID | Step | Expected | Result |
|---|---|---|---|
| A-1 | Register: full name + **contact number** + email + password; scroll the **inline agreement** to the end; tick the **single consent** box; CAPTCHA; **Sign up** | Top **green banner**: "✓ Account created! …confirm your email, then log in again." Form flips to Sign in. `customers` row `status=pending`, `contact_number` set, **BR-000001** | |
| A-2 | Open the **branded confirm email** → click **Confirm** | Lands on **`/confirmed`** page: "Email confirmed ✓ — Sign in to continue" | |
| A-3 | Click **Sign in to continue** | Signed out → `/login` with green **"✓ Your email is confirmed — please sign in"** | |
| A-4 | Sign in with **email + password** | Lands in the portal (pending). Breadcrumb **Home**; banner **"PENDING FINAL VERIFICATION"** with **"Upload your valid ID →"** button | |
| A-5 | Click **Upload your valid ID →** | Goes to **`/verify-id`** | |
| A-6 | Tick consent → **attach** a file | File shows as a chip 📎 with **View** / **Remove**; **View** opens a modal preview; nothing uploaded yet | |
| A-7 | Click **Submit valid ID for verification** | Uploads; records Terms/DPA timestamps; redirected to portal; banner now "awaiting verification" (+ customer-service email/phone) | |
| A-8 | File a **held** job order (`/job-order`) | Saves as held; My Job Orders shows **"Draft (no number yet)"** + "Pending approval" | |
| A-9 | Sign in as **owner** → `/admin/approvals` | Card shows email + **contact number** + badges (✓ Email confirmed · ✓ Valid ID on file · ✓ Terms & DPA). **Approve is disabled** if no ID | |
| A-10 | **View** and **Download** the ID | Opens / downloads via signed URL | |
| A-11 | **Approve** | **"✓ Account approved"** popup ("notified by email, ID removed"). Approval email sent | |
| A-12 | Check Storage `valid-ids` | The customer's ID file is **gone** (deleted on approval) | |
| A-13 | Customer re-logs in → My Job Orders | The held order is now **`JO-000001`** / Submitted | |
| A-14 | `/admin/customers` → click the customer's name | **Profile page** (breadcrumb Dashboard › Customers › Name): details + badges (**✓ ID verified**, since deleted) + **Job order history** showing `JO-000001` | |

---

## Lane B — Rejection / resubmit (3 outcomes)

| ID | Step | Expected | Result |
|---|---|---|---|
| B-1 | On a pending customer, **Reject** → choose **"ID unreadable"** or **"Needs updated info"** | status `rejected`; ID kept | |
| B-2 | That customer logs in | Gentle **"ACTION NEEDED → Resubmit your details"** panel (no harsh "rejected"); shows "What to update"; can edit name/contact + re-upload ID | |
| B-3 | Edit + **Resubmit for review** | Back to `status=pending`, reappears in admin queue | |
| B-4 | Reject → **Suspend** | Terminal "Account suspended — contact customer service" screen (email/phone); held orders cancelled | |

## Lane C — Caps & limits
- C-1: pending customer can't exceed **10 held**; C-2: approved can't exceed **10 open** ("contact KTC admin"); C-3: idle **10 min** → auto-logout with notice.

## Lane D — Gating (URL access)
- Logged out → any protected URL → `/login`. Verified user at `/verify-id` → redirected to `/`. Authenticated at `/login` → redirected to `/`. Non-admin at `/admin/*` → `/`.

---

## Final summary

| Lane | Status | Go/Hold |
|---|---|---|
| Preflight + G | ✅ | Go |
| A — Lifecycle | | |
| B — Reject/resubmit | | |
| C — Caps/idle | | |
| D — Gating | | |

## Cleanup
- Delete the test customer (auth + `customers`); its ID file is auto-deleted on approval (else clear in Storage). Reset `jo_number_seq` / `broker_code_seq` if you want `JO-000001` / `BR-000001` next (only when zero orders).
