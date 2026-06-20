# KTC Online Portal — Admin Guide

For KTC admin staff and the owner. Covers the full back office: verifying customers, processing job orders, payments and invoices, filing on behalf, configuration, and the security model. (Cashier and checker stations have their own shorter guides.)

---

## 1 · Dashboard

The landing page shows live counts — pending approvals, the open job-order queue, customers — and each tile links to its page. Staff accounts are not counted as customers.

## 2 · Verifying customers (Approvals)

- Each card shows the registrant's details with badges: **✓ Email confirmed · ✓ Valid ID on file · ✓ Terms & DPA accepted**.
- **View / Download** the uploaded ID (signed link). **Approve is disabled until an ID is on file.**
- **Approve** → the customer is emailed, and any job orders they filed while waiting are released into the queue with real JO numbers.
- **Reject** offers two paths: *recoverable* (ID unreadable / needs updated info — the customer sees a gentle "resubmit your details" panel and can fix + re-upload) or **Suspend** (terminal; their held orders are cancelled).
- Unverified accounts that confirm email but upload no ID within **48 hours** are auto-rejected (hourly job).

### ID retention

Uploaded IDs are kept a guaranteed **24 hours** (review window — deletion is blocked), can be deleted manually from the file viewer (Delete) between 24 hours and 3 days, and are **auto-purged at 3 days**. Approving does not delete the file immediately.

## 3 · Processing job orders

The **Job Orders** queue shows live orders (held drafts from unverified accounts are excluded).

- **Per-service completion:** tick ✓ on each service line as it's done. The first ✓ moves the order to *processing*; it completes only when **all** lines are done.
- **Hold for info** (with a note): the customer sees the note, responds and resubmits in-app — **keeping their serving number**. Their reply is shown on the card.
- **Reject** (with a note): recoverable rejections let the customer fix and refile — they rejoin at the **back of the line**; **↩ Restore #N** gives the original number back when justified.
- **History** on every card: filed / status changes / service-done events with actor names and timestamps.
- **Serving numbers** are per service line, reset weekly (Monday 00:15 carry-over re-queues open orders at the front, in order). Cancel/reject vacates a number (burned, not reused).

## 4 · Payments and invoices

- **Payment proofs:** orders with an uploaded deposit slip show "Payment proof to review". Open the slip (viewer offers Print / Save), then **Confirm** or **Reject with a note** — the customer is emailed either way and can re-upload.
- **Recording the Service Invoice** (issued by the ERP, only once paid): enter **both** numbers — the control no. (OR-INV-… / BI-INV-…) and the **printed pad serial** (leading zeros kept). OR = **PAID**, BI = **BILLED** (credit). Both are validated, saved atomically, and logged.
- **Unpaid · completed** view: completed orders without an invoice, with aging chips (*unpaid 3d*).
- **Archive paid & completed** (or the Monday cron) moves finished, invoiced orders out of the default views; customer history is unaffected.

## 5 · Filing on behalf (New JO)

For walk-ins: **New JO** files a job order for any customer — it goes **straight to submitted** with a serving number, the success panel offers the printable slip, and History records you as the filer.

## 6 · Customers & consignees

- **Customers:** the master list (search, status, badges). Click a name for the profile — details, verification badges, and full job-order history.
- **Consignees:** the master list used by the JO form's typeahead (any customer may pick any consignee — current policy).

## 7 · Settings

- **Service rates & fees:** locked by default — tap "Locked — unlock to edit". Per-service rates (₱, per container, VATable flag), flat admin and print fees. **VAT is fixed at the statutory 12%** (server-guarded). Drag rows (⠿) to set the display order everywhere. Saving re-locks.
- **Service catalogue:** add a service (name + VATable — names are permanent, deactivate instead of rename), toggle active/inactive (inactive = hidden from new filings; existing orders keep their label and pricing), ✕ delete only if never used.
- **Payment details:** bank name / account / GCash and the QR image shown on the customer payment page. Blank fields are hidden.
- **Staff accounts:** create cashier / checker logins (username + password, no email), reset passwords, and edit the **role-gate matrix** — what each role can see and do. Gates are enforced server-side.

## 8 · Logs & system health

- **Logs:** four views — Job orders (full audit trail), **Security** (owner-only: blocked escalation attempts, role-gate changes, session evictions), Client errors, Emails & sync (every outbound call with its HTTP result).
- **Settings → System health:** one-click snapshot of every scheduled job's last run, outbound failures, and recent client errors.
- A **watchdog** runs every 15 minutes and emails the owner on real trouble (failed jobs, failed sends, error spikes, escalation attempts).

## 9 · Security model (what protects the portal)

- **Sign-in:** CAPTCHA enforced server-side; email confirmation required; 5 wrong passwords = 60s lockout.
- **2FA (admin + owner):** enroll an authenticator app in the **2FA** tab. Once enrolled, admin rights are inert until the 6-digit code is entered — even for direct API calls.
- **Sessions:** staff time out after **60 idle minutes** ("still there?" prompt one minute early). **One active session per account** — a new login evicts the old one everywhere, instantly (evictions appear in Logs → Security).
- **Tamper protection:** any crafted attempt to self-grant admin/owner/status flips is reverted, **auto-suspends** the account, kills its sessions, and alerts the owner.
- **Owner failsafe:** the owner account is server-only, cannot be locked out or demoted, and is the only one who can create staff or change role gates.

---

*This guide reflects the portal as built — when in doubt, the in-app behavior is authoritative. Suggest corrections to the owner.*
