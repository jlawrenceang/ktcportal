# KTC Online Portal — Admin Guide

For KTC admin staff and the owner. Covers the full back office: verifying customers, processing job orders, payments and invoices, filing on behalf, configuration, and the security model. (Cashier and checker stations have their own shorter guides.)

---

## 1 · Dashboard

The landing page shows live counts — pending approvals, the open job-order queue, customers — and each tile links to its page. Staff accounts are not counted as customers.

## 2 · Verifying customers (Approvals)

- Each card shows the registrant's details with badges: **✓ Email confirmed · ✓ Valid ID on file · ✓ Terms & DPA accepted**.
- **View / Download** the uploaded ID (signed link). **Approve is disabled until an ID is on file.**
- **Approve** → the customer is emailed, and any job orders they filed while waiting are released into the queue with real JO numbers.
- **Reject** offers two paths: *recoverable* (ID unreadable / needs updated info — the customer sees a gentle "resubmit your details" panel and can fix + re-upload) or **Suspend** (terminal; their open orders are cancelled).
- Unverified accounts that confirm email but upload no ID within **48 hours** are auto-rejected (hourly job).
- **Cancellation cascades:** **suspending or rejecting a customer** cancels all their open job orders — **except** orders already paid or with an ERP service invoice recorded, which are left in place for manual handling. (Rejecting a **consignee** likewise cancels its open job orders — see Consignees below.)

### ID retention

Uploaded IDs are kept a guaranteed **24 hours** (review window — deletion is blocked), can be deleted manually from the file viewer (Delete) between 24 hours and 3 days, and are **auto-purged at 3 days**. Approving does not delete the file immediately.

## 3 · Processing job orders

The **Job Orders** queue shows live orders (held drafts from unverified accounts are excluded).

- **Cards / List toggle:** switch between **Cards** (rich, action-heavy) and a compact **List** view; your choice is remembered. In Cards view the many per-order actions are tucked behind a **⋯ Actions** menu.
- **Per-service completion:** tick ✓ on each service line as it's done. The first ✓ moves the order to *processing*; it completes only when **all** lines are done.
- **Hold for info** (field-targeted): tick exactly which fields the customer must re-enter — **Consignee · Entry number · Vessel & Voyage · Containers** — and add a note. Only the ticked fields unlock for the customer; everything else stays locked. Their reply is shown on the card.
- **Reject is final:** rejecting a job order is terminal — the customer **cannot** resubmit it (they file a new one). Use **Hold for info** for anything fixable.
- **One payment pill:** each card shows a single **"Balance to pay" / "Paid"** indicator covering base + RPS + every additional charge (no separate payment chips). A "payment proof to review" cue and the ERP service-invoice chip remain.
- **Additional charges:** when adding a charge, pick from the seeded **charge types** (managed in **Settings → Additional charge types**) — the amount pre-fills but stays editable — or choose **"Other…"** for a one-off.
- **History** on every card: filed / status changes / service-done events with actor names and timestamps.
- **Serving numbers** are per service line, reset weekly (Monday 00:15 carry-over re-queues open orders at the front, in order). Cancel/reject vacates a number (burned, not reused).

### Priority lane

An **admin-approved priority lane** is the only way to move an order ahead of the regular X-ray line (the old manual "restore number" is retired):

- **Request priority** (admin / operations / CSR) on an order → it shows **Priority requested**.
- **Approve** or **Deny priority** (admin only). Once approved it gets a **P-… serving number** and is served before the regular queue (the X-ray Checker sorts the priority lane first).

### Re-X-ray

When a container must be X-rayed again after its order completed:

- **Request re-X-ray** (admin / operations / checker) on a **completed** order → creates a **suffixed child order** (e.g. `JO-000001A`) that awaits approval.
- **Approve** or **Deny re-X-ray** (admin only). Approved, the child enters the X-ray queue with an **R-… serving number**; it is **free or chargeable** per KTC's decision — a free re-X-ray carries no balance. Until approved it sits out of the checker queue (it can't be confirmed yet).

## 4 · Payments and invoices

- **Payment proofs:** orders with an uploaded deposit slip show "Payment proof to review". Open the slip (viewer offers Print / Save), then **Confirm** or **Reject with a note** — the customer is emailed either way and can re-upload.
- **Recording the Service Invoice** (issued by the ERP, only once paid): enter **both** numbers — the control no. (OR-INV-… / BI-INV-…) and the **printed pad serial** (leading zeros kept). OR = **PAID**, BI = **BILLED** (credit). Both are validated, saved atomically, and logged.
- **Unpaid · completed** view: completed orders without an invoice, with aging chips (*unpaid 3d*).
- **Archive paid & completed** (or the Monday cron) moves finished, invoiced orders out of the default views; customer history is unaffected.

## 5 · Release / Pull-out (container withdrawal)

The **Releases** desk handles container pull-out requests — **separate from job orders**, cash-only at launch — with a clear separation of duties:

1. **A customer files** a release (BL number + a DO/BL document). It arrives **Submitted**.
2. **Verify documents** (documents desk — `verify_release_docs`): check the DO/BL, then mark **Documents verified**.
3. **Set the charge** and **attach the bill / SOA** so the customer sees it before paying. A wrong charge can be **corrected or removed while it's unpaid** (a paid charge is locked); extra charges can be added the same way.
4. **The customer pays** (uploads proof) → **Confirm the payment** (cashier — `review_payments`).
5. **Record the OR** (ERP control no., OR-INV-…) → the container is **Released**.

- **Notifications fire at each step** to the customer and to the right desk (documents / cashier).
- **Cancelling** is allowed while a release is open; suspending or rejecting a customer also **cancels their open releases** (except paid/released ones, or any carrying a confirmed extra charge).
- Statuses: **Submitted → Documents verified → Ready for payment → Paid → Released**, plus **On hold** and **Cancelled**.

## 6 · Filing on behalf (New JO)

For walk-ins: **New JO** files a job order for any customer — it goes **straight to submitted** with a serving number, the success panel offers the printable slip, and History records you as the filer.

## 7 · Customers & consignees

- **Customers:** the master list (search, status, badges). Click a name for the profile — details, verification badges, and full job-order history.
- **Consignees:** the master list used by the JO form's typeahead (any customer may pick any consignee — current policy). **Rejecting a consignee** cancels its open job orders, with the reason shown to the affected customers.

## 8 · Settings

- **Service rates & fees:** locked by default — tap "Locked — unlock to edit". Per-service rates (₱, per container, VATable flag) plus one flat **Admin & print fee** (the former separate admin fee and print fee are now combined). **VAT is fixed at the statutory 12%** (server-guarded). Drag rows (⠿) to set the display order everywhere. Saving re-locks.
- **Terminal tariff (per-service):** for each service, tick which conditions its rate varies by — **origin / size / fill / kind**, or none for a **uniform** rate. The editor then shows only the inputs you ticked, so a uniform service is a single cell while a fully-varied one expands into its matrix.
- **Storage:** edited on its own. **Domestic** = a flat per-day rate by size. **Foreign** = progressive per-day **bands** (Import / Export / Transhipment × size); the bands are charged **cumulatively** once the line's free days are used up.
- **Trade terminology:** **foreign** cargo is **Import / Export / Transhipment**; **domestic** is **Inbound / Outbound** — shown throughout with a colour-coded Foreign / Domestic pill.
- **Service catalogue:** add a service (name + VATable — names are permanent, deactivate instead of rename), toggle active/inactive (inactive = hidden from new filings; existing orders keep their label and pricing), ✕ delete only if never used.
- **Additional charge types:** the seeded list the cashier/admin pick from when adding a charge to an order (each with a default amount that pre-fills but stays editable). "Other…" on the order itself always allows a one-off charge.
- **Payment details:** bank name / account / GCash and the QR image shown on the customer payment page. Blank fields are hidden.
- **Staff accounts:** create cashier / checker logins (username + password, no email), reset passwords, and edit the **role-gate matrix** — what each role can see and do. Gates are enforced server-side.

## 9 · Logs & system health

- **Logs:** four views — Job orders (full audit trail), **Security** (owner-only: blocked escalation attempts, role-gate changes, session evictions), Client errors, Emails & sync (every outbound call with its HTTP result).
- **Settings → System health:** one-click snapshot of every scheduled job's last run, outbound failures, and recent client errors.
- A **watchdog** runs every 15 minutes and emails the owner on real trouble (failed jobs, failed sends, error spikes, escalation attempts).

## 10 · Security model (what protects the portal)

- **Sign-in:** CAPTCHA enforced server-side; email confirmation required; 5 wrong passwords = 60s lockout.
- **2FA (admin + owner):** enroll an authenticator app in the **2FA** tab. Once enrolled, admin rights are inert until the 6-digit code is entered — even for direct API calls.
- **Sessions:** staff time out after **60 idle minutes** ("still there?" prompt one minute early). **One active session per account** — a new login evicts the old one everywhere, instantly (evictions appear in Logs → Security).
- **Tamper protection:** any crafted attempt to self-grant admin/owner/status flips is reverted, **auto-suspends** the account, kills its sessions, and alerts the owner.
- **Owner failsafe:** the owner account is server-only, cannot be locked out or demoted, and is the only one who can create staff or change role gates.

---

*This guide reflects the portal as built — when in doubt, the in-app behavior is authoritative. Suggest corrections to the owner.*
