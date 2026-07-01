// Lara's decision tree — the whole hand-written tree. NO AI: every answer is
// authored and grounded in real app behaviour (manual-customer.md, MyJobOrders,
// Payment, Releases, Account, Vessels). All copy `string`s are English t() keys
// (Tagalog in translations.ts). Refined 6-tile structure: Orders · Vessel
// schedule · Rates & payment · Container release / pull-out · Account &
// verification · Feedback & concerns — plus a standing "Talk to a person" and the
// always-on free-text matcher.

import type { NodeRegistry } from './types'

const nonEmpty = (raw: string) =>
  raw.trim() ? ({ ok: true as const, value: raw.trim() }) : ({ ok: false as const, error: 'Please type a few words first.' })

export const NODES: NodeRegistry = {
  // ── Engine-critical ───────────────────────────────────────────────────────
  'root': {
    kind: 'options', layout: 'tiles',
    say: 'Hi, I’m Lara — happy to help. Pick a topic, or just type your question.',
    options: [
      { glyph: '📦', label: 'Orders', to: 'orders.root' },
      { glyph: '🚢', label: 'Vessel schedule', to: 'vessel.root' },
      { glyph: '💳', label: 'Rates & payment', to: 'pay.root' },
      { glyph: '📤', label: 'Container release / pull-out', to: 'rel.root' },
      { glyph: '🪪', label: 'Account & verification', to: 'acct.root' },
      { glyph: '📨', label: 'Feedback & concerns', to: 'feedback.root' },
      { glyph: '🧑‍💼', label: 'Talk to a person', to: 'talk.input' },
    ],
  },

  'nomatch': {
    kind: 'options',
    say: 'Hmm, I’m not sure I understood that. Try rephrasing, pick a topic, or I can connect you with the KTC team — they’ll reply right here in your tickets.',
    options: [
      { glyph: '🎫', label: 'Create a support ticket', to: 'talk.input' },
      { glyph: '↩', label: 'Show me the main menu', to: 'root' },
    ],
  },

  'talk.input': {
    kind: 'input',
    prompt: 'Sure — tell me in a sentence what you need, and I’ll pass it to a KTC person.',
    placeholder: 'Type your message…', storeAs: 'topic', submitLabel: 'Send',
    next: 'ticket.fromHere', validate: nonEmpty,
    altOption: { label: 'Back to menu', to: 'root' },
  },

  'ticket.fromHere': {
    kind: 'ticket', category: 'customer_service', inheritCategory: true,
    subject: { from: 'userText', prefix: 'Chat: ' }, body: { from: 'userText' },
    intro: 'I’ll open a ticket with what you typed so a person can pick it up. Sound good?',
    confirmLabel: 'Create a support ticket',
    cancelOption: { label: 'No, back to menu', to: 'root' },
  },

  // Terminal control nodes (no `say`; the success/failure bubble is pushed live).
  'ticket.done': {
    kind: 'options',
    options: [
      { label: 'Open Support', to: 'nav.support' },
      { label: 'Back to menu', to: 'root' },
    ],
  },
  'ticket.failed': {
    kind: 'options',
    options: [
      { label: 'Open Support', to: 'nav.support' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  // ── 📦 Orders ─────────────────────────────────────────────────────────────
  'orders.root': {
    kind: 'options',
    say: 'Orders — what would you like to do?',
    options: [
      { label: 'File a new order', to: 'file.how' },
      { label: 'Track an order', to: 'track.input' },
      { label: 'View all my orders', to: 'orders.listAll' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'orders.listAll': { kind: 'action', action: 'listMyOrders' },

  'file.how': {
    kind: 'message', ticketCategory: 'job_order',
    body: 'To file a Job Order, open New Job Order: 1) pick an approved consignee from KTC’s master list (type a few letters; if it is not listed, request a new consignee and wait for approval), 2) enter your Entry Number (your C-number), 3) pick the Vessel & Voyage, 4) add containers, one row each, and choose its service. Use Bulk paste for a long list. Review, then Confirm. Verified accounts get a JO number on submit. KTC aims to complete special services within 24 hours so you avoid storage charges.',
    then: [
      { label: 'File with Lara', to: 'file.lara.entry' },
      { label: 'Open New Job Order', to: 'nav.newJO' },
      { label: 'What do I need to file?', to: 'file.requirements' },
      { label: 'What services can I request?', to: 'file.services' },
      { label: 'Can I file while pending?', to: 'file.pending' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'file.lara.entry': {
    kind: 'input',
    say: 'I can help draft the basics, then open the real New Job Order form for final review.',
    prompt: 'What is the Entry Number?',
    placeholder: 'e.g. C-0000012345', storeAs: 'entry', submitLabel: 'Continue',
    next: 'file.lara.vessel',
    validate: (raw) => {
      const compact = raw.trim().toUpperCase().replace(/\s+/g, '')
      const value = compact.startsWith('C-') ? compact : compact.startsWith('C') ? `C-${compact.slice(1).replace(/^-+/, '')}` : `C-${compact.replace(/^-+/, '')}`
      return /^C-[A-Z0-9][A-Z0-9-]*$/.test(value)
        ? { ok: true, value }
        : { ok: false, error: 'Please enter an Entry Number starting with C-.' }
    },
    altOption: { label: 'Open New Job Order instead', to: 'nav.newJO' },
  },

  'file.lara.vessel': {
    kind: 'input',
    prompt: 'What vessel or voyage should I look for on the form?',
    placeholder: 'e.g. MV Example / V-123N', storeAs: 'vessel', submitLabel: 'Save draft',
    next: 'file.lara.save', validate: nonEmpty,
    altOption: { label: 'Open New Job Order instead', to: 'nav.newJO' },
  },

  'file.lara.save': { kind: 'action', action: 'startJobOrderDraft' },

  'file.requirements': {
    kind: 'message', ticketCategory: 'job_order',
    body: 'You need four things: the Consignee (from KTC’s master list), your Entry Number (C-… customs number), the Vessel & Voyage (from KTC’s current schedule — you can’t type a new one), and at least one Container (its number + the service it needs).',
    then: [
      { label: 'My vessel isn’t listed', to: 'vessel.missing' },
      { label: 'My consignee isn’t in the list', to: 'consignee.add' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'file.services': {
    kind: 'message', ticketCategory: 'job_order',
    body: 'Each container row gets its own service. KTC’s services include X-Ray (X-ray inspection), DEA (examination), OOG Stripping (out-of-gauge cargo), and combinations like X-Ray + DEA. The X-Ray office handles requests from 9 AM to 5 PM and aims to finish within 24 hours so you avoid storage charges. The dropdown shows whatever KTC currently offers — go by what’s listed when you file.',
    then: [
      { label: 'Which service does my shipment need?', to: 'file.which_service' },
      { label: 'Estimate the charges first', to: 'rv.estimate' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'file.which_service': {
    kind: 'message', ticketCategory: 'operations',
    body: 'Which service a container needs depends on your shipment and customs requirements — that’s an operational call I can’t decide here. Pick the service you’ve been instructed to request, or let me open a ticket so KTC can advise.',
    then: [
      { label: 'Ask KTC which service to use', to: 'ticket.operations' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'file.supplement': {
    kind: 'message', ticketCategory: 'payment',
    body: 'A supplement is an additional charge KTC tags onto your order after it’s filed — numbered like JO-0123-A, -B, -C. Each has its own amount and its own payment, shown under additional charges as “Balance to pay.” You pay it like the base charge. Every supplement must be paid before the order can be completed. You don’t add supplements — KTC does.',
    then: [
      { label: 'See my orders & balances', to: 'nav.myOrders' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'file.pending': {
    kind: 'message', ticketCategory: 'account',
    body: 'No — you must wait until a KTC admin approves your account before you can file any Job Orders. Upload a valid ID to start that review. Heads up: upload it within 48 hours of confirming your email, or the account closes and you re-register.',
    then: [
      { label: 'How do I upload my valid ID?', to: 'acct.upload_id' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'consignee.add': {
    kind: 'message', ticketCategory: 'accreditation',
    body: 'No problem. On the consignee step, tap “Request new consignee” and fill in its details. KTC reviews it on their side — once they approve it, it appears in your consignee list and you can file an order against it. You can’t file against a consignee until it’s approved, so just keep an eye on your request. You can track it any time in My Requests.',
    then: [
      { label: 'Track my request', to: 'nav.requests' },
      { label: 'Ask KTC about a consignee', to: 'ticket.accreditation' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'vessel.missing': {
    kind: 'options',
    say: 'Only KTC operations can add a vessel — you can’t add one yourself. If your vessel/voyage isn’t in the dropdown, it usually hasn’t been entered yet (or its Last Free Day passed). I can log a ticket so KTC adds it.',
    options: [
      { label: 'Ask KTC to add my vessel', to: 'vessel.add_input' },
      { label: 'Check the vessel schedule', to: 'rv.vessels' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'vessel.add_input': {
    kind: 'input',
    prompt: 'Tell me the vessel name & voyage in one line, then I’ll open the ticket.',
    placeholder: 'e.g. MV Example / V-123N', storeAs: 'vesseladd', submitLabel: 'Continue',
    next: 'ticket.vessel', validate: nonEmpty,
    altOption: { label: 'Back to menu', to: 'root' },
  },

  // ── Tracking & orders ─────────────────────────────────────────────────────
  'track.input': {
    kind: 'input',
    prompt: 'What’s the JO number? (e.g. JO-000123)',
    placeholder: 'JO-000123', storeAs: 'jo', submitLabel: 'Track', next: 'track.run',
    validate: (raw) => /\d/.test(raw)
      ? { ok: true, value: raw.trim() }
      : { ok: false, error: 'Please enter a JO number like JO-000123.' },
    altOption: { label: 'I don’t have it — see all my orders', to: 'orders.listAll' },
  },

  'track.run': { kind: 'action', action: 'trackOrder' },

  'status.glossary': {
    kind: 'message', ticketCategory: 'job_order',
    body: 'What each status means — Submitted (in the queue; you can Edit/Cancel) · Approved · processing (services running; print the A6 slip; base charge payable) · On hold (KTC needs info — fix the flagged fields and Resubmit) · Completed (services done; settle any balance, claim your OR) · Not approved (closed, no resubmit) · Cancelled. Tip: My Job Orders auto-refreshes every minute.',
    then: [
      { label: 'Track an order by number', to: 'track.input' },
      { label: 'See all my orders', to: 'nav.myOrders' },
      { label: 'Edit or cancel an order', to: 'order.editcancel' },
      { label: 'How do I print the slip?', to: 'order.print' },
      { label: 'How will KTC notify me?', to: 'order.notifications' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'order.editcancel': {
    kind: 'message', ticketCategory: 'job_order',
    body: 'You can Edit or Cancel your own order only while it’s Submitted (before KTC starts processing) — open it in My Job Orders. If it’s On hold, open it, fix the fields KTC flagged, add a reply, and Resubmit. Once it’s Approved · processing it locks; once Rejected it’s closed (file a new one). Cancelling is confirmed and can’t be undone.',
    then: [
      { label: 'Open My Job Orders', to: 'nav.myOrders' },
      { label: 'Talk to KTC', to: 'ticket.jobOrder' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'order.print': {
    kind: 'message', ticketCategory: 'job_order',
    body: 'Once an order is Approved · processing you can print its A6 service slip: open the order in My Job Orders and tap Print slip. It’s a mini KTC service slip — the official numbered Service Invoice / OR still comes from the KTC office.',
    then: [
      { label: 'Open My Job Orders', to: 'nav.myOrders' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'order.notifications': {
    kind: 'message', ticketCategory: 'customer_service',
    body: 'When KTC replies or your order changes, you’ll get a notification — tap the 🔔 bell in the top bar to see them. Ticket replies also show on the Support page. Statuses update on their own in My Job Orders (every minute, or tap ↻ Refresh).',
    then: [
      { label: 'Open Support', to: 'nav.support' },
      { label: 'Open My Job Orders', to: 'nav.myOrders' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  // ── 🚢 Vessel schedule ────────────────────────────────────────────────────
  'vessel.root': {
    kind: 'options',
    say: 'Vessel schedule — what do you need?',
    options: [
      { label: 'View all current vessels', to: 'rv.vessels' },
      { label: 'Find a specific vessel', to: 'vessel.find' },
      { label: 'Active vessels + Last Free Day', to: 'rv.vessels' },
      { label: 'What is Last Free Day?', to: 'rv.lfd' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'vessel.find': {
    kind: 'input',
    prompt: 'What’s the vessel’s name? I’ll point you to it on the schedule.',
    placeholder: 'e.g. MV Example', storeAs: 'vessel', submitLabel: 'Find',
    next: 'vessel.find_result', validate: nonEmpty,
    altOption: { label: 'View the whole schedule instead', to: 'rv.vessels' },
  },

  'vessel.find_result': {
    kind: 'message', ticketCategory: 'operations',
    body: 'Open the Vessel Schedule and look for “{vessel}” — it’s searchable, and each card shows the voyage, line, arrival, finish discharging and Last Free Day. If it isn’t listed, only KTC operations can add it — I can log that for you.',
    then: [
      { label: 'Open Vessel Schedule', to: 'rv.vessels' },
      { label: 'My vessel isn’t listed', to: 'vessel.missing' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'rv.vessels': {
    kind: 'nav', route: '/vessels', cta: 'Open Vessel Schedule',
    body: 'The Vessel Schedule shows KTC’s current calls — vessel, voyage, line, arrival, finish discharging, Last Free Day, and berth. It’s read-only (KTC operations maintains it) with Cards, Table, and Calendar views, plus a Show past/cancelled toggle. It’s the same list you pick from when filing a Job Order.',
    then: [
      { label: 'My vessel isn’t listed', to: 'vessel.missing' },
      { label: 'What is the Last Free Day?', to: 'rv.lfd' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'rv.lfd': {
    kind: 'message', ticketCategory: 'operations',
    body: 'The Last Free Day (LFD) is the last day of free storage for a vessel call — KTC computes it as finish-discharging date + that shipping line’s free days. Up to the LFD, storage is free; after it, storage charges accrue per day until you pick up the container. Each call has its own LFD — see it on the Vessel Schedule (highlighted on every card) and in the Rate Calculator.',
    then: [
      { label: 'View the vessel schedule', to: 'rv.vessels' },
      { label: 'Estimate my storage', to: 'rv.estimate' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  // ── 💳 Rates & payment ────────────────────────────────────────────────────
  'pay.root': {
    kind: 'options',
    say: 'Rates & payment — what do you need?',
    options: [
      { label: 'Estimate a charge', to: 'rv.estimate' },
      { label: 'How do I pay?', to: 'pay.how' },
      { label: 'Bank / GCash / QRPH details', to: 'pay.details' },
      { label: 'What’s the Service Invoice / OR?', to: 'pay.invoice' },
      { label: 'What is RPS?', to: 'pay.rps' },
      { label: 'Why is there still a balance?', to: 'pay.balance' },
      { label: 'What is the Last Free Day?', to: 'rv.lfd' },
      { label: 'My payment was rejected', to: 'pay.rejected' },
      { label: 'Open my payment page', to: 'nav.myOrders' },
    ],
  },

  'rv.estimate': {
    kind: 'nav', route: '/calculator', cta: 'Open Rates calculator',
    body: 'Estimate charges anytime in the Rate Calculator — no filing needed. Three steps: 1) Shipment details (line, vessel & voyage — this also sets your route and storage Last Free Day), 2) Containers (size, empty/full, dry/reefer, qty), 3) Ancillary services (DEA, electrical/reefer). Tap Generate estimate: terminal charges + 12% VAT + flat admin & print fee. It’s a guide only — the official amount is on the KTC Service Invoice.',
    then: [
      { label: 'Why does my estimate show “—”?', to: 'rv.estimate_dash' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'rv.estimate_dash': {
    kind: 'message', ticketCategory: 'payment',
    body: 'A “—” next to a line means KTC hasn’t set that rate yet for your exact size × empty/full × dry/reefer × route — it’s not ₱0, it’s just not in the estimate. Your total still sums the lines that do have rates. Some services (RPS, equipment rental, stripping) aren’t in the calculator at all — they’re quoted per request. Need a figure for a “—” line? KTC can give it to you.',
    then: [
      { label: 'Ask KTC for a rate', to: 'ticket.payment' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'pay.how': {
    kind: 'message', ticketCategory: 'payment',
    body: 'Each Job Order has its own payment page. Open My Job Orders, find the order, and tap Balances (or View charges). You’ll see the exact computation — X-Ray rate × containers + 12% VAT + flat admin & print fees — plus KTC’s bank / GCash details and the QRPH code. Pay by transfer or e-wallet, then upload your deposit slip for KTC to review. Payment never blocks processing, and you can always pay at the KTC cashier.',
    then: [
      { label: 'Open My Job Orders', to: 'nav.myOrders' },
      { label: 'How do I upload the proof?', to: 'pay.upload' },
      { label: 'Estimate my charges first', to: 'rv.estimate' },
    ],
  },

  'pay.details': {
    kind: 'message', ticketCategory: 'payment',
    body: 'KTC’s bank account, account name/number, and the QRPH code are shown right on each order’s payment page (under How to pay) — they’re KTC-managed, so what you see there is always current. Open My Job Orders → Balances to see them. The QR is QRPH: scan it with any bank or e-wallet app (GCash, Maya, etc.). If details aren’t posted yet, the page says so — just pay at the KTC cashier. For your security, KTC never DMs separate account numbers — trust only what’s on the portal.',
    then: [
      { label: 'Open My Job Orders', to: 'nav.myOrders' },
      { label: 'How do I upload the proof?', to: 'pay.upload' },
      { label: 'The details aren’t showing', to: 'ticket.payment' },
    ],
  },

  'pay.upload': {
    kind: 'message', ticketCategory: 'payment',
    body: 'After paying by transfer or GCash: open My Job Orders → Balances, go to the charge section you’re paying (X-ray, port-services / RPS, or an additional charge), pick a clear photo or PDF of your receipt under Upload, then tap Submit to KTC. Each charge block is uploaded and reviewed separately — repeat for each. The status changes to “Your proof is with KTC for review.”',
    then: [
      { label: 'Open My Job Orders', to: 'nav.myOrders' },
      { label: 'What happens after I submit?', to: 'pay.after' },
      { label: 'My upload won’t go through', to: 'ticket.payment' },
    ],
  },

  'pay.after': {
    kind: 'message', ticketCategory: 'payment',
    body: 'After you upload, the charge shows “Your proof is with KTC for review.” KTC either confirms it (“✓ Confirmed by KTC”) or rejects it with a short reason so you can re-upload. When all charges are confirmed, the order flips from Balance to pay to Paid. Once your X-ray is done and the balance is fully paid, the page shows “Cleared for release” — collect your gate pass / official Service Invoice at the KTC office.',
    then: [
      { label: 'What’s the Service Invoice / OR?', to: 'pay.invoice' },
      { label: 'It was rejected — I disagree', to: 'pay.rejected' },
      { label: 'Open My Job Orders', to: 'nav.myOrders' },
    ],
  },

  'pay.invoice': {
    kind: 'message', ticketCategory: 'payment',
    body: 'The official Service Invoice is the BIR-registered document issued by KTC (not the portal), recorded at the KTC office. The portal just shows its number once recorded: “Official Receipt No. <no>” if you paid cash/OR, or “Billed on account — Billing Invoice No. <no>” on credit. The in-app charges page is only the computation + your proof. Pay online or at the cashier — either way the official invoice/OR is issued at the office when your container is released.',
    then: [
      { label: 'Where do I see my invoice number?', to: 'nav.myOrders' },
      { label: 'My invoice number looks wrong', to: 'ticket.payment' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'pay.balance': {
    kind: 'message', ticketCategory: 'payment',
    body: 'Your order shows “Balance to pay” until everything on it is settled — the base X-ray charge, any port-services (RPS) charge ops assessed, and any additional charges KTC added. Each is paid and confirmed separately, so if one block is still unpaid, submitted (under review), or rejected, the balance stays. Open My Job Orders → Balances to see which block is outstanding. When all are confirmed, it switches to Paid.',
    then: [
      { label: 'Open My Job Orders', to: 'nav.myOrders' },
      { label: 'What is a port-services (RPS) charge?', to: 'pay.rps' },
      { label: 'What’s an additional charge?', to: 'file.supplement' },
      { label: 'I already paid but it still shows a balance', to: 'ticket.payment' },
    ],
  },

  'pay.rps': {
    kind: 'message', ticketCategory: 'payment',
    body: 'RPS covers the port-services moves a Job Order may need beyond a plain X-ray — DEA / inspection work where the van is opened: lift on, trucking, shifting, stripping, stuffing. KTC’s checker assesses each order; most are plain X-ray and need none, but if yours needs these moves, KTC charges them per move on top of the base X-ray. RPS isn’t in the Rate Calculator (quoted per request). You’ll see any RPS charge under Balances before you pay.',
    then: [
      { label: 'Open My Job Orders', to: 'nav.myOrders' },
      { label: 'How do I upload the proof?', to: 'pay.upload' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'pay.rejected': {
    kind: 'message', ticketCategory: 'payment',
    body: 'When KTC can’t accept a proof, the charge shows “Your proof wasn’t accepted” with a short reason (wrong amount, unclear image, or it doesn’t match the total). The fix is usually quick: open My Job Orders → Balances, read the note, re-upload a clearer/corrected slip on that same charge, and Submit to KTC again. If you believe the rejection is a mistake — the amount IS correct — open a ticket and KTC will look into it.',
    then: [
      { label: 'Re-upload a corrected slip', to: 'nav.myOrders' },
      { label: 'I disagree — open a support ticket', to: 'ticket.payment' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  // ── 📤 Container release / pull-out ───────────────────────────────────────
  // future: pre-advise/advance-notice (deferred) — not built; this tile only
  // explains the live online Release / Pull-out flow (ADR-0024).
  'rel.root': {
    kind: 'options',
    say: 'Container release / pull-out — what do you need?',
    options: [
      { label: 'How it works', to: 'rel.how' },
      { label: 'What documents do I need? (DO / BL)', to: 'rel.docs' },
      { label: 'What happens after I file?', to: 'rel.after' },
      { label: 'Open my releases', to: 'rel.nav' },
      { label: 'Something else / I have a problem', to: 'ticket.release' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'rel.how': {
    kind: 'message', ticketCategory: 'operations',
    body: 'Filing a release is online — no queue. Go to Release / Pull-out → File a release: 1) pick the Consignee (optional — only approved consignees show in the picker; if yours isn’t there yet, request it and leave this blank for now, or add it once it’s approved), 2) enter the BL Number (required), 3) attach a photo/PDF of your DO or BL (optional at filing, but KTC verifies it before assessing charges, so attach it now). Tap File release; KTC aims to verify and assess within 24 hours. Note: your account must be fully approved first — a pending account can’t file a release yet.',
    then: [
      { label: 'Open Release / Pull-out', to: 'rel.nav' },
      { label: 'What happens next?', to: 'rel.after' },
      { label: 'My account isn’t approved yet', to: 'rel.not_approved' },
    ],
  },

  'rel.not_approved': {
    kind: 'message', ticketCategory: 'account',
    body: 'To file a release your account must be fully approved (a pending account can’t — this is stricter than Job Orders). If you’ve uploaded your valid ID, wait for KTC’s approval email. If not, upload one valid government ID from the banner on your home page within 48 hours of confirming your email, or the account closes. Once approved, the File a release form opens up.',
    then: [
      { label: 'Go to my home page', to: 'nav.home' },
      { label: 'Still stuck — contact KTC', to: 'ticket.account' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'rel.docs': {
    kind: 'message', ticketCategory: 'operations',
    body: 'For a release you provide: the BL Number (required — the Bill of Lading number) and a DO (Delivery Order) or BL document (photo or PDF) so KTC can verify it before computing charges. It’s optional at filing but must be accepted to move forward. If KTC marks it “Needs a corrected document”, open it, re-upload a clearer/corrected DO/BL, and tap Resubmit document.',
    then: [
      { label: 'How do I file?', to: 'rel.how' },
      { label: 'What happens after?', to: 'rel.after' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'rel.after': {
    kind: 'options',
    say: 'After you file, it moves through: 1) Awaiting document check, 2) Documents verified, 3) Ready for payment, 4) Paid — claim OR at office, 5) Released. Track each live in My Releases. Which step do you want details on?',
    options: [
      { label: 'Document check & “needs correction”', to: 'rel.on_hold' },
      { label: 'How do I pay the charges?', to: 'rel.how_pay' },
      { label: 'Getting the OR & pulling out', to: 'rel.or_pullout' },
      { label: 'Additional charges', to: 'rel.additional' },
      { label: 'Can I cancel a release?', to: 'rel.cancel' },
      { label: 'What do the statuses mean?', to: 'rel.statuses' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'rel.on_hold': {
    kind: 'message', ticketCategory: 'operations',
    body: 'If KTC needs a better document, the release shows “Needs a corrected document” with a note. Open it, choose the corrected/clearer DO or BL (image or PDF), and tap Resubmit document — it goes back to KTC for verification. Until the document is accepted, KTC can’t assess your charges.',
    then: [
      { label: 'Open my releases', to: 'rel.nav' },
      { label: 'Resubmitted but still on hold', to: 'ticket.release' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'rel.how_pay': {
    kind: 'message', ticketCategory: 'payment',
    body: 'When KTC verifies your document and computes charges, the release becomes Ready for payment. Open it for the Amount due, a charges note, and How to pay — KTC’s bank / GCash details and a QRPH QR (scan with any bank or e-wallet app). After paying, upload a clear photo/PDF of your deposit slip and tap Submit to KTC. Once confirmed, it becomes Paid. Rejected proof shows the reason so you can re-upload. You can also pay at the KTC cashier.',
    then: [
      { label: 'Open my releases', to: 'rel.nav' },
      { label: 'I paid but it’s still not confirmed', to: 'ticket.release' },
      { label: 'Estimate charges first (Rates)', to: 'rv.estimate' },
    ],
  },

  'rel.or_pullout': {
    kind: 'message', ticketCategory: 'operations',
    body: 'When KTC confirms your payment, the release becomes “Paid — claim OR at office.” Go to the KTC office to claim your Official Receipt (OR) — that’s what lets you pull out the container. After the OR is recorded, the status turns Released and shows your Official Receipt No. (and ERP invoice no., if recorded). Reminder: any additional charges must all be settled before the OR can be released.',
    then: [
      { label: 'About additional charges', to: 'rel.additional' },
      { label: 'Paid but OR / pull-out problem', to: 'ticket.release' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'rel.additional': {
    kind: 'message', ticketCategory: 'payment',
    body: 'KTC sometimes adds additional charges after assessing your release (separate lines with a label + amount). Each line is paid separately — pay to the same bank account / QR, upload that line’s own receipt, and Submit to KTC. Each shows its own status: Unpaid, Under review, Paid, or Rejected (re-upload if rejected). Important: your OR can’t be released until every additional charge is confirmed.',
    then: [
      { label: 'How do I pay?', to: 'rel.how_pay' },
      { label: 'Open my releases', to: 'rel.nav' },
      { label: 'I dispute a charge / wrong amount', to: 'ticket.release' },
    ],
  },

  'rel.cancel': {
    kind: 'message', ticketCategory: 'operations',
    body: 'You can cancel your own release while it’s Awaiting document check, Documents verified, Ready for payment, or Needs a corrected document — open it and tap Cancel this request (there’s a confirm step; it can’t be undone). Once it’s Paid or Released it can’t be cancelled here — contact KTC for those.',
    then: [
      { label: 'Open my releases', to: 'rel.nav' },
      { label: 'Need to cancel a Paid/Released one', to: 'ticket.release' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'rel.statuses': {
    kind: 'message', ticketCategory: 'operations',
    body: 'Release statuses, in order: Awaiting document check (KTC verifies your DO/BL) · Documents verified (computing charges) · Ready for payment (pay + upload, or pay at the cashier) · Paid — claim OR at office · Released (OR recorded; shows your OR number) · Needs a corrected document (re-upload a clearer DO/BL) · Cancelled.',
    then: [
      { label: 'Open my releases', to: 'rel.nav' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'rel.nav': {
    kind: 'nav', route: '/releases', cta: 'Open Release / Pull-out',
    body: 'Opening Release / Pull-out — track each release live here.',
    then: [{ label: 'Back to menu', to: 'root' }],
  },

  // ── 🪪 Account & verification ─────────────────────────────────────────────
  'acct.root': {
    kind: 'options',
    say: 'What do you need help with on your account?',
    options: [
      { label: 'How do I get approved / accredited?', to: 'acct.get_approved' },
      { label: 'Upload my valid ID', to: 'acct.upload_id' },
      { label: 'Why is my account still pending?', to: 'acct.why_pending' },
      { label: 'What can I do while pending?', to: 'acct.pending_capabilities' },
      { label: 'Change my email, password, or contact', to: 'acct.change_details' },
      { label: 'Document verification', to: 'acct.doc_verification' },
      { label: 'My account says “Action needed” / was rejected', to: 'acct.rejected' },
      { label: 'My account is suspended', to: 'acct.suspended' },
      { label: 'Sign-in / password trouble', to: 'login.help' },
      { label: 'Something else about my account', to: 'ticket.account' },
    ],
  },

  'acct.get_approved': {
    kind: 'message', ticketCategory: 'account',
    body: 'The accreditation flow: 1) Sign up (full name, contact number, email, password), 2) read the KTC Customer Agreement to the end + tick consent + pass the security check, 3) confirm your email and sign in, 4) upload one valid government ID on the Verify ID page, 5) wait for KTC to review and approve (you get an approval email; status becomes Verified). Filing Job Orders unlocks once you’re approved. Important: upload your ID within 48 hours of confirming your email, or the account closes and you re-register.',
    then: [
      { label: 'Upload my valid ID now', to: 'nav.verifyId' },
      { label: 'Why is my account still pending?', to: 'acct.why_pending' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'acct.upload_id': {
    kind: 'message', ticketCategory: 'account',
    body: 'To upload your valid ID, go to the Verify ID page: tick the data-privacy consent, attach a clear photo or PDF of one valid government ID, and tap Submit valid ID for verification (large images are compressed). Past your first sign-in? You can also upload it anytime from the orange banner on your home page. Your uploaded ID is deleted from our servers no later than 3 days after upload (Agreement §4). A KTC admin then reviews and approves.',
    then: [
      { label: 'Open Verify ID', to: 'nav.verifyId' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'acct.why_pending': {
    kind: 'message', ticketCategory: 'account',
    body: '“Pending verification” means a KTC admin still has to review your account. Two usual reasons: you haven’t uploaded a valid ID yet (do it from the home banner or Verify ID — this is what unlocks approval), or you’ve uploaded it and KTC is still reviewing (you’ll get an approval email once verified). Reminder: upload within 48 hours of confirming your email or the account closes. Filing Job Orders unlocks once you’re approved.',
    then: [
      { label: 'Upload my valid ID', to: 'nav.verifyId' },
      { label: 'What can I do while pending?', to: 'acct.pending_capabilities' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'acct.pending_capabilities': {
    kind: 'message', ticketCategory: 'account',
    body: 'While your account is pending, it’s verify-only: you can upload a valid ID, check your status, read the Customer Agreement, and manage your account basics (email/password). Filing Job Orders — plus the Rates calculator, the vessel schedule, and the rest of the portal — unlocks once a KTC admin approves you. Upload your valid ID within 48 hours of confirming your email so the review can start.',
    then: [
      { label: 'How do I get approved?', to: 'acct.get_approved' },
      { label: 'Upload my valid ID', to: 'nav.verifyId' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'acct.doc_verification': {
    kind: 'message', ticketCategory: 'account',
    body: 'Here’s how ID verification works, step by step. 1) After you confirm your email, open the Verify ID screen — or tap “Upload valid ID” on your home banner. 2) Tick the consent box, then attach a clear photo or PDF of a valid government-issued ID (you can review it before sending). 3) Tap Submit for verification. 4) A KTC admin reviews it; you’ll get an approval email once it’s verified, and filing Job Orders unlocks then. Important: upload your ID within 48 hours of confirming your email, or the pending account is closed and you’d have to register again.',
    then: [
      { label: 'Upload my valid ID', to: 'nav.verifyId' },
      { label: 'Ask KTC about my documents', to: 'ticket.account' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'acct.change_details': {
    kind: 'options',
    prompt: 'Which detail do you want to change?',
    options: [
      { label: 'My name', to: 'acct.change_name' },
      { label: 'My contact number', to: 'acct.change_contact' },
      { label: 'My email', to: 'acct.change_email' },
      { label: 'My password', to: 'acct.change_password' },
      { label: 'I forgot my password', to: 'acct.forgot_password' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'acct.change_name': {
    kind: 'message', ticketCategory: 'account',
    body: 'Edit your name in My Account → Personal details, then Save changes. Heads up: if your account is already Verified, changing your legal name sends it back to pending for re-verification — you’ll re-upload a valid ID so KTC can re-check, because your details must match your ID. While it’s pending re-approval, filing Job Orders is locked until KTC approves you again.',
    then: [{ label: 'Open My Account', to: 'nav.account' }, { label: 'Back to menu', to: 'root' }],
  },

  'acct.change_contact': {
    kind: 'message', ticketCategory: 'account',
    body: 'Edit your contact number in My Account → Personal details and Save changes. Changing only your contact number does not affect your verified status — no re-verification needed.',
    then: [{ label: 'Open My Account', to: 'nav.account' }, { label: 'Back to menu', to: 'root' }],
  },

  'acct.change_email': {
    kind: 'message', ticketCategory: 'account',
    body: 'In My Account → Email address, type the new email and tap Send confirmation link. We email a link to the new address — the change only takes effect once you click it, and your current email stays active until you confirm.',
    then: [{ label: 'Open My Account', to: 'nav.account' }, { label: 'Back to menu', to: 'root' }],
  },

  'acct.change_password': {
    kind: 'message', ticketCategory: 'account',
    body: 'In My Account → Password, enter a new password (at least 8 characters) twice and tap Update password. You’ll stay signed in on this device.',
    then: [{ label: 'Open My Account', to: 'nav.account' }, { label: 'I forgot my password', to: 'acct.forgot_password' }],
  },

  'acct.forgot_password': {
    kind: 'message', ticketCategory: 'account',
    body: 'Use Forgot password? on the login page (or Reset it by email in My Account → Password). We email a reset link — open it, set a new password, then sign in. If the email doesn’t arrive, check your spam folder.',
    then: [{ label: 'Reset by email', to: 'nav.forgotPassword' }, { label: 'Back to menu', to: 'root' }],
  },

  'acct.rejected': {
    kind: 'message', ticketCategory: 'account',
    body: 'If your account shows “Action needed”, it was sent back — usually for a small fix. When you open the portal you’ll see KTC’s note (What to update) plus fields to correct your name and contact number and re-upload your valid ID, then Resubmit for review. Just follow the note and resubmit — that’s the fastest path. If you believe it was a mistake, raise it with customer service.',
    then: [
      { label: 'Go to my home page', to: 'nav.home' },
      { label: 'I want to appeal / dispute the rejection', to: 'ticket.account' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'acct.suspended': {
    kind: 'message', ticketCategory: 'account',
    body: 'A suspended account can’t use the portal and isn’t self-recoverable. Please contact KTC customer service — the live contact options (phone / email / Viber / hours) are on the Support page, and they’ll explain the reason and next steps. I can also open a support ticket so a KTC staff member follows up.',
    then: [
      { label: 'See KTC contact options', to: 'nav.support' },
      { label: 'Raise a support ticket', to: 'ticket.account' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'login.help': {
    kind: 'message', ticketCategory: 'account',
    body: 'Signed in but having trouble? A few common ones: the portal signs you out after 30 minutes idle (just sign in again); only one device stays signed in at a time, so a newer login signs the older one out; to change your password use My Account → Password, or Forgot password? on the login page. If you’re fully locked out and can’t even reach this screen, use Forgot password on the login page — or I can open an account ticket.',
    then: [
      { label: 'Reset by email', to: 'nav.forgotPassword' },
      { label: 'Open My Account', to: 'nav.account' },
      { label: 'Open an account ticket', to: 'ticket.account' },
    ],
  },

  'bug.report': {
    kind: 'message', ticketCategory: 'app_system',
    body: 'Sorry about that. First try a quick refresh — most glitches are a stale page (pull to refresh, or close and reopen the app). If it still won’t work, tell me what you were doing and I’ll open a ticket so KTC’s team can fix it.',
    then: [
      { label: 'Report a bug to KTC', to: 'ticket.appSystem' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  // ── 📨 Feedback & concerns ────────────────────────────────────────────────
  // Each option collects one line of free text, then opens a TAGGED ticket:
  // stakeholder concerns → operations; complaint + suggestion → customer_service.
  'feedback.root': {
    kind: 'options',
    say: 'Feedback & concerns — what would you like to raise? I’ll log it as a ticket so KTC follows up.',
    options: [
      { label: 'A concern about Customs', to: 'feedback.customs' },
      { label: 'A concern about a Shipping line', to: 'feedback.shipping' },
      { label: 'A concern about Logistics / trucking', to: 'feedback.logistics' },
      { label: 'A complaint', to: 'feedback.complaint' },
      { label: 'A suggestion', to: 'feedback.suggestion' },
      { label: 'Report an app problem', to: 'bug.report' },
      { label: 'Back to menu', to: 'root' },
    ],
  },

  'feedback.customs': {
    kind: 'input',
    prompt: 'Tell me your concern about Customs in a line or two.',
    placeholder: 'Type your concern…', storeAs: 'feedback', submitLabel: 'Continue',
    next: 'ticket.customs', validate: nonEmpty,
    altOption: { label: 'Back', to: 'feedback.root' },
  },
  'feedback.shipping': {
    kind: 'input',
    prompt: 'Tell me your concern about the shipping line in a line or two.',
    placeholder: 'Type your concern…', storeAs: 'feedback', submitLabel: 'Continue',
    next: 'ticket.shipping', validate: nonEmpty,
    altOption: { label: 'Back', to: 'feedback.root' },
  },
  'feedback.logistics': {
    kind: 'input',
    prompt: 'Tell me your concern about logistics / trucking in a line or two.',
    placeholder: 'Type your concern…', storeAs: 'feedback', submitLabel: 'Continue',
    next: 'ticket.logistics', validate: nonEmpty,
    altOption: { label: 'Back', to: 'feedback.root' },
  },
  'feedback.complaint': {
    kind: 'input',
    prompt: 'I’m sorry to hear that. Tell me your complaint and I’ll log it for KTC.',
    placeholder: 'Type your complaint…', storeAs: 'feedback', submitLabel: 'Continue',
    next: 'ticket.complaint', validate: nonEmpty,
    altOption: { label: 'Back', to: 'feedback.root' },
  },
  'feedback.suggestion': {
    kind: 'input',
    prompt: 'Great — what’s your suggestion? I’ll pass it to KTC.',
    placeholder: 'Type your suggestion…', storeAs: 'feedback', submitLabel: 'Continue',
    next: 'ticket.suggestion', validate: nonEmpty,
    altOption: { label: 'Back', to: 'feedback.root' },
  },

  // ── Ticket leaves ─────────────────────────────────────────────────────────
  'ticket.jobOrder': {
    kind: 'ticket', category: 'job_order',
    subject: { from: 'userText', prefix: 'Job order: ' }, body: { from: 'userText' },
    intro: 'What’s your question about this order? I’ll send it to KTC as a ticket.',
    confirmLabel: 'Create a support ticket', cancelOption: { label: 'Back to menu', to: 'root' },
  },
  'ticket.payment': {
    kind: 'ticket', category: 'payment',
    subject: { from: 'userText', prefix: 'Payment: ' }, body: { from: 'userText' },
    intro: 'What’s your payment question? Please include your JO number, the charge (X-ray / port-services / additional), and the amount + date + reference of your transfer. I’ll send it to KTC’s support team to help with your payment concern.',
    confirmLabel: 'Create a payment ticket', cancelOption: { label: 'Back to menu', to: 'root' },
  },
  'ticket.account': {
    kind: 'ticket', category: 'account',
    subject: { from: 'userText', prefix: 'Account: ' }, body: { from: 'userText' },
    intro: 'What would you like to ask KTC about your account / approval?',
    confirmLabel: 'Create an account ticket', cancelOption: { label: 'Back to menu', to: 'root' },
  },
  'ticket.accreditation': {
    kind: 'ticket', category: 'accreditation',
    subject: { from: 'userText', prefix: 'Consignee: ' }, body: { from: 'userText' },
    intro: 'What’s the consignee you need added or checked? I’ll open a ticket.',
    confirmLabel: 'Create a support ticket', cancelOption: { label: 'Back to menu', to: 'root' },
  },
  'ticket.operations': {
    kind: 'ticket', category: 'operations',
    subject: { from: 'userText', prefix: 'Operations: ' }, body: { from: 'userText' },
    intro: 'Tell me what you need and I’ll open an Operations ticket.',
    confirmLabel: 'Create a support ticket', cancelOption: { label: 'Back to menu', to: 'root' },
  },
  'ticket.release': {
    kind: 'ticket', category: 'operations',
    subject: { from: 'userText', prefix: 'Release: ' }, body: { from: 'userText' },
    intro: 'Tell me what’s happening with your release (and your release no. — REL-… — or the BL number) and I’ll open a ticket so KTC can look into it.',
    confirmLabel: 'Create a support ticket', cancelOption: { label: 'Back to release menu', to: 'rel.root' },
  },
  'ticket.vessel': {
    kind: 'ticket', category: 'operations',
    subject: { fixed: 'Add vessel to schedule' }, body: { from: 'userText' },
    intro: 'I’ll open an Operations ticket asking KTC to add this vessel. Go ahead?',
    confirmLabel: 'Open Operations ticket', cancelOption: { label: 'Back to menu', to: 'root' },
  },
  'ticket.appSystem': {
    kind: 'ticket', category: 'app_system',
    subject: { from: 'userText', prefix: 'Bug report: ' }, body: { from: 'userText' },
    intro: 'Tell me what went wrong (what you tapped, what you saw) and I’ll open a ticket for KTC’s team.',
    confirmLabel: 'Report a bug', cancelOption: { label: 'Back to menu', to: 'root' },
  },

  // Tagged feedback tickets (subject prefix carries the stakeholder tag).
  'ticket.customs': {
    kind: 'ticket', category: 'operations',
    subject: { from: 'userText', prefix: '[Customs] ' }, body: { from: 'userText' },
    intro: 'I’ll log this concern about Customs as a ticket for KTC. Send it?',
    confirmLabel: 'Send to KTC', cancelOption: { label: 'Back', to: 'feedback.root' },
  },
  'ticket.shipping': {
    kind: 'ticket', category: 'operations',
    subject: { from: 'userText', prefix: '[Shipping line] ' }, body: { from: 'userText' },
    intro: 'I’ll log this concern about the shipping line as a ticket for KTC. Send it?',
    confirmLabel: 'Send to KTC', cancelOption: { label: 'Back', to: 'feedback.root' },
  },
  'ticket.logistics': {
    kind: 'ticket', category: 'operations',
    subject: { from: 'userText', prefix: '[Logistics] ' }, body: { from: 'userText' },
    intro: 'I’ll log this logistics / trucking concern as a ticket for KTC. Send it?',
    confirmLabel: 'Send to KTC', cancelOption: { label: 'Back', to: 'feedback.root' },
  },
  'ticket.complaint': {
    kind: 'ticket', category: 'customer_service',
    subject: { from: 'userText', prefix: '[Complaint] ' }, body: { from: 'userText' },
    intro: 'I’ll log your complaint as a ticket so KTC customer service follows up. Send it?',
    confirmLabel: 'Send to KTC', cancelOption: { label: 'Back', to: 'feedback.root' },
  },
  'ticket.suggestion': {
    kind: 'ticket', category: 'customer_service',
    subject: { from: 'userText', prefix: '[Suggestion] ' }, body: { from: 'userText' },
    intro: 'I’ll pass your suggestion to KTC as a ticket. Send it?',
    confirmLabel: 'Send to KTC', cancelOption: { label: 'Back', to: 'feedback.root' },
  },

  // ── Navigation leaves (routes verified in App.tsx) ────────────────────────
  'nav.myOrders': { kind: 'nav', route: '/job-orders', cta: 'Open My Job Orders', body: 'Here are all your Job Orders with their live status and balances.' },
  'nav.requests': { kind: 'nav', route: '/requests', cta: 'Open My Requests', body: 'Here are your consignee requests and their approval status.' },
  'nav.newJO': { kind: 'nav', route: '/job-order', cta: 'Open New Job Order', body: 'Let’s file it.' },
  'nav.newJO.draft': { kind: 'nav', route: '/job-order?laraDraft=1', cta: 'Open New Job Order', body: 'Your Lara draft is ready on the form.' },
  'nav.support': { kind: 'nav', route: '/support', cta: 'Open Support', body: 'Your tickets and live-agent contact options are here.' },
  'nav.account': { kind: 'nav', route: '/account', cta: 'Open My Account', body: 'Manage your name, contact, email and password here.' },
  'nav.verifyId': { kind: 'nav', route: '/verify-id', cta: 'Open Verify ID', body: 'Upload your valid ID here.' },
  'nav.home': { kind: 'nav', route: '/', cta: 'Go to my home page', body: 'This is your portal home.' },
  'nav.forgotPassword': { kind: 'nav', route: '/forgot-password', cta: 'Reset by email', body: 'We’ll email you a reset link.' },
}
