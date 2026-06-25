// Formal-English display overrides, keyed by the original English source string.
//
// The English source string is the t() KEY (see i18n.tsx). This map rewrites the
// displayed English into a more FORMAL, professional, courteous register (full
// sentences, no contractions, polite phrasing) WITHOUT changing any component:
// the resolver applies enSimple[key] ?? key in English mode, and uses it as the
// fallback under Tagalog (tl[key] ?? enSimple[key] ?? key). (Name kept as
// 'enSimple' for import stability; it is now the formal-tone layer.)
//
// Rules (must hold for every entry):
//  • The KEY must match the current English source string EXACTLY (a mismatch is a
//    harmless no-op — it simply falls back to the original).
//  • Every {placeholder} in the key must appear, spelled identically, in the value.
//  • Keep industry/UI terms in English (Job Order, container, X-ray, DEA, OOG,
//    consignee, voyage, vessel, RPS, VAT, OR, invoice, payment, upload, password,
//    account, etc.). Keep any leading glyphs (✓ ↻ ← → +) and trailing spaces.
//  • Only add an entry when the formal English actually differs — otherwise omit it.

export const enSimple: Record<string, string> = {
  "Attach the BIR 2303 (Certificate of Registration).":
    "Please attach the BIR 2303 (Certificate of Registration).",
  "Could not submit the request.":
    "The request could not be submitted.",
  "Enter the vessel name.":
    "Please enter the vessel name.",
  "Could not resubmit.":
    "The request could not be resubmitted.",
  "New consignee — pending KTC approval. You can still file; KTC will verify it.":
    "This is a new consignee and is pending KTC approval. You may still file your order, and KTC will verify it.",
  "Can’t find your vessel? Contact KTC customer service to have it added to the schedule.":
    "Cannot find your vessel? Please contact KTC customer service to have it added to the schedule.",
  "Approve all {n} pending consignees? They become visible to customers in job orders. You can still edit details afterwards.":
    "Approve all {n} pending consignees? They will become visible to customers in job orders. You may still edit the details afterwards.",
  "Add a note for the customer explaining what’s needed.":
    "Please add a note for the customer explaining what is needed.",
  "Add a note for the customer.":
    "Please add a note for the customer.",
  "Add a reason.":
    "Please add a reason.",
  "Reason for rejecting (shown to the customer):":
    "Reason for rejection (shown to the customer):",
  "Ask the customer for more info — what’s needed:":
    "Please request more information from the customer — what is needed:",
  "Ask the customer for more info on “{name}” — what’s needed:":
    "Please request more information from the customer on “{name}” — what is needed:",
  "Asked the customer for more info.":
    "Requested more information from the customer.",
  "Sets your trade route, charges and the storage Last Free Day.":
    "Sets your trade route, charges, and the storage Last Free Day.",
  "Pick a shipping line":
    "Please select a shipping line.",
  "Pick a vessel to enable storage (counts from its Last Free Day).":
    "Please select a vessel to enable storage (counted from its Last Free Day).",
  "Add a row per container type — rates differ by size, empty/full and dry/reefer.":
    "Please add a row per container type — rates differ by size, empty or full, and dry or reefer.",
  "Optional — add the ones your order needs.":
    "Optional — please add the ones your order needs.",
  "Some rates aren’t set yet — ask KTC, or check Settings if you’re staff. Lines marked “—” aren’t in this estimate.":
    "Some rates are not set yet — please contact KTC, or check Settings if you are staff. Lines marked “—” are not included in this estimate.",
  "Add at least one container (set a quantity), then tap Generate estimate.":
    "Please add at least one container (set a quantity), then tap Generate estimate.",
  "Billed per hour (minimum {h} hours). A refundable cash bond of {amt} per van is required — returned 7–10 working days after withdrawal.":
    "Billed per hour (minimum {h} hours). A refundable cash bond of {amt} per van is required, returned 7–10 working days after withdrawal.",
  "Select a shipping line and vessel & voyage first — charges are estimated against the vessel’s call.":
    "Please select a shipping line and a vessel and voyage first — charges are estimated against the vessel’s call.",
  "No ancillary services configured yet.":
    "No ancillary services are configured yet.",
  " — re-upload to replace":
    " — please re-upload to replace",
  " Note: their valid ID could not be deleted — see the warning on the page.":
    " Note: their valid ID could not be deleted — please see the warning on the page.",
  "— a stolen password alone can't reach any staff function.":
    "— a stolen password alone cannot reach any staff function.",
  "(customer can’t resubmit)":
    "(the customer cannot resubmit)",
  "✓ A confirmation link was sent to {next}. Click it to finish the change — your current email stays active until you confirm.":
    "✓ A confirmation link has been sent to {next}. Please click it to complete the change. Your current email remains active until you confirm.",
  "✓ Account created! We’ve emailed a confirmation link to your address. Please confirm your email, then log in again here to continue.":
    "✓ Your account has been created. A confirmation link has been emailed to your address. Please confirm your email, then sign in again here to continue.",
  "✓ Confirmation email resent — check your inbox (and spam folder) for the link.":
    "✓ The confirmation email has been resent. Please check your inbox, including the spam folder, for the link.",
  "✓ Gates saved. Staff see the change on their next page load.":
    "✓ Gates saved. Staff will see the change on their next page load.",
  "✓ If that email is registered, a password-reset link is on its way. Check your inbox (and spam folder).":
    "✓ If that email is registered, a password-reset link is on its way. Please check your inbox, including the spam folder.",
  "✓ Thanks for reading — you can now check the consent boxes below.":
    "✓ Thank you for reading. You may now check the consent boxes below.",
  "✓ Two-factor authentication is ON. From now on, signing in asks for a code from your app.":
    "✓ Two-factor authentication is now ON. Signing in will require a code from your authenticator app.",
  "✓ Your email is confirmed — please sign in to continue.":
    "✓ Your email has been confirmed. Please sign in to continue.",
  "✓ Your password has been updated — please sign in with your new password.":
    "✓ Your password has been updated. Please sign in with your new password.",
  "A KTC admin is verifying your account. You can continue filing job orders, but they’re held until you’re verified. For more information, contact customer service at":
    "A KTC admin is verifying your account. You may continue filing job orders, but they will be held until you are verified. For more information, please contact customer service at",
  "A valid ID is required before you can approve":
    "A valid ID is required before you can approve.",
  "A KTC admin is verifying your account. Orders stay held until you’re verified.":
    "A KTC admin is verifying your account. Your orders will be held until you are verified.",
  "Add each container number and the service it needs — or Bulk paste a whole list at once. Then submit; you'll get a serving number per service line.":
    "Add each container number and the service it needs, or use Bulk paste to add a whole list at once. Then submit, and you will receive a serving number per service line.",
  "Adds a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password…) to your sign-in. Once enabled it's enforced":
    "Adds a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password…) to your sign-in. Once enabled, it is always required",
  "All registered customer accounts and their status. Approve/reject pending ones under Approvals; suspend or reactivate approved accounts here.":
    "All registered customer accounts and their status. Please approve or reject pending accounts under Approvals; suspend or reactivate approved accounts here.",
  "and you’ll re-upload a valid ID for a KTC admin to re-verify. Job orders you file in the meantime are held until you’re re-approved.":
    "and you will re-upload a valid ID for a KTC admin to re-verify. Job orders you file in the meantime will be held until you are re-approved.",
  "Archives every completed order that has a Service Invoice number (= paid). Also runs automatically every Monday.":
    "Archives every completed order that has a Service Invoice number (= paid). This also runs automatically every Monday.",
  "Bank account + QRPH QR shown when a customer pays online. Online payments (GCash / Maya / banks) all route through the QR. Leave fields blank to hide them.":
    "Bank account and QRPH QR shown when a customer pays online. All online payments (GCash / Maya / banks) are routed through the QR. Please leave fields blank to hide them.",
  "before it can be approved; only approved consignees are visible to customers.":
    "before it can be approved. Only approved consignees are visible to customers.",
  "can’t be processed until you pass final verification":
    "cannot be processed until you pass final verification",
  "Can’t be processed until you pass final verification — upload your valid ID, then a KTC admin verifies your account and it’s sent automatically.":
    "Cannot be processed until you pass final verification. Please upload your valid ID, after which a KTC admin will verify your account and it will be sent automatically.",
  "Can't scan? Enter this key manually:":
    "Unable to scan? Please enter this key manually:",
  "Cancel this order? This can’t be undone.":
    "Cancel this order? This action cannot be undone.",
  "Cannot approve — no valid ID on file yet. Ask the customer to upload one first.":
    "Cannot approve — no valid ID is on file yet. Please ask the customer to upload one first.",
  "Choose a clear photo or PDF — you can review it before submitting.":
    "Please choose a clear photo or PDF. You may review it before submitting.",
  "Choose a new password for your account.":
    "Please choose a new password for your account.",
  "Choose an outcome (the customer is told why):":
    "Please choose an outcome (the customer is told why):",
  "Choose the vessel & voyage from the current schedule. Not listed yet? Tick \"vessel not listed\" and type it — operations will match it to the call.":
    "Please select the vessel and voyage from the current schedule. If it is not listed yet, tick \"vessel not listed\" and type it — operations will match it to the call.",
  "Confirm completed X-rays · look up a van's clearance before release.":
    "Confirm completed X-rays and look up a van's clearance before release.",
  "Consignees added but not yet approved. Tap to review and approve them so they're selectable when customers file.":
    "Consignees added but not yet approved. Tap to review and approve them so they are selectable when customers file.",
  "Contact number can’t be empty.":
    "Contact number cannot be empty.",
  "Copies the message and opens Viber's forward screen — pick the customer's chat (paste if the text doesn't carry over)":
    "Copies the message and opens Viber's forward screen. Please select the customer's chat, and paste the text if it does not carry over.",
  "Could not create job order.":
    "The job order could not be created.",
  "Could not generate the snapshot.":
    "The snapshot could not be generated.",
  "Could not load the file. Please try again.":
    "The file could not be loaded. Please try again.",
  "Could not open the file.":
    "The file could not be opened.",
  "Could not start enrollment.":
    "Enrollment could not be started.",
  "Could not start the check.":
    "The check could not be started.",
  "Could not start the verification.":
    "The verification could not be started.",
  "Current vessel calls at KTC. Last free day is the last day of free storage (finish discharging + the line's free-days); after it, storage charges apply. Schedule is maintained by KTC operations — for reference only.":
    "Current vessel calls at KTC. Last Free Day is the last day of free storage (finish discharging plus the line's free days); after it, storage charges apply. The schedule is maintained by KTC operations for reference only.",
  "PDF preview isn’t supported on this device. Open it in your browser’s viewer to read, print or share it.":
    "PDF preview is not supported on this device. Please open it in your browser's viewer to read, print, or share it.",
  "Dates must be YYYY-MM-DD or M/D/YYYY.":
    "Dates must be in YYYY-MM-DD or M/D/YYYY format.",
  "Days since completion without a Service Invoice on file":
    "Days since completion without a Service Invoice on file.",
  "Delete (only possible while unused by any order)":
    "Delete (available only while unused by any order)",
  "Don't have an account? ":
    "Do not have an account? ",
  "Each line becomes a container row with the selected service — you can change any row's service afterward. Duplicates are skipped.":
    "Each line becomes a container row with the selected service. You may change any row's service afterward. Duplicates are skipped.",
  "Edit or update your personal details anytime. Changing your legal name needs re-verification by a KTC admin (since it's matched to your ID).":
    "You may edit or update your personal details at any time. Changing your legal name requires re-verification by a KTC admin, since it is matched to your ID.",
  "Email of a signed-up user":
    "Email of a registered user",
  "Enter container counts to see the breakdown.":
    "Please enter container counts to see the breakdown.",
  "Enter the 6-digit code from your authenticator app to finish signing in.":
    "Please enter the 6-digit code from your authenticator app to finish signing in.",
  "Enter the new email address.":
    "Please enter the new email address.",
  "Enter the service name first.":
    "Please enter the service name first.",
  "Enter the shipping line name first.":
    "Please enter the shipping line name first.",
  "Enter the Entry Number (C-…).":
    "Please enter the Entry Number (C-…).",
  "Enter the vessel name and voyage number.":
    "Please enter the vessel name and voyage number.",
  "Enter your account email and we’ll send you a link to set a new password.":
    "Please enter your account email, and we will send you a link to set a new password.",
  "Enter your email above first, then resend.":
    "Please enter your email above first, then resend.",
  "Estimate your charges before filing — enter how many containers need each service. The official amount is confirmed on the Service Invoice at the KTC office.":
    "Estimate your charges before filing by entering how many containers need each service. The official amount is confirmed on the Service Invoice at the KTC office.",
  "Every order you file shows here with its live status and serving number. Open one to \"View charges & pay\" (upload your deposit slip) and to Print the A6 slip once it's approved. The \"Now serving\" board up top helps you time your trip to the terminal.":
    "Every order you file appears here with its live status and serving number. Open one to view charges and pay (upload your deposit slip), and to print the A6 slip once it is approved. The \"Now serving\" board above helps you time your trip to the terminal.",
  "Everything the portal records — who did what, and when.":
    "Everything the portal records: who did what, and when.",
  "File Job Orders for container terminal services from anywhere, anytime. No more queueing at the office. Here's a quick look around.":
    "File Job Orders for container terminal services from anywhere, anytime. There is no need to queue at the office. Here is a quick look around.",
  "File for container terminal services.":
    "Please file for container terminal services.",
  "Full name can’t be empty.":
    "Full name cannot be empty.",
  "held and can’t be processed until your account is verified":
    "held and cannot be processed until your account is verified",
  "I’m still here — keep me signed in":
    "I am still here — keep me signed in",
  "ID unreadable — ask to re-upload":
    "ID unreadable — please ask the customer to re-upload",
  "If an order needs port-services moves (DEA / inspection), use Assess RPS on its card to record the moves — they bill per move on top of the base. Most orders need none.":
    "If an order needs port-services moves (DEA / inspection), please use Assess RPS on its card to record the moves — they are billed per move on top of the base. Most orders need none.",
  "Imported {n} row(s) (pending; add address/TIN/2303 to approve).":
    "Imported {n} row(s) (pending; please add address, TIN, and 2303 to approve).",
  "Internal KTC staff with admin access. Managed separately from brokers.":
    "Internal KTC staff with admin access. Managed separately from customers.",
  "is computed (finish discharging + the line's import free-days); a call drops off once its last free day passes. Free-days per line are set by admin in Settings.":
    "is computed (finish discharging plus the line's import free-days); a call drops off once its Last Free Day passes. Free-days per line are set by admin in Settings.",
  "Just refreshed — try again in a few seconds":
    "Just refreshed — please try again in a few seconds",
  "Last Free Day computes itself (finish discharging + the line's free-days), and past calls drop off automatically. Tap Snapshot to share the active vessels straight to your Viber group, and switch to the Calendar view for arrivals by month.":
    "Last Free Day is computed automatically (finish discharging plus the line's free-days), and past calls drop off on their own. Tap Snapshot to share the active vessels directly to your Viber group, and switch to the Calendar view for arrivals by month.",
  "Locked against accidental edits.":
    "Locked to prevent accidental edits.",
  "Lost your authenticator? The owner can remove the factor from the server so you can sign in and re-enroll.":
    "Lost your authenticator? The owner can remove the factor from the server so that you can sign in and re-enroll.",
  "Marks the {line} service done — the order completes when every service is done":
    "Marks the {line} service as done — the order is completed once every service is done",
  "Messenger doesn’t allow pre-filled messages — use Copy, then paste into the chat. Viber/SMS buttons work on devices with those apps installed.":
    "Messenger does not allow pre-filled messages — please use Copy, then paste into the chat. The Viber and SMS buttons work on devices with those apps installed.",
  "Missing required columns. Download the template for the exact headers.":
    "Required columns are missing. Please download the template for the exact headers.",
  "After you file, follow every order here — live status, your serving number, View charges & pay, and Print slip once approved.":
    "After you file, you can follow every order here — live status, your serving number, View charges & pay, and Print slip once approved.",
  "My vessel isn’t listed — enter it manually (operations will match it)":
    "My vessel is not listed — please enter it manually (operations will match it)",
  "Needs updated info — ask to resubmit":
    "Needs updated info — please ask the customer to resubmit",
  "New customers who confirmed their email and need verifying. A ring/dot means work is waiting — tap to open Approvals, view their ID, and approve or reject.":
    "New customers who confirmed their email and need verifying. A ring or dot means work is waiting — tap to open Approvals, view their ID, and approve or reject.",
  "New lines not yet configured (set free-days in Settings): {lines}":
    "New lines are not yet configured (please set free-days in Settings): {lines}",
  "New service name (can't be renamed later)":
    "New service name (cannot be renamed later)",
  "No account found for \"{target}\". Ask them to sign up first, then grant access here.":
    "No account found for \"{target}\". Please ask them to sign up first, then grant access here.",
  "No accounts pending.":
    "No accounts are pending.",
  "No active orders right now.":
    "There are no active orders right now.",
  "No authenticator found on this account.":
    "No authenticator was found on this account.",
  "No calls. Add one above or import the template.":
    "No calls. Please add one above or import the template.",
  "No client errors recorded.":
    "No client errors were recorded.",
  "No containers on this order.":
    "There are no containers on this order.",
  "No current calls. Add one above or import the template.":
    "No current calls. Please add one above or import the template.",
  "No current vessel calls right now.":
    "There are no current vessel calls at this time.",
  "No customer accounts yet.":
    "There are no customer accounts yet.",
  "No email needed — hand them the username + password. They sign in at the login page with the username.":
    "No email is required. Please provide them with the username and password. They sign in at the login page using the username.",
  "No job order found for “{query}”. No X-ray request on file.":
    "No Job Order was found for “{query}”. There is no X-ray request on file.",
  "No job orders in this view.":
    "There are no Job Orders in this view.",
  "No job orders yet.":
    "There are no Job Orders yet.",
  "No lines yet — add your shipping lines below.":
    "No lines yet. Please add your shipping lines below.",
  "No move types configured.":
    "No move types are configured.",
  "No rejected or cancelled orders.":
    "There are no rejected or cancelled orders.",
  "No security events.":
    "There are no security events.",
  "No staff yet.":
    "There are no staff yet.",
  "No valid rows found. Expected a name column (and optional code).":
    "No valid rows were found. A name column is expected, along with an optional code.",
  "No valid rows to import.":
    "There are no valid rows to import.",
  "No vessel calls right now.":
    "There are no vessel calls at this time.",
  "Nothing here yet.":
    "There is nothing here yet.",
  "Nothing needs your action.":
    "Nothing requires your action.",
  "Nothing to save — no changes.":
    "There is nothing to save, as no changes were made.",
  "Nothing waiting for payment — every completed order has an invoice.":
    "Nothing is awaiting payment. Every completed order has an invoice.",
  "Official Receipt No. {no} recorded at the KTC office.":
    "Official Receipt No. {no} was recorded at the KTC office.",
  "Only the owner can add or change staff access.":
    "Only the owner may add or change staff access.",
  "Only the owner can change access.":
    "Only the owner may change access.",
  "Opens your SMS app with the message pre-filled (mobile)":
    "Opens your SMS app with the message pre-filled (mobile).",
  "Optional note to append (e.g. which field to fix)…":
    "Optional note to append (for example, which field to correct)…",
  "Or grant admin to an existing account":
    "Or grant admin access to an existing account.",
  "Password reset for \"{username}\" — hand them the new password.":
    "Password reset for \"{username}\". Please provide them with the new password.",
  "Passwords don’t match.":
    "The passwords do not match.",
  "Paste at least one container number first.":
    "Please paste at least one container number first.",
  "Payment details will be posted here soon — or pay directly at the KTC cashier.":
    "Payment details will be posted here soon, or you may pay directly at the KTC cashier.",
  "Payment doesn’t block processing — the official Service Invoice is issued at the KTC office.":
    "Payment does not block processing. The official Service Invoice is issued at the KTC office.",
  "Permanently delete this file from storage (DPA cleanup)":
    "Permanently delete this file from storage (DPA cleanup).",
  "Philippine statutory VAT — changeable only server-side if the law changes":
    "Philippine statutory VAT, changeable only server-side if the law changes.",
  "Pick the customer this order is for.":
    "Please select the customer this order is for.",
  "Pick your consignee":
    "Please select your consignee.",
  "Prices are locked against accidental edits — unlock to change them":
    "Prices are locked against accidental edits. Please unlock to change them.",
  "Process job orders (approve / hold / reject / complete)":
    "Process Job Orders (approve, hold, reject, or complete).",
  "Profile, email & password":
    "Profile, email, and password",
  "QRPH — scan with any bank or e-wallet app (GCash, Maya, etc.)":
    "QRPH — scan with any bank or e-wallet app (GCash, Maya, etc.).",
  "Tap to enlarge or download":
    "Tap to enlarge or download.",
  "Queue is clear.":
    "The queue is clear.",
  "Record BOTH numbers: the ERP control no. (OR-INV-… cash / BI-INV-… credit) and the printed invoice serial — an invoice on file releases the order":
    "Please record both numbers: the ERP control no. (OR-INV-… cash / BI-INV-… credit) and the printed invoice serial. An invoice on file releases the order.",
  "Refresh statuses (auto-refreshes every minute)":
    "Refresh statuses (refreshes automatically every minute)",
  "Remove 2FA and go back to password-only?":
    "Remove 2FA and return to password-only?",
  "Didn’t get it? You can resend in {t}. Check your spam folder too.":
    "Did not receive it? You may resend in {t}. Please check your spam folder as well.",
  "Resubmit your details to continue":
    "Please resubmit your details to continue.",
  "Review the customer's valid ID and confirm they accepted the Agreement (Terms + Data Privacy consent) before approving.":
    "Please review the customer's valid ID and confirm that they accepted the Agreement (Terms and Data Privacy consent) before approving.",
  "Select a consignee from the list.":
    "Please select a consignee from the list.",
  "Select the vessel & voyage (or tick “not listed”).":
    "Please select the vessel and voyage (or tick “not listed”).",
  "Serving numbers are assigned — the slip can be printed now.":
    "Serving numbers have been assigned. The slip may be printed now.",
  "Snapshot downloaded — attach it in your Viber group.":
    "Snapshot downloaded. Please attach it in your Viber group.",
  "Some rates aren’t configured yet — “—” lines aren’t included in the total.":
    "Some rates are not configured yet. Lines marked “—” are not included in the total.",
  "Some rates aren’t configured yet — the total below may be incomplete. KTC will confirm the final amount.":
    "Some rates are not configured yet, so the total below may be incomplete. KTC will confirm the final amount.",
  "Switch between a table and a month calendar (vessels shown on their arrival date). Tick \"Show past/cancelled\" to see the full history. View only — KTC keeps the schedule up to date.":
    "Switch between a table and a month calendar (vessels appear on their arrival date). Tick \"Show past/cancelled\" to see the full history. View only — KTC keeps the schedule up to date.",
  "Tap an order to see its containers and services.":
    "Select an order to view its containers and services.",
  "Tell the customer what information or update you need. They’ll see this note on the order.":
    "Please tell the customer what information or update you need. They will see this note on the order.",
  "Tell the customer why this order is being rejected. They’ll see this note on the order.":
    "Please tell the customer why this order is being rejected. They will see this note on the order.",
  "Thanks — your email address is verified. Please sign in with your password to continue and upload your valid ID.":
    "Thank you — your email address has been verified. Please sign in with your password to continue and upload your valid ID.",
  "Thanks for confirming your email. To get your account verified, attach a clear photo or PDF of a valid government-issued ID and submit it — a KTC admin will review it. You don’t have to do it now: you can head straight to the portal and prepare job orders, but they’ll be":
    "Thank you for confirming your email. To verify your account, please attach a clear photo or PDF of a valid government-issued ID and submit it — a KTC admin will review it. You do not have to do it now: you may go straight to the portal and prepare job orders, but they will be",
  "That code didn't match — check your authenticator app and try again.":
    "That code did not match. Please check your authenticator app and try again.",
  "That code didn't match — scan the QR again or re-type the code.":
    "That code did not match. Please scan the QR again or re-type the code.",
  "That service already exists — reactivate it instead.":
    "That service already exists. Please reactivate it instead.",
  "That’s already your email.":
    "That is already your email address.",
  "The current vessel calls at KTC, maintained by operations. Check your vessel & voyage before filing, and watch the Last Free Day — the last day of free storage before charges start.":
    "The current vessels calling at KTC, maintained by operations. Please check your vessel and voyage before filing, and watch the Last Free Day — the last day of free storage before charges start.",
  "The Dashboard is your live overview. Each tile is a live count that links straight to where the work happens — here's what they mean.":
    "The Dashboard is your live overview. Each tile is a live count that links directly to where the work happens — here is what they mean.",
  "The full consignee master list customers pick from. Tap to add, edit, or bulk-import.":
    "The full consignee master list customers select from. Select to add, edit, or bulk-import.",
  "The live queue — submitted, processing, and on-hold orders. Tap to open the working queue. Most of the day-to-day lives there: process orders, confirm payments, record invoices.":
    "The live queue — submitted, processing, and on-hold orders. Select to open the working queue. Most of the day-to-day work happens there: process orders, confirm payments, record invoices.",
  "The Rate Calculator estimates your fees — pick services and container counts to see the estimated total, inclusive of VAT and fees.":
    "The Rate Calculator estimates your fees — select services and container counts to see the estimated total, inclusive of VAT and fees.",
  "This is the legal name verified against your ID. Changing it requires re-verification (you’ll re-upload an ID for an admin to review).":
    "This is the legal name verified against your ID. Changing it requires re-verification (you will re-upload an ID for an admin to review).",
  "this order (untick to close it permanently — they’d have to file a new one)":
    "this order (untick to close it permanently — they would have to file a new one)",
  "Tick the consent box above to submit.":
    "Please tick the consent box above to submit.",
  "Two-factor authentication removed. Your account is back to password-only — consider re-enrolling.":
    "Two-factor authentication has been removed. Your account now uses a password only — we recommend enrolling again.",
  "Type a container or JO number to check a box: NOT CLEARED · X-ray pending means it's waiting; CLEARED shows when it passed. Use it when a trucker asks.":
    "Type a container or JO number to check a box: NOT CLEARED · X-ray pending means it is waiting; CLEARED shows when it passed. Use this when a trucker asks.",
  "Type at least {minChars} characters to search.":
    "Please type at least {minChars} characters to search.",
  "Type to search the consignee master list and pick yours.":
    "Type to search the consignee master list and select yours.",
  "Unlock editing first":
    "Please unlock editing first",
  "Upload a clear photo or PDF of the deposit / transfer receipt.":
    "Please upload a clear photo or PDF of the deposit or transfer receipt.",
  "Upload a valid government ID and a KTC admin will review your account. You can file Job Orders while you wait — but they're held until a KTC admin reviews and approves your account.":
    "Please upload a valid government ID and a KTC admin will review your account. You may file Job Orders while you wait, but they are held until a KTC admin reviews and approves your account.",
  "Upload a valid ID to get verified — you can file now, but orders are held until a KTC admin approves your account.":
    "Please upload a valid ID to get verified — you may file now, but orders are held until a KTC admin approves your account.",
  "Upload your valid ID for final verification (banner above); once a KTC admin approves you, your held orders are sent automatically.":
    "Please upload your valid ID for final verification (see the banner above); once a KTC admin approves you, your held orders are sent automatically.",
  "Used for the online-payment computation (the official Service Invoice + receipt come from the ERP). Amounts in ₱.":
    "Used for the online-payment computation (the official Service Invoice and receipt come from the ERP). Amounts in ₱.",
  "Walk-ins and in-house ops — the order is filed under the customer's account and enters the line as":
    "Walk-ins and in-house operations — the order is filed under the customer's account and enters the line as",
  "We just need a quick update to finish verifying your account. Please review the note below, update your details, and resubmit — a KTC admin will review it again.":
    "We require a brief update to complete the verification of your account. Please review the note below, update your details, and resubmit. A KTC admin will review it again.",
  "We’ll email a confirmation link to the new address. The change only takes effect once you click it.":
    "We will email a confirmation link to the new address. The change takes effect only once you click it.",
  "What did you fix? (optional note to KTC)":
    "What did you correct? (optional note to KTC)",
  "What each staff role may do. Owner-only — enforced server-side (RLS + RPCs), the UI just mirrors it.":
    "What each staff role may do. Owner-only — enforced server-side (RLS and RPCs); this screen only mirrors it.",
  "When a container passes the X-ray, hit Confirm on its card — it stamps the date/time and the order leaves your queue (completing once its other services are done).":
    "When a container passes the X-ray, select Confirm on its card. This records the date and time, and the order leaves your queue, completing once its other services are done.",
  "X-ray done and balance fully paid. Collect your gate pass / official Service Invoice at the KTC office.":
    "X-ray complete and the balance is fully paid. Please collect your gate pass and official Service Invoice at the KTC office.",
  "You can already file job orders — they’re held pending verification. Upload your valid ID to get verified; once approved, your held orders are sent to KTC automatically.":
    "You may already file job orders — they are held pending verification. Please upload your valid ID to get verified. Once approved, your held orders are sent to KTC automatically.",
  "You can file job orders now, but they":
    "You may file job orders now, but they",
  "You can upload your ID later from the banner.":
    "You may upload your ID later from the banner.",
  "You were signed out because this account signed in on another device or browser. If that wasn’t you, change your password now.":
    "You were signed out because this account signed in on another device or browser. If that was not you, please change your password now.",
  "You’ll see the result here.":
    "You will see the result here.",
  "You’ve been inactive for a while — you’ll be signed out in about a minute.":
    "You have been inactive for a while. You will be signed out in about a minute.",
  "Your accredited customers. Tap to search, open a customer's detail, or suspend / reinstate an account.":
    "Your accredited customers. Select to search, open a customer's detail, or suspend or reinstate an account.",
  "File a new Job Order. We'll walk you through the form the first time you open it.":
    "File a new Job Order. We will guide you through the form the first time you open it.",
  "Your proof wasn’t accepted":
    "Your proof was not accepted",
  "Your role doesn't have permission to file job orders on behalf of customers.":
    "Your role does not have permission to file job orders on behalf of customers.",
  "Your valid ID is on file — a KTC admin is verifying your account. Once approved, your held orders are sent to KTC automatically.":
    "Your valid ID is on file, and a KTC admin is verifying your account. Once approved, your held orders are sent to KTC automatically.",
  "Announcements shown on every customer’s Home. Each post is a topic customers tap to read in full.":
    "Announcements shown on every customer's Home. Each post is a topic customers select to read in full.",
  "Billed per hour (minimum {h} hours). A refundable cash bond of {amt} per van is required — the balance is returned 7–10 working days after withdrawal, once computed.":
    "Billed per hour (minimum {h} hours). A refundable cash bond of {amt} per van is required. The balance is returned 7–10 working days after withdrawal, once computed.",
  "Build your estimate step by step, then tap Generate. This is a guide — the official amount is confirmed on the Service Invoice at the KTC office.":
    "Build your estimate step by step, then select Generate. This is a guide; the official amount is confirmed on the Service Invoice at the KTC office.",
  "This ticket is closed. Open a new ticket if you need further help.":
    "This ticket is closed. Please open a new ticket if you require further assistance.",
  "Resolve holds & info requests":
    "Resolve holds and information requests",
  "Record the ERP Service Invoice no.":
    "Record the ERP Service Invoice number.",
  "Order is marked paid":
    "The order has been marked paid.",
  "Find the van (scan or pick the JO)":
    "Locate the container by scanning or selecting the Job Order.",
  "Order clears once all lines are done":
    "The order clears once all lines are completed.",
  "Run the floor":
    "Manage the floor",
  "Your account was just opened on another device, and for security only one device stays signed in at a time — so this one was signed out. That’s normal if it was you. Nothing is lost; your work is saved.":
    "Your account was just opened on another device. For security, only one device may stay signed in at a time, so this device was signed out. This is normal if it was you. Nothing is lost; your work has been saved.",
  "If this wasn’t you, sign in again and change your password.":
    "If this was not you, please sign in again and change your password.",
  "Lock / sign out":
    "Lock or sign out",
  "or type JO number":
    "or enter the JO number",
  "Point the camera at the QR on the Job Order slip.":
    "Please point the camera at the QR code on the Job Order slip.",
  "No job order found for that code.":
    "No Job Order was found for that code.",
  "No job order found for “{q}”.":
    "No Job Order was found for “{q}”.",
  "Scanning isn’t supported on this browser — type the JO number instead.":
    "Scanning is not supported on this browser. Please enter the JO number instead.",
  "Could not open the camera. Allow camera access, or type the JO number.":
    "The camera could not be opened. Please allow camera access, or enter the JO number.",
  "You don’t have permission to confirm X-ray.":
    "You do not have permission to confirm X-ray.",
  "More than one order matches — type the full JO number.":
    "More than one order matches. Please enter the full JO number.",
  "Confirm that container {c} ({jo}) has entered the X-ray division for BOC X-ray. This records your e-signature with the date and time.":
    "Please confirm that container {c} ({jo}) has entered the X-ray division for BOC X-ray. This records your e-signature with the date and time.",
  "Get notified on this device when there’s an update — replies, approvals, payments and job-order activity.":
    "Receive notifications on this device when there is an update, including replies, approvals, payments, and Job Order activity.",
  "Could not enable alerts.":
    "Alerts could not be enabled.",
  "Notifications aren’t supported on this browser.":
    "Notifications are not supported on this browser.",
  "Notifications are blocked — allow them in your browser/site settings.":
    "Notifications are blocked. Please allow them in your browser or site settings.",
  "Notifications aren’t set up yet. Please try again later.":
    "Notifications are not set up yet. Please try again later.",
  "Confidential — for viewing only. Printing, saving and copying are disabled.":
    "Confidential — for viewing only. Printing, saving, and copying are disabled.",
  "Continue this ticket off-platform. Your ticket number is included so we can find it fast.":
    "Continue this ticket off-platform. Your ticket number is included so we can locate it quickly.",
  "Could not generate the link.":
    "The link could not be generated.",
  "Currently suspended — no customer emails are being sent. Flip the switch when you’re ready to turn them on.":
    "Customer emails are currently suspended, so none are being sent. Please turn on the switch when you are ready to enable them.",
  "Customer support tickets. Newest activity first.":
    "Customer support tickets, with the newest activity first.",
  "Customers filed Job Orders against these vessels, which aren’t on the schedule. Add the call above (if needed), then link it here to approve — every waiting order adopts the scheduled vessel. Or reject if it doesn’t belong.":
    "Customers filed Job Orders against these vessels, which are not on the schedule. Please add the call above if needed, then link it here to approve, and every waiting order will adopt the scheduled vessel. Otherwise, reject it if it does not belong.",
  "Delete this entry? This can’t be undone.":
    "Delete this entry? This action cannot be undone.",
  "Describe what you need help with…":
    "Please describe what you need assistance with…",
  "Editing this order. You can change it while it’s still waiting — once KTC accepts it, it locks.":
    "Editing this order. You may change it while it is still waiting; once KTC accepts it, it locks.",
  "Enter a title and a message.":
    "Please enter a title and a message.",
  "Enter your 20ft / 40ft container counts, then tap Generate estimate.":
    "Please enter your 20ft and 40ft container counts, then select Generate estimate.",
  "Generate a one-time link the customer can open to set a new password — copy it and send it to them directly (e.g. Viber/SMS). No email is sent. The link is single-use and expires in about an hour.":
    "Generate a one-time link the customer can open to set a new password. Please copy it and send it to them directly, for example by Viber or SMS. No email is sent. The link is single-use and expires in about an hour.",
  "Here’s what’s happening with your KTC terminal services.":
    "Here is what is happening with your KTC terminal services.",
  "How the KTC Online Portal works — from sign-up to claiming your service, step by step.":
    "How the KTC Online Portal works, from sign-up to claiming your service, step by step.",
  "If this wasn’t you, cancel and change your password.":
    "If this was not you, please cancel and change your password.",
  "Layer line-specific rules on top of the tariff: waive a charge, give a discount (% or ₱/container), or add a surcharge. Example: Maersk & MCC waive LoLo on export. Free storage days are set per line in the vessel schedule settings.":
    "Layer line-specific rules on top of the tariff: waive a charge, give a discount (% or ₱/container), or add a surcharge. For example, Maersk and MCC waive LoLo on export. Free storage days are set per line in the vessel schedule settings.",
  "Live contact details aren’t set up yet — please use the ticket above and we’ll reply here.":
    "Live contact details are not set up yet. Please use the ticket above and we will reply here.",
  "Master switch for emails sent to customers (account approved, order on-hold / rejected, payment-proof issues). In-app notifications keep working either way. Owner security / watchdog alerts are never affected by this.":
    "Master switch for emails sent to customers (account approved, order on-hold / rejected, payment-proof issues). In-app notifications continue to work either way. Owner security and watchdog alerts are never affected by this.",
  "No current vessels for this line":
    "There are no current vessels for this line.",
  "No support tickets yet. Open one with the “New ticket” button.":
    "There are no support tickets yet. Please open one using the “New ticket” button.",
  "No tickets in this view.":
    "There are no tickets in this view.",
  "Open a ticket and we’ll get back to you. You can also continue with a live agent below.":
    "Please open a ticket and we will respond to you. You may also continue with a live agent below.",
  "Other services (RPS, equipment rental, stripping) are quoted per request — ask KTC.":
    "Other services (RPS, equipment rental, stripping) are quoted per request — please ask KTC.",
  "Pick a vessel above to estimate storage from the Last Free Day.":
    "Please select a vessel above to estimate storage from the Last Free Day.",
  "Pick the scheduled call to link “{name}” to (add it above first if needed).":
    "Please select the scheduled call to link “{name}” to (add it above first if needed).",
  "Rates aren’t configured yet — ask KTC, or check Settings if you’re staff.":
    "Rates are not configured yet — please ask KTC, or check Settings if you are staff.",
  "Shown on the customer Help & Support page as “talk to an agent” deep links (call / SMS / Viber / email) with a prefilled message + ticket number. Leave a field blank to hide that channel.":
    "Shown on the customer Help & Support page as “talk to an agent” deep links (call / SMS / Viber / email) with a prefilled message and ticket number. Leave a field blank to hide that channel.",
  "Tap a row to open its full details.":
    "Please tap a row to open its full details.",
  "Tap Generate estimate to see the charges.":
    "Please tap Generate estimate to see the charges.",
  "The cash bond is refundable — balance returned 7–10 working days after withdrawal.":
    "The cash bond is refundable — the balance is returned 7–10 working days after withdrawal.",
  "The route is set by your shipping line; choose the shipment type.":
    "The route is set by your shipping line; please choose the shipment type.",
  "This account is currently signed in on another device or browser. Only one device can be signed in at a time. Sign out the other session and continue here, or cancel and leave it as it is.":
    "This account is currently signed in on another device or browser. Only one device can be signed in at a time. Please sign out the other session and continue here, or cancel and leave it as it is.",
  "This account was just signed in on another device or browser, so this session was ended. Only one device can be signed in at a time. If this wasn’t you, sign in again and change your password.":
    "This account was just signed in on another device or browser, so this session was ended. Only one device can be signed in at a time. If this was not you, please sign in again and change your password.",
  "This order is already filed and has a queue number. Saving keeps your place in line — KTC will just re-review your changes.":
    "This order is already filed and has a queue number. Saving keeps your place in line — KTC will simply re-review your changes.",
  "This ticket is closed. Send a message to reopen it.":
    "This ticket is closed. Please send a message to reopen it.",
  "To activate your account and pass final verification, attach a clear photo or PDF of a valid government-issued ID and submit it for KTC admin approval.":
    "To activate your account and pass final verification, please attach a clear photo or PDF of a valid government-issued ID and submit it for KTC admin approval.",
  "Write a comment or attach a document.":
    "Please write a comment or attach a document.",
  "You can continue to the portal first and prepare job orders — they’ll be held until your account is verified.":
    "You may continue to the portal first and prepare job orders — they will be held until your account is verified.",
  "You don’t have access to the support inbox.":
    "You do not have access to the support inbox.",
  "You’ve been signed out":
    "You have been signed out.",
  "Tap a card to open its full details.":
    "Please tap a card to open its full details.",
  "A payment proof is waiting for the cashier to review.":
    "A payment proof is awaiting review by the cashier.",
  "Only the fields KTC asked for are editable — the rest stay as filed.":
    "Only the fields KTC requested are editable; the rest remain as filed.",
  "Reply to KTC below to resubmit this order.":
    "Please reply to KTC below to resubmit this order.",
  "This order is closed. If you still need it, please":
    "This order is closed. If you still require it, please",
  "Your new-consignee requests. If KTC needs more info, edit and resubmit here.":
    "Your new-consignee requests. If KTC requires further information, please edit and resubmit here.",
  "If the vessel isn’t listed here, please call KTC customer service for updates.":
    "If the vessel is not listed here, please contact KTC customer service for updates.",
  "My vessel isn’t listed — call KTC customer service to have it added":
    "My vessel is not listed — contact KTC customer service to have it added",
  "e.g. Corrected the entry number — see above.":
    "e.g. Corrected the entry number — please see above.",
  "Tag an additional charge (JO-…-A/B/C) — the customer settles it before the order can complete":
    "Tag an additional charge (JO-…-A/B/C) — the customer settles it before the order can be completed",
  "Select a charge type…":
    "Please select a charge type…",
  "Leave all unticked for a general hold (note only). Ticked fields are the only ones the customer can change on resubmit.":
    "Leave all unticked for a general hold (note only). Only the ticked fields may be changed by the customer on resubmit.",
  "(the order enters today’s batch).":
    "(the order enters today's batch).",
  "The order is filed — you can print the slip now.":
    "The order has been filed. You may print the slip now.",
  "These feed the “Add charge” dropdown on a job order. The amount pre-fills, but staff can adjust it per charge. Leave an amount blank for “not set”. Deactivate to retire a type (it disappears from the dropdown); delete is only offered once inactive. Amounts in ₱.":
    "These feed the \"Add charge\" dropdown on a job order. The amount pre-fills, but staff may adjust it per charge. Leave an amount blank for \"not set\". Deactivate to retire a type (it is removed from the dropdown); deletion is offered only once a type is inactive. Amounts in ₱.",
  "Untick to remove from the “Add charge” dropdown (existing charges unaffected)":
    "Untick to remove from the \"Add charge\" dropdown (existing charges are unaffected)",
  "No charge types yet — add one below.":
    "No charge types yet. Please add one below.",
  "Enter the charge type name first.":
    "Please enter the charge type name first.",
  "Per-container rates the Rate Calculator looks up. For each service, tick the conditions its rate depends on — leave all unticked for one uniform rate. Storage is special: domestic is a flat per-day rate by size; foreign is a progressive per-day band tariff. Amounts in ₱, VAT-exclusive (12% VAT is added on the subtotal).":
    "Per-container rates that the Rate Calculator looks up. For each service, tick the conditions its rate depends on; leave all unticked for one uniform rate. Storage is a special case: domestic is a flat per-day rate by size, while foreign is a progressive per-day band tariff. Amounts in ₱, VAT-exclusive (12% VAT is added on the subtotal).",
}
