# KTC Portal Customer Chatbot — Unified, Implementation-Ready Spec

A deterministic, **NO-AI / NO-LLM** decision tree + keyword matcher, mounted as a floating
widget in the **customer `Shell` only**. Every answer is hand-written and grounded in the
live app. Anything the tree can't resolve **falls back to a real support ticket**
(`open_ticket`), pre-filled with a meaningful category + the user's own words.

This single doc supersedes the seven area drafts + `engine.md` and folds in every fix from
`critique.md`. Where the drafts disagreed, the resolution is recorded in **§1**.

---

## 1 · Decisions resolved from the critique (read first)

| # | Conflict / gap | Resolution baked into this spec |
|---|----------------|----------------------------------|
| D1 | **String model**: engine.md used inline `Localized {en,tl}`; the rest used `t('English')` keys | **Use `t('English')` keys** (the user's instruction + house pattern). Every string field in `NODES` is an English string that doubles as the i18n key. Tagalog lives in `translations.ts` (full table in **§11**). The widget renders copy via the app's `t()`. |
| D2 | **Two `trackOrder` implementations** (engine.md `.or()` vs tracking.md `.eq()`) | **Adopt tracking.md's `.eq('jo_number', …).maybeSingle()`** with the full column set + `joPaymentState(data)` for the money pill. The engine.md hand-rolled `payment_status==='rejected'` check is **deleted**. (Fixes Corr #1.) |
| D3 | **Raw `.or()` interpolation** violated the repo's `orSafe` invariant | Moot — the `.eq('jo_number', …)` form is **parameterized**, no string interpolation, no `orSafe` needed. (Fixes Corr #2.) |
| D4 | **Track by entry_number?** prompts disagreed; entry_number isn't unique | **Track by JO number only.** Prompt + query agree. Held drafts (no JO number) 0-row → not-found copy routes them to `/job-orders`. Entry-number lookup is **deferred** (non-unique; needs `orSafe` + ordering). (Fixes Overlap #1.3.) |
| D5 | **Ticket fallback described two ways** (inline `open_ticket` vs `NAV /support` + "prefill") | **One model: inline `open_ticket` `ticket` nodes.** `SupportTickets.tsx` has **no** URL-param prefill, so "navigate + prefill" is impossible. All "prefill" wording on NAV-to-support nodes is **removed**; those become real `ticket` nodes. (Fixes Overlap #2 / Corr #4.) |
| D6 | **Invalid categories** `billing` / `payments/billing` | Use **`payment`** (rate/charge) or **`operations`** (missing vessel / release). Only the 8 real keys are used. (Fixes Corr #3.) |
| D7 | **3 matcher targets had no node** (`consignee.add`, `login.help`, `bug.report`); id mismatch with `filing.consignee_missing` | All three are **authored** (§7), each ending in a ticket. Filing's consignee content is folded into the canonical id **`consignee.add`**. (Fixes Gap #2.) |
| D8 | **Bot is Shell-only (signed-in)** but account/login nodes implied sign-in help | `login.help` is **scoped to "you're signed in but having trouble"** (idle logout, single-session eviction, change/forgot password). True pre-auth ("can't reach the login screen / 48h lapsed / unconfirmed email") is acknowledged with a one-liner pointing to the **login page's Forgot-password** + an account ticket — the bot never claims to fix a sign-in you can't get past. (Fixes Gap #1.) |
| D9 | **RPS defined twice** (rates + payments) | **`pay.rps` owns it**; `rv.root`'s "What is RPS?" links to `pay.rps`. (Fixes Overlap #3.) |
| D10 | **Hardcoded contact** in suspended node | No hardcoded numbers. `acct.suspended` + `contact.info` route to **`/support`** (which renders the admin-managed `support_contact` live-agent block) and offer a ticket. (Fixes Corr #5.) |
| D11 | Missing coverage | Added **`order.editcancel`** (Gap #3), **`order.print`** (Gap #4), **`contact.info`** (Gap #5), **`order.notifications`** (Gap #6). |
| D12 | **Vessel-not-listed appears in filing AND rates** | **One shared node `vessel.missing`** → `ticket.vessel` (operations). DRY. |
| D13 | Tile count | **6 topic tiles** + a standing **"Talk to a person"** quick-reply (the always-on text input is the 7th path). |

---

## 2 · TypeScript shape (`src/components/chat/types.ts`)

> Every `string` below that holds copy is an **English `t()` key**. The widget resolves it
> with the app's `t(...)` at render time. No `{en,tl}` objects in the data.

```ts
export type NodeId = string

/** The 8 real categories — mirror CATEGORIES in SupportTickets.tsx exactly. */
export type TicketCategory =
  | 'app_system' | 'customer_service' | 'operations' | 'account'
  | 'accreditation' | 'job_order' | 'payment' | 'other'

export type ActionName = 'trackOrder'

/** A tappable quick-reply / tile. `label` is a t() key. */
export interface ChatOption {
  label: string            // t() key
  to: NodeId
  glyph?: string           // optional emoji for tile chrome
}

interface NodeBase {
  id: NodeId
  /** bot bubble(s) shown on entry, before the interactive part. t() key(s). */
  say?: string | string[]
}

/** message — a canned answer with optional quick-reply follow-ups. */
export interface MessageNode extends NodeBase {
  kind: 'message'
  body: string                     // t() key
  then?: ChatOption[]
  ticketCategory?: TicketCategory  // category used if this dead-ends into a ticket
}

/** options — a set of buttons → child nodes (the root tiles use this). */
export interface OptionsNode extends NodeBase {
  kind: 'options'
  prompt?: string                  // t() key
  options: ChatOption[]
  layout?: 'tiles' | 'list'
}

/** input — capture one line, validate, stash to state.vars[storeAs], jump to next. */
export interface InputNode extends NodeBase {
  kind: 'input'
  prompt: string
  placeholder?: string
  storeAs: string
  submitLabel: string
  next: NodeId
  /** pure, synchronous; returns a t() key as the error. */
  validate?: (raw: string) => { ok: true; value: string } | { ok: false; error: string }
  altOption?: ChatOption
}

/** nav — send the user into the real app at a route; renders a CTA that navigates + closes. */
export interface NavNode extends NodeBase {
  kind: 'nav'
  body: string
  route: string                    // must exist in App.tsx
  cta: string
  then?: ChatOption[]
}

/** action — a deterministic, RLS-scoped DB lookup. Handler is a NAMED fn (no code-in-data). */
export interface ActionNode extends NodeBase {
  kind: 'action'
  action: ActionName
}

/** ticket — the fallback. Opens a real ticket via open_ticket(), pre-filled. */
export interface TicketNode extends NodeBase {
  kind: 'ticket'
  category: TicketCategory
  /** subject (<=120): from the user's last free-typed line, or a fixed t() key. */
  subject: { from: 'userText'; prefix?: string } | { fixed: string }
  /** first message body: the user's own words, an auto path-summary, or fixed copy. */
  body: { from: 'userText' } | { from: 'transcript' } | { fixed: string }
  intro: string                    // consent bubble before we create it
  confirmLabel: string
  cancelOption?: ChatOption
}

export type ChatNode =
  | MessageNode | OptionsNode | InputNode | NavNode | ActionNode | TicketNode

export type NodeRegistry = Record<NodeId, ChatNode>
```

### State + walker (`src/components/chat/useChat.ts`)

```ts
export interface ChatState {
  open: boolean
  currentNodeId: NodeId            // starts 'root'
  history: Turn[]                  // rendered transcript
  vars: Record<string, string>     // captured inputs (jo, …)
  lastUserText: string | null      // most recent free-typed line — seeds tickets
  pendingCategory: TicketCategory | null  // a matcher near-miss carries its category here
  busy: boolean                    // an action/ticket RPC in flight
}
```

`useReducer`-driven. Pure except two async edges: `runAction` (calls `ACTIONS[node.action]`)
and `openTicket` (calls `open_ticket`). Entering a node pushes its `say` bubbles + a
`controls` turn; tapping an option pushes a `user` turn (the option's resolved label) then
`goTo(option.to)`.

---

## 3 · The TILES (root entry — what shows when the chat opens)

`root` is an `options` node, `layout:'tiles'`, with **6 topic tiles**. A standing
**"Talk to a person"** quick-reply sits under the tiles, and the always-on text input is the
free-text path. Tiles map 1:1 to the six content areas.

| Glyph | Tile label (t() key) | → node | Topic / ticket category if it dead-ends |
|-------|----------------------|--------|------------------------------------------|
| 📦 | **File a Job Order** | `file.how` | `job_order` |
| 🔎 | **Track an order** | `track.input` | `job_order` |
| 💳 | **Charges & payment** | `pay.root` | `payment` |
| 🚢 | **Rates, vessels & Last Free Day** | `rv.root` | `operations` |
| 📤 | **Container release / pull-out** | `rel.root` | `operations` |
| 🪪 | **Account & verification** | `acct.root` | `account` |
| 🧑‍💼 | **Talk to a person** (standing quick-reply) | `ticket.fromHere` | `customer_service` |

`root.say`: **"Hi! I'm the KTC assistant. Pick a topic, or just type your question."**

---

## 4 · Free-text matcher (`src/components/chat/match.ts`)

Always-on text input. On submit: push a `user` turn, set `lastUserText`, then:

1. If `raw` matches the JO-number regex `^JO-?\d{1,6}$` (case-insensitive) → set `vars.jo`
   and `goTo('track.run')` directly (typing a JO number IS a track request).
2. Else `const hit = matchText(raw)`. If a hit → set `pendingCategory = hit.category`,
   `goTo(hit.to)`.
3. Else → `goTo('nomatch')` (keeps `lastUserText` for the ticket; default category
   `customer_service`).

```ts
export interface TopicMatcher { to: NodeId; category: TicketCategory; keywords: string[] }

export const MATCHERS: TopicMatcher[] = [
  { to: 'track.input',  category: 'job_order',
    keywords: ['track','status','where is my','saan na','status ng order','jo-','update ng'] },
  { to: 'file.how',     category: 'job_order',
    keywords: ['file','new order','mag-file','gumawa ng order','paano mag','submit order','x-ray request','dea','oog'] },
  { to: 'pay.root',     category: 'payment',
    keywords: ['pay','payment','bayad','magkano','charge','vat','gcash','deposit slip','invoice','balance','singil','receipt','or'] },
  { to: 'rv.root',      category: 'operations',
    keywords: ['vessel','voyage','schedule','last free day','lfd','barko','storage','demurrage','rate','rates','calculator','estimate','rps'] },
  { to: 'rel.root',     category: 'operations',
    keywords: ['release','pull-out','pullout','do','bl','bill of lading','claim','kuha ng container','gate pass'] },
  { to: 'acct.root',    category: 'account',
    keywords: ['verify','valid id','approval','approve','pending','id upload','re-verify','account approved','accredit','register','sign up'] },
  { to: 'consignee.add', category: 'accreditation',
    keywords: ['consignee','2303','add consignee','bagong consignee','master list'] },
  { to: 'login.help',   category: 'account',
    keywords: ['login','log in','password','locked out','sign out','idle','session','hindi maka-login','logged out'] },
  { to: 'bug.report',   category: 'app_system',
    keywords: ['bug','error','not working','broken','crash','blank','hindi gumagana','ayaw mag-load'] },
]

/** Score by matched stems; require >=1. Ties → earliest matcher. */
export function matchText(raw: string): TopicMatcher | null {
  const s = raw.toLowerCase()
  let best: { m: TopicMatcher; score: number } | null = null
  for (const m of MATCHERS) {
    const score = m.keywords.reduce((n, k) => (s.includes(k) ? n + 1 : n), 0)
    if (score > 0 && (!best || score > best.score)) best = { m, score }
  }
  return best?.m ?? null
}
```

---

## 5 · Deterministic actions (`src/components/chat/actions.ts`)

There is exactly **one** action. It is read-only and **RLS-scoped** (no `customer_id`
filter, no service role, no RPC — the `job_orders` SELECT policy already limits results to
the caller's own rows; `0055` weaves `session_alive()` into `current_broker_id()`).

### 5.1 `trackOrder` — the exact query

```ts
import { joPaymentState } from '../../lib/joPayment'   // single source of truth for the money pill

/** "JO12" / "jo-000123" / "123" / "000123" → "JO-000123"; '' if no digits. */
function normalizeJo(raw: string): string {
  const digits = (raw.match(/\d+/g)?.join('') ?? '')
  if (!digits) return ''
  return 'JO-' + digits.padStart(6, '0').slice(-6)
}

export interface ActionResult { bubbles: string[]; options: ChatOption[] }   // bubbles = t() keys

export const trackOrder: ActionFn = async (vars, { supabase }) => {
  const jo = normalizeJo(vars.jo ?? '')
  if (!jo) {
    return { bubbles: ['I need a JO number like JO-000123 to look that up.'],
             options: [{ label: 'Try another number', to: 'track.input' },
                       { label: 'See all my orders', to: 'nav.myOrders' }] }
  }
  const { data, error } = await supabase
    .from('job_orders')
    .select(
      'jo_number, status, payment_status, rps_status, rps_payment_status, ' +
      'completed_at, vessel_name, voyage_number, ' +
      'consignee:consignees(name), supplements:jo_supplements(payment_status)'
    )
    .eq('jo_number', jo)        // PARAMETERIZED — no interpolation, no orSafe needed
    .maybeSingle()              // 0 or 1 row; jo_number is unique per caller under RLS

  if (error) {
    return { bubbles: ["Hmm, I couldn't check that right now. Want me to open a ticket so KTC can look?"],
             options: [{ label: 'Yes, open a ticket', to: 'ticket.jobOrder' },
                       { label: 'Try again', to: 'track.input' },
                       { label: 'Back to menu', to: 'root' }] }
  }
  if (!data) {                  // not found / not yours / still a Draft (no JO number)
    return { bubbles: [`I couldn't find order ${jo} on your account. If it's still a Draft it has no JO number yet — check My Job Orders.`],
             options: [{ label: 'Open My Job Orders', to: 'nav.myOrders' },
                       { label: 'Try another number', to: 'track.input' },
                       { label: 'Talk to KTC', to: 'ticket.jobOrder' }] }
  }

  const pay = joPaymentState(data)                       // 'none' | 'balance' | 'paid'
  const who = data.consignee?.name ?? '—'
  const vessel = data.vessel_name
    ? data.vessel_name + (data.voyage_number ? ' · ' + data.voyage_number : '') : '—'

  const bubbles: string[] = [
    // header — interpolated via t(): t('Order {jo}\nConsignee: {who}\nVessel: {vessel}', {…})
    'Order {jo} — Consignee: {who} — Vessel: {vessel}',     // (rendered with t(key, vars))
    STATUS_LINE[data.status] ?? data.status,                // §5.2
    PAY_LINE[pay],                                          // §5.2
  ]
  return { bubbles, options: [
    { label: 'Open this order', to: 'nav.myOrders' },
    { label: 'What does this status mean?', to: 'status.glossary' },
    { label: 'Track another', to: 'track.input' },
    { label: 'Back to menu', to: 'root' },
  ] }
}

export const ACTIONS: Record<ActionName, ActionFn> = { trackOrder }
```

The header bubble is rendered as `t('Order {jo} — Consignee: {who} — Vessel: {vessel}', { jo, who, vessel })`.

### 5.2 Status + payment lines (t() keys; reused by the glossary)

```ts
const STATUS_LINE: Record<string, string> = {
  held:       'Pending approval — saved as a Draft (no JO number yet).',
  submitted:  'Submitted — in KTC’s queue. You can still Edit or Cancel it.',
  processing: 'Approved · processing — you can print the A6 slip and the base charge is now payable.',
  on_hold:    'On hold — KTC needs info. Open the order, fix the flagged fields, add a reply, and Resubmit.',
  completed:  'Completed — all services done. Settle any balance and claim your OR / Service Invoice at the KTC office.',
  rejected:   'Not approved — this order is closed and can’t be resubmitted. File a new one if you still need it.',
  cancelled:  'Cancelled.',
}
const PAY_LINE: Record<'none'|'balance'|'paid', string> = {
  none:    'Payment: nothing to pay yet — waiting for KTC to review and set charges.',
  balance: 'Payment: Balance to pay — something is still owed (base, RPS, and/or additional charges).',
  paid:    'Payment: Paid — fully settled.',
}
```

### 5.3 Navigation leaves (deterministic `navigate(route)` — every route verified in `App.tsx`)

| Node id | route | CTA label (t() key) | body (t() key) |
|---------|-------|---------------------|----------------|
| `nav.myOrders` | `/job-orders` | Open My Job Orders | Here are all your Job Orders with their live status and balances. |
| `nav.newJO` | `/job-order` | Open New Job Order | Let’s file it. |
| `nav.support` | `/support` | Open Support | Your tickets and live-agent contact options are here. |
| `nav.account` | `/account` | Open My Account | Manage your name, contact, email and password here. |
| `nav.verifyId` | `/verify-id` | Open Verify ID | Upload your valid ID here. |
| `nav.home` | `/` | Go to my home page | This is your portal home. |
| `nav.forgotPassword` | `/forgot-password` | Reset by email | We’ll email you a reset link. |
| `rv.estimate` | `/calculator` | Open Rates calculator | (rich body — §7 rates) |
| `rv.vessels` | `/vessels` | Open Vessel Schedule | (rich body — §7 rates) |
| `rel.nav` | `/releases` | Open Release / Pull-out | Opening Release / Pull-out. |

> Tapping a NAV CTA calls `navigate(route)` then `setState(open:false)` — the app page takes over.

---

## 6 · Ticket fallback (`open_ticket`) — exact call + per-node pre-fill

**The real API (verified verbatim in `SupportTickets.tsx` `createTicket`):**

```ts
const { data, error } = await supabase.rpc('open_ticket', {
  p_subject,    // string, <=120 chars (the UI's maxLength)
  p_category,   // one of the 8 TicketCategory keys
  p_body,       // string — becomes the FIRST message on the ticket (atomic)
})
// data: string (the new ticket id / uuid) on success.
```

**Widget executor** (`openTicket(node, state)`):

```ts
async function openTicket(node: TicketNode, st: ChatState, runtimeCategory?: TicketCategory) {
  const userText = (st.lastUserText ?? '').trim()
  const cat = runtimeCategory ?? st.pendingCategory ?? node.category
  const subject = ('fixed' in node.subject)
    ? t(node.subject.fixed)
    : (t(node.subject.prefix ?? '') + (userText || t('Help request'))).slice(0, 120)
  const body = node.body.from === 'userText'   ? (userText || t(node.intro))
             : node.body.from === 'transcript' ? summariseTranscript(st)   // path the user took
             : t((node.body as { fixed: string }).fixed)

  const { data, error } = await supabase.rpc('open_ticket', { p_subject: subject, p_category: cat, p_body: body })

  if (error || typeof data !== 'string') {
    // fallback-of-the-fallback: surface admin-managed contact, never strand the user
    const { data: c } = await supabase.from('support_contact').select('key, value')
    pushBot(t("I couldn't create the ticket. You can reach KTC directly:"))
    pushContactLinks(c)   // tel:/mailto: from support_contact (phone/email/sms/viber/hours)
    return
  }
  const ref = data.slice(0, 8).toUpperCase()
  pushBot(t('Done — ticket #{ref} is open. KTC will reply in your Support tab; I’ll take you there.', { ref }))
  pushControls([{ label: 'Open Support', to: 'nav.support' }, { label: 'Back to menu', to: 'root' }])
}
```

**Pre-fill per ticket node** (subject + first message + category):

| Ticket node | category | subject | first message (`p_body`) |
|-------------|----------|---------|--------------------------|
| `ticket.fromHere` | `customer_service` (or `pendingCategory` from a matcher near-miss) | `Chat: ` + user's words | user's words |
| `ticket.jobOrder` | `job_order` | `Job order: ` + user's words | user's words |
| `ticket.payment` | `payment` | `Payment: ` + user's words | user's words |
| `ticket.account` | `account` | `Account: ` + user's words | user's words |
| `ticket.accreditation` | `accreditation` | `Consignee: ` + user's words | user's words |
| `ticket.operations` | `operations` | `Operations: ` + user's words | user's words |
| `ticket.release` | `operations` | `Release: ` + user's words | user's words |
| `ticket.vessel` | `operations` | fixed: `Add vessel to schedule` | transcript (asks for vessel name + voyage in one line) |
| `ticket.appSystem` | `app_system` | `Bug report: ` + user's words | user's words |

Every ticket node carries `intro`, `confirmLabel` (= **"Create a support ticket"** unless
noted), and `cancelOption` → `root`. The bot only ever **opens** a new ticket (single,
well-understood write); replies/escalation happen on `/support`.

---

## 7 · The full node registry (`src/components/chat/nodes.ts`)

> All `string` fields are English `t()` keys. Bodies are tightened for chat (1–3 sentences);
> the Tagalog for every one is in **§11**. Quick-reply lists below show **`label → to`**.

### 7.0 Engine-critical

```ts
'root': { kind:'options', layout:'tiles',
  say:'Hi! I’m the KTC assistant. Pick a topic, or just type your question.',
  options:[
    { glyph:'📦', label:'File a Job Order',                 to:'file.how' },
    { glyph:'🔎', label:'Track an order',                   to:'track.input' },
    { glyph:'💳', label:'Charges & payment',                to:'pay.root' },
    { glyph:'🚢', label:'Rates, vessels & Last Free Day',   to:'rv.root' },
    { glyph:'📤', label:'Container release / pull-out',      to:'rel.root' },
    { glyph:'🪪', label:'Account & verification',            to:'acct.root' },
    { glyph:'🧑‍💼', label:'Talk to a person',                 to:'ticket.fromHere' },
  ] },

'nomatch': { kind:'options',
  say:'Hmm, I’m not sure I understood that. I can connect you with the KTC team — they’ll reply right here in your tickets.',
  options:[
    { glyph:'🎫', label:'Create a support ticket', to:'ticket.fromHere' },
    { glyph:'↩', label:'Show me the main menu',    to:'root' },
  ] },

'ticket.fromHere': { kind:'ticket', category:'customer_service',
  subject:{ from:'userText', prefix:'Chat: ' }, body:{ from:'userText' },
  intro:'I’ll open a ticket with what you typed so a person can pick it up. Sound good?',
  confirmLabel:'Create a support ticket',
  cancelOption:{ label:'No, back to menu', to:'root' } },
```

### 7.1 Filing  (area: `filing.md`)

```ts
'file.how': { kind:'message', ticketCategory:'job_order',
  body:'To file a Job Order, open New Job Order: 1) pick the consignee (type a few letters; not listed? tap Request new consignee and file anyway), 2) enter your Entry Number (your C-… number), 3) pick the Vessel & Voyage, 4) add containers — one row each, choose its service (X-Ray, DEA, OOG); use Bulk paste for a long list. Review, then Confirm. Verified accounts get a JO number on submit.',
  then:[
    { label:'Open New Job Order',       to:'nav.newJO' },
    { label:'What do I need to file?',  to:'file.requirements' },
    { label:'What services can I request?', to:'file.services' },
    { label:'Can I file while pending?', to:'file.pending' },
    { label:'Back to menu',             to:'root' },
  ] },

'file.requirements': { kind:'message', ticketCategory:'job_order',
  body:'You need four things: the Consignee (from KTC’s master list), your Entry Number (C-… customs number), the Vessel & Voyage (from KTC’s current schedule — you can’t type a new one), and at least one Container (its number + the service it needs).',
  then:[
    { label:'My vessel isn’t listed',        to:'vessel.missing' },
    { label:'My consignee isn’t in the list', to:'consignee.add' },
    { label:'Back to menu',                  to:'root' },
  ] },

'file.services': { kind:'message', ticketCategory:'job_order',
  body:'Each container row gets its own service. KTC’s services include X-Ray (X-ray inspection), DEA (examination), OOG Stripping (out-of-gauge cargo), and combinations like X-Ray + DEA. The dropdown shows whatever KTC currently offers — go by what’s listed when you file.',
  then:[
    { label:'Which service does my shipment need?', to:'file.which_service' },
    { label:'Estimate the charges first',           to:'rv.estimate' },
    { label:'Back to menu',                         to:'root' },
  ] },

'file.which_service': { kind:'message', ticketCategory:'operations',
  body:'Which service a container needs depends on your shipment and customs requirements — that’s an operational call I can’t decide here. Pick the service you’ve been instructed to request, or let me open a ticket so KTC can advise.',
  then:[
    { label:'Ask KTC which service to use', to:'ticket.operations' },
    { label:'Back to menu',                 to:'root' },
  ] },

'file.supplement': { kind:'message', ticketCategory:'payment',
  body:'A supplement is an additional charge KTC tags onto your order after it’s filed — numbered like JO-0123-A, -B, -C. Each has its own amount and its own payment, shown under additional charges as “Balance to pay.” You pay it like the base charge. Every supplement must be paid before the order can be completed. You don’t add supplements — KTC does.',
  then:[
    { label:'See my orders & balances', to:'nav.myOrders' },
    { label:'Back to menu',             to:'root' },
  ] },

'file.pending': { kind:'message', ticketCategory:'account',
  body:'Yes — you can file Job Orders while your account is still pending. They’re saved as held (“Draft — no number yet”, up to 10) and sent to KTC automatically the moment you’re approved. But held orders can’t be processed until you pass final verification — upload a valid ID. Heads up: upload it within 48 hours of confirming your email, or the account closes and you re-register.',
  then:[
    { label:'How do I upload my valid ID?', to:'acct.upload_id' },
    { label:'Back to menu',                 to:'root' },
  ] },

'consignee.add': { kind:'message', ticketCategory:'accreditation',
  body:'No problem. On the consignee step, tap Request new consignee and enter its details. It’s tagged “pending KTC approval”, but you can still file the order now — KTC verifies the consignee on their side. You don’t have to wait.',
  then:[
    { label:'Start a Job Order',         to:'nav.newJO' },
    { label:'Ask KTC about a consignee', to:'ticket.accreditation' },
    { label:'Back to menu',              to:'root' },
  ] },

'vessel.missing': { kind:'options',   // shared by filing + rates
  say:'Only KTC operations can add a vessel — you can’t add one yourself. If your vessel/voyage isn’t in the dropdown, it usually hasn’t been entered yet (or its Last Free Day passed). I can log a ticket so KTC adds it.',
  options:[
    { label:'Open an Operations ticket',  to:'ticket.vessel' },
    { label:'Check the vessel schedule',  to:'rv.vessels' },
    { label:'Back to menu',               to:'root' },
  ] },

'ticket.vessel': { kind:'ticket', category:'operations',
  subject:{ fixed:'Add vessel to schedule' }, body:{ from:'transcript' },
  intro:'Tell me the vessel name & voyage in one line, then I’ll open the ticket.',
  confirmLabel:'Open Operations ticket',
  cancelOption:{ label:'Back to menu', to:'root' } },

'ticket.jobOrder':     { kind:'ticket', category:'job_order',
  subject:{ from:'userText', prefix:'Job order: ' }, body:{ from:'userText' },
  intro:'What’s your question about this order? I’ll send it to KTC as a ticket.',
  confirmLabel:'Create a support ticket', cancelOption:{ label:'Back to menu', to:'root' } },

'ticket.operations':   { kind:'ticket', category:'operations',
  subject:{ from:'userText', prefix:'Operations: ' }, body:{ from:'userText' },
  intro:'Tell me what you need and I’ll open an Operations ticket.',
  confirmLabel:'Create a support ticket', cancelOption:{ label:'Back to menu', to:'root' } },

'ticket.accreditation':{ kind:'ticket', category:'accreditation',
  subject:{ from:'userText', prefix:'Consignee: ' }, body:{ from:'userText' },
  intro:'What’s the consignee you need added or checked? I’ll open a ticket.',
  confirmLabel:'Create a support ticket', cancelOption:{ label:'Back to menu', to:'root' } },
```

### 7.2 Tracking & orders  (area: `tracking.md`)

```ts
'track.input': { kind:'input',
  prompt:'What’s the JO number? (e.g. JO-000123)',
  placeholder:'JO-000123', storeAs:'jo', submitLabel:'Track', next:'track.run',
  validate:(raw)=> /\d/.test(raw) ? { ok:true, value:raw.trim() }
    : { ok:false, error:'Please enter a JO number like JO-000123.' },
  altOption:{ label:'I don’t have it — see all my orders', to:'nav.myOrders' } },

'track.run': { kind:'action', action:'trackOrder' },   // renders bubbles + options from §5.1

'status.glossary': { kind:'message', ticketCategory:'job_order',
  body:'What each status means — Pending approval (Draft, no number yet) · Submitted (in the queue; you can Edit/Cancel) · Approved · processing (services running; print the A6 slip; base charge payable) · On hold (KTC needs info — fix the flagged fields and Resubmit) · Completed (services done; settle any balance, claim your OR) · Not approved (closed, no resubmit) · Cancelled. Tip: My Job Orders auto-refreshes every minute.',
  then:[
    { label:'Track an order by number', to:'track.input' },
    { label:'See all my orders',        to:'nav.myOrders' },
    { label:'Edit or cancel an order',  to:'order.editcancel' },
    { label:'Back to menu',             to:'root' },
  ] },

'order.editcancel': { kind:'message', ticketCategory:'job_order',
  body:'You can Edit or Cancel your own order only while it’s Submitted (before KTC starts processing) — open it in My Job Orders. If it’s On hold, open it, fix the fields KTC flagged, add a reply, and Resubmit. Once it’s Approved · processing it locks; once Rejected it’s closed (file a new one). Cancelling is confirmed and can’t be undone.',
  then:[
    { label:'Open My Job Orders', to:'nav.myOrders' },
    { label:'Talk to KTC',        to:'ticket.jobOrder' },
    { label:'Back to menu',       to:'root' },
  ] },

'order.print': { kind:'message', ticketCategory:'job_order',
  body:'Once an order is Approved · processing you can print its A6 service slip: open the order in My Job Orders and tap Print slip. It’s a mini KTC service slip — the official numbered Service Invoice / OR still comes from the KTC office.',
  then:[
    { label:'Open My Job Orders', to:'nav.myOrders' },
    { label:'Back to menu',       to:'root' },
  ] },

'order.notifications': { kind:'message', ticketCategory:'customer_service',
  body:'When KTC replies or your order changes, you’ll get a notification — tap the 🔔 bell in the top bar to see them. Ticket replies also show on the Support page. Statuses update on their own in My Job Orders (every minute, or tap ↻ Refresh).',
  then:[
    { label:'Open Support',       to:'nav.support' },
    { label:'Open My Job Orders', to:'nav.myOrders' },
    { label:'Back to menu',       to:'root' },
  ] },
```

### 7.3 Payments  (area: `payments.md`)

```ts
'pay.root': { kind:'options',
  say:'Payments & invoices — what do you need?',
  options:[
    { label:'How do I pay?',                 to:'pay.how' },
    { label:'Bank / GCash / QRPH details',   to:'pay.details' },
    { label:'How do I upload my proof?',     to:'pay.upload' },
    { label:'What happens after I pay?',     to:'pay.after' },
    { label:'What’s the Service Invoice / OR?', to:'pay.invoice' },
    { label:'Why is there still a balance?', to:'pay.balance' },
    { label:'My payment was rejected',       to:'pay.rejected' },
    { label:'Open my payment page',          to:'nav.myOrders' },
  ] },

'pay.how': { kind:'message', ticketCategory:'payment',
  body:'Each Job Order has its own payment page. Open My Job Orders, find the order, and tap Balances (or View charges). You’ll see the exact computation — X-Ray rate × containers + 12% VAT + flat admin & print fees — plus KTC’s bank / GCash details and the QRPH code. Pay by transfer or e-wallet, then upload your deposit slip for KTC to review. Payment never blocks processing, and you can always pay at the KTC cashier.',
  then:[
    { label:'Open My Job Orders',       to:'nav.myOrders' },
    { label:'Estimate my charges first', to:'rv.estimate' },
    { label:'How do I upload the proof?', to:'pay.upload' },
  ] },

'pay.details': { kind:'message', ticketCategory:'payment',
  body:'KTC’s bank account, account name/number, and the QRPH code are shown right on each order’s payment page (under How to pay) — they’re KTC-managed, so what you see there is always current. Open My Job Orders → Balances to see them. The QR is QRPH: scan it with any bank or e-wallet app (GCash, Maya, etc.). If details aren’t posted yet, the page says so — just pay at the KTC cashier. For your security, KTC never DMs separate account numbers — trust only what’s on the portal.',
  then:[
    { label:'Open My Job Orders',           to:'nav.myOrders' },
    { label:'How do I upload the proof?',    to:'pay.upload' },
    { label:'The details aren’t showing',    to:'ticket.payment' },
  ] },

'pay.upload': { kind:'message', ticketCategory:'payment',
  body:'After paying by transfer or GCash: open My Job Orders → Balances, go to the charge section you’re paying (X-ray, port-services / RPS, or an additional charge), pick a clear photo or PDF of your receipt under Upload, then tap Submit to KTC. Each charge block is uploaded and reviewed separately — repeat for each. The status changes to “Your proof is with KTC for review.”',
  then:[
    { label:'Open My Job Orders',         to:'nav.myOrders' },
    { label:'What happens after I submit?', to:'pay.after' },
    { label:'My upload won’t go through',  to:'ticket.payment' },
  ] },

'pay.after': { kind:'message', ticketCategory:'payment',
  body:'After you upload, the charge shows “Your proof is with KTC for review.” KTC either confirms it (“✓ Confirmed by KTC”) or rejects it with a short reason so you can re-upload. When all charges are confirmed, the order flips from Balance to pay to Paid. Once your X-ray is done and the balance is fully paid, the page shows “Cleared for release” — collect your gate pass / official Service Invoice at the KTC office.',
  then:[
    { label:'What’s the Service Invoice / OR?', to:'pay.invoice' },
    { label:'It was rejected — I disagree',     to:'pay.rejected' },
    { label:'Open My Job Orders',               to:'nav.myOrders' },
  ] },

'pay.invoice': { kind:'message', ticketCategory:'payment',
  body:'The official Service Invoice is the BIR-registered document issued by KTC (not the portal), recorded at the KTC office. The portal just shows its number once recorded: “Official Receipt No. <no>” if you paid cash/OR, or “Billed on account — Billing Invoice No. <no>” on credit. The in-app charges page is only the computation + your proof. Pay online or at the cashier — either way the official invoice/OR is issued at the office when your container is released.',
  then:[
    { label:'Where do I see my invoice number?', to:'nav.myOrders' },
    { label:'My invoice number looks wrong',     to:'ticket.payment' },
    { label:'Back to menu',                      to:'root' },
  ] },

'pay.balance': { kind:'message', ticketCategory:'payment',
  body:'Your order shows “Balance to pay” until everything on it is settled — the base X-ray charge, any port-services (RPS) charge ops assessed, and any additional charges KTC added. Each is paid and confirmed separately, so if one block is still unpaid, submitted (under review), or rejected, the balance stays. Open My Job Orders → Balances to see which block is outstanding. When all are confirmed, it switches to Paid.',
  then:[
    { label:'Open My Job Orders',                  to:'nav.myOrders' },
    { label:'What is a port-services (RPS) charge?', to:'pay.rps' },
    { label:'I already paid but it still shows a balance', to:'ticket.payment' },
  ] },

'pay.rps': { kind:'message', ticketCategory:'payment',   // RPS canonical owner (D9)
  body:'RPS covers the port-services moves a Job Order may need beyond a plain X-ray — DEA / inspection work where the van is opened: lift on, trucking, shifting, stripping, stuffing. KTC’s checker assesses each order; most are plain X-ray and need none, but if yours needs these moves, KTC charges them per move on top of the base X-ray. RPS isn’t in the Rate Calculator (quoted per request). You’ll see any RPS charge under Balances before you pay.',
  then:[
    { label:'Open My Job Orders',         to:'nav.myOrders' },
    { label:'How do I upload the proof?', to:'pay.upload' },
    { label:'Back to menu',               to:'root' },
  ] },

'pay.rejected': { kind:'message', ticketCategory:'payment',
  body:'When KTC can’t accept a proof, the charge shows “Your proof wasn’t accepted” with a short reason (wrong amount, unclear image, or it doesn’t match the total). The fix is usually quick: open My Job Orders → Balances, read the note, re-upload a clearer/corrected slip on that same charge, and Submit to KTC again. If you believe the rejection is a mistake — the amount IS correct — open a ticket and KTC will look into it.',
  then:[
    { label:'Re-upload a corrected slip',        to:'nav.myOrders' },
    { label:'I disagree — open a support ticket', to:'ticket.payment' },
    { label:'Back to menu',                      to:'root' },
  ] },

'ticket.payment': { kind:'ticket', category:'payment',
  subject:{ from:'userText', prefix:'Payment: ' }, body:{ from:'userText' },
  intro:'What’s your payment question? Please include your JO number, the charge (X-ray / port-services / additional), and the amount + date + reference of your transfer. I’ll send it to the KTC cashier team.',
  confirmLabel:'Create a payment ticket', cancelOption:{ label:'Back to menu', to:'root' } },
```

### 7.4 Rates, vessels & Last Free Day  (area: `rates-vessels.md`)

```ts
'rv.root': { kind:'options',
  say:'Rates, charges, and the vessel schedule — what do you need?',
  options:[
    { label:'How do I estimate my charges?', to:'rv.estimate' },
    { label:'What is the Last Free Day?',    to:'rv.lfd' },
    { label:'Where’s the vessel schedule?',  to:'rv.vessels' },
    { label:'My vessel isn’t on the list',   to:'vessel.missing' },
    { label:'What is RPS?',                  to:'pay.rps' },     // D9 link
    { label:'Something else',                to:'ticket.operations' },
  ] },

'rv.estimate': { kind:'nav', route:'/calculator', cta:'Open Rates calculator',
  body:'Estimate charges anytime in the Rate Calculator — no filing needed. Three steps: 1) Shipment details (line, vessel & voyage — this also sets your route and storage Last Free Day), 2) Containers (size, empty/full, dry/reefer, qty), 3) Ancillary services (DEA, electrical/reefer). Tap Generate estimate: terminal charges + 12% VAT + flat admin & print fee. It’s a guide only — the official amount is on the KTC Service Invoice.',
  then:[
    { label:'Why does my estimate show “—”?', to:'rv.estimate_dash' },
    { label:'Back to menu',                   to:'root' },
  ] },

'rv.estimate_dash': { kind:'message', ticketCategory:'payment',
  body:'A “—” next to a line means KTC hasn’t set that rate yet for your exact size × empty/full × dry/reefer × route — it’s not ₱0, it’s just not in the estimate. Your total still sums the lines that do have rates. Some services (RPS, equipment rental, stripping) aren’t in the calculator at all — they’re quoted per request. Need a figure for a “—” line? KTC can give it to you.',
  then:[
    { label:'Ask KTC for a rate',  to:'ticket.payment' },
    { label:'Back to menu',        to:'root' },
  ] },

'rv.lfd': { kind:'message', ticketCategory:'operations',
  body:'The Last Free Day (LFD) is the last day of free storage for a vessel call — KTC computes it as finish-discharging date + that shipping line’s free days. Up to the LFD, storage is free; after it, storage charges accrue per day until you pick up the container. Each call has its own LFD — see it on the Vessel Schedule (highlighted on every card) and in the Rate Calculator.',
  then:[
    { label:'View the vessel schedule', to:'rv.vessels' },
    { label:'Estimate my storage',      to:'rv.estimate' },
    { label:'Back to menu',             to:'root' },
  ] },

'rv.vessels': { kind:'nav', route:'/vessels', cta:'Open Vessel Schedule',
  body:'The Vessel Schedule shows KTC’s current calls — vessel, voyage, line, arrival, finish discharging, Last Free Day, and berth. It’s read-only (KTC operations maintains it) with Cards, Table, and Calendar views, plus a Show past/cancelled toggle. It’s the same list you pick from when filing a Job Order.',
  then:[
    { label:'My vessel isn’t listed',   to:'vessel.missing' },
    { label:'What is the Last Free Day?', to:'rv.lfd' },
    { label:'Back to menu',             to:'root' },
  ] },
```

### 7.5 Container release / pull-out  (area: `release.md`)

```ts
'rel.root': { kind:'options',
  say:'Container release / pull-out — what do you need?',
  options:[
    { label:'How do I file a release?',         to:'rel.how' },
    { label:'What documents do I need? (DO / BL)', to:'rel.docs' },
    { label:'What happens after I file?',       to:'rel.after' },
    { label:'Additional charges',               to:'rel.additional' },
    { label:'What do the statuses mean?',        to:'rel.statuses' },
    { label:'Open my releases',                 to:'rel.nav' },
    { label:'Something else / I have a problem', to:'ticket.release' },
  ] },

'rel.how': { kind:'message', ticketCategory:'operations',
  body:'Filing a release is online — no queue. Go to Release / Pull-out → File a release: 1) pick the Consignee (or Request a new consignee and file anyway), 2) enter the BL Number (required), 3) attach a photo/PDF of your DO or BL (optional at filing, but KTC verifies it before assessing charges, so attach it now). Tap File release. Note: your account must be fully approved first — a pending account can’t file a release yet.',
  then:[
    { label:'Open Release / Pull-out', to:'rel.nav' },
    { label:'What happens next?',      to:'rel.after' },
    { label:'My account isn’t approved yet', to:'rel.not_approved' },
  ] },

'rel.not_approved': { kind:'message', ticketCategory:'account',
  body:'To file a release your account must be fully approved (a pending account can’t — this is stricter than Job Orders). If you’ve uploaded your valid ID, wait for KTC’s approval email. If not, upload one valid government ID from the banner on your home page within 48 hours of confirming your email, or the account closes. Once approved, the File a release form opens up.',
  then:[
    { label:'Go to my home page',       to:'nav.home' },
    { label:'Still stuck — contact KTC', to:'ticket.account' },
    { label:'Back to menu',             to:'root' },
  ] },

'rel.docs': { kind:'message', ticketCategory:'operations',
  body:'For a release you provide: the BL Number (required — the Bill of Lading number) and a DO (Delivery Order) or BL document (photo or PDF) so KTC can verify it before computing charges. It’s optional at filing but must be accepted to move forward. If KTC marks it “Needs a corrected document”, open it, re-upload a clearer/corrected DO/BL, and tap Resubmit document.',
  then:[
    { label:'How do I file?',             to:'rel.how' },
    { label:'What happens after?',        to:'rel.after' },
    { label:'Back to menu',               to:'root' },
  ] },

'rel.after': { kind:'options',
  say:'After you file, it moves through: 1) Awaiting document check, 2) Documents verified, 3) Ready for payment, 4) Paid — claim OR at office, 5) Released. Track each live in My Releases. Which step do you want details on?',
  options:[
    { label:'Document check & “needs correction”', to:'rel.on_hold' },
    { label:'How do I pay the charges?',           to:'rel.how_pay' },
    { label:'Getting the OR & pulling out',        to:'rel.or_pullout' },
    { label:'Additional charges',                  to:'rel.additional' },
    { label:'Can I cancel a release?',             to:'rel.cancel' },
  ] },

'rel.on_hold': { kind:'message', ticketCategory:'operations',
  body:'If KTC needs a better document, the release shows “Needs a corrected document” with a note. Open it, choose the corrected/clearer DO or BL (image or PDF), and tap Resubmit document — it goes back to KTC for verification. Until the document is accepted, KTC can’t assess your charges.',
  then:[
    { label:'Open my releases',           to:'rel.nav' },
    { label:'Resubmitted but still on hold', to:'ticket.release' },
    { label:'Back to menu',               to:'root' },
  ] },

'rel.how_pay': { kind:'message', ticketCategory:'payment',
  body:'When KTC verifies your document and computes charges, the release becomes Ready for payment. Open it for the Amount due, a charges note, and How to pay — KTC’s bank / GCash details and a QRPH QR (scan with any bank or e-wallet app). After paying, upload a clear photo/PDF of your deposit slip and tap Submit to KTC. Once confirmed, it becomes Paid. Rejected proof shows the reason so you can re-upload. You can also pay at the KTC cashier.',
  then:[
    { label:'Open my releases',               to:'rel.nav' },
    { label:'I paid but it’s still not confirmed', to:'ticket.release' },
    { label:'Estimate charges first (Rates)', to:'rv.estimate' },
  ] },

'rel.or_pullout': { kind:'message', ticketCategory:'operations',
  body:'When KTC confirms your payment, the release becomes “Paid — claim OR at office.” Go to the KTC office to claim your Official Receipt (OR) — that’s what lets you pull out the container. After the OR is recorded, the status turns Released and shows your Official Receipt No. (and ERP invoice no., if recorded). Reminder: any additional charges must all be settled before the OR can be released.',
  then:[
    { label:'About additional charges',         to:'rel.additional' },
    { label:'Paid but OR / pull-out problem',   to:'ticket.release' },
    { label:'Back to menu',                     to:'root' },
  ] },

'rel.additional': { kind:'message', ticketCategory:'payment',
  body:'KTC sometimes adds additional charges after assessing your release (separate lines with a label + amount). Each line is paid separately — pay to the same bank account / QR, upload that line’s own receipt, and Submit to KTC. Each shows its own status: Unpaid, Under review, Paid, or Rejected (re-upload if rejected). Important: your OR can’t be released until every additional charge is confirmed.',
  then:[
    { label:'How do I pay?',              to:'rel.how_pay' },
    { label:'Open my releases',           to:'rel.nav' },
    { label:'I dispute a charge / wrong amount', to:'ticket.release' },
  ] },

'rel.cancel': { kind:'message', ticketCategory:'operations',
  body:'You can cancel your own release while it’s Awaiting document check, Documents verified, Ready for payment, or Needs a corrected document — open it and tap Cancel this request (there’s a confirm step; it can’t be undone). Once it’s Paid or Released it can’t be cancelled here — contact KTC for those.',
  then:[
    { label:'Open my releases',                 to:'rel.nav' },
    { label:'Need to cancel a Paid/Released one', to:'ticket.release' },
    { label:'Back to menu',                     to:'root' },
  ] },

'rel.statuses': { kind:'message', ticketCategory:'operations',
  body:'Release statuses, in order: Awaiting document check (KTC verifies your DO/BL) · Documents verified (computing charges) · Ready for payment (pay + upload, or pay at the cashier) · Paid — claim OR at office · Released (OR recorded; shows your OR number) · Needs a corrected document (re-upload a clearer DO/BL) · Cancelled.',
  then:[
    { label:'Open my releases', to:'rel.nav' },
    { label:'Back to menu',     to:'root' },
  ] },

'rel.nav': { kind:'nav', route:'/releases', cta:'Open Release / Pull-out',
  body:'Opening Release / Pull-out — track each release live here.',
  then:[{ label:'Back to menu', to:'root' }] },

'ticket.release': { kind:'ticket', category:'operations',
  subject:{ from:'userText', prefix:'Release: ' }, body:{ from:'userText' },
  intro:'Tell me what’s happening with your release (and your release no. — REL-… — or the BL number) and I’ll open a ticket so KTC can look into it.',
  confirmLabel:'Create a support ticket', cancelOption:{ label:'Back to release menu', to:'rel.root' } },
```

### 7.6 Account, verification & accreditation  (area: `account.md`)

```ts
'acct.root': { kind:'options',
  say:'What do you need help with on your account?',
  options:[
    { label:'How do I get approved / accredited?', to:'acct.get_approved' },
    { label:'Upload my valid ID',                  to:'acct.upload_id' },
    { label:'Why is my account still pending?',    to:'acct.why_pending' },
    { label:'What can I do while pending?',         to:'acct.pending_capabilities' },
    { label:'Change my email, password, or contact', to:'acct.change_details' },
    { label:'My account says “Action needed” / was rejected', to:'acct.rejected' },
    { label:'My account is suspended',             to:'acct.suspended' },
    { label:'Sign-in / password trouble',          to:'login.help' },
    { label:'Something else about my account',     to:'ticket.account' },
  ] },

'acct.get_approved': { kind:'message', ticketCategory:'account',
  body:'The accreditation flow: 1) Sign up (full name, contact number, email, password), 2) read the KTC Customer Agreement to the end + tick consent + pass the security check, 3) confirm your email and sign in, 4) upload one valid government ID on the Verify ID page, 5) wait for KTC to review and approve (you get an approval email; status becomes Verified). You can file Job Orders while you wait — held as Draft (up to 10) and sent automatically on approval. Important: upload your ID within 48 hours of confirming your email, or the account closes and you re-register.',
  then:[
    { label:'Upload my valid ID now',           to:'nav.verifyId' },
    { label:'Why is my account still pending?', to:'acct.why_pending' },
    { label:'Back to menu',                     to:'root' },
  ] },

'acct.upload_id': { kind:'message', ticketCategory:'account',
  body:'To upload your valid ID, go to the Verify ID page: tick the data-privacy consent, attach a clear photo or PDF of one valid government ID, and tap Submit valid ID for verification (large images are compressed). Past your first sign-in? You can also upload it anytime from the orange banner on your home page. Your uploaded ID is deleted from our servers no later than 3 days after upload (Agreement §4). A KTC admin then reviews and approves.',
  then:[
    { label:'Open Verify ID', to:'nav.verifyId' },
    { label:'Back to menu',   to:'root' },
  ] },

'acct.why_pending': { kind:'message', ticketCategory:'account',
  body:'“Pending verification” means a KTC admin still has to review your account. Two usual reasons: you haven’t uploaded a valid ID yet (do it from the home banner or Verify ID — this is what unlocks approval), or you’ve uploaded it and KTC is still reviewing (you’ll get an approval email once verified). Reminder: upload within 48 hours of confirming your email or the account closes. You can keep filing meanwhile — orders stay held until you’re approved.',
  then:[
    { label:'Upload my valid ID',         to:'nav.verifyId' },
    { label:'What can I do while pending?', to:'acct.pending_capabilities' },
    { label:'Back to menu',               to:'root' },
  ] },

'acct.pending_capabilities': { kind:'message', ticketCategory:'account',
  body:'A pending (not-yet-verified) account already has the full portal. While you wait you can browse, use the Rates calculator, check Vessels, and file Job Orders — they’re saved as held (Draft — no number yet, up to 10) and sent to KTC automatically the moment you’re approved (they can’t be processed until then). Once verified, your held orders go live and each gets its permanent JO number.',
  then:[
    { label:'How do I get approved?', to:'acct.get_approved' },
    { label:'Upload my valid ID',     to:'nav.verifyId' },
    { label:'Back to menu',           to:'root' },
  ] },

'acct.change_details': { kind:'options',
  prompt:'Which detail do you want to change?',
  options:[
    { label:'My name',                  to:'acct.change_name' },
    { label:'My contact number',        to:'acct.change_contact' },
    { label:'My email',                 to:'acct.change_email' },
    { label:'My password',              to:'acct.change_password' },
    { label:'I forgot my password',     to:'acct.forgot_password' },
  ] },

'acct.change_name': { kind:'message', ticketCategory:'account',
  body:'Edit your name in My Account → Personal details, then Save changes. Heads up: if your account is already Verified, changing your legal name sends it back to pending for re-verification — you’ll re-upload a valid ID so KTC can re-check, because your details must match your ID. Any Job Orders you file meanwhile are held until you’re re-approved.',
  then:[ { label:'Open My Account', to:'nav.account' }, { label:'Back to menu', to:'root' } ] },

'acct.change_contact': { kind:'message', ticketCategory:'account',
  body:'Edit your contact number in My Account → Personal details and Save changes. Changing only your contact number does not affect your verified status — no re-verification needed.',
  then:[ { label:'Open My Account', to:'nav.account' }, { label:'Back to menu', to:'root' } ] },

'acct.change_email': { kind:'message', ticketCategory:'account',
  body:'In My Account → Email address, type the new email and tap Send confirmation link. We email a link to the new address — the change only takes effect once you click it, and your current email stays active until you confirm.',
  then:[ { label:'Open My Account', to:'nav.account' }, { label:'Back to menu', to:'root' } ] },

'acct.change_password': { kind:'message', ticketCategory:'account',
  body:'In My Account → Password, enter a new password (at least 8 characters) twice and tap Update password. You’ll stay signed in on this device.',
  then:[ { label:'Open My Account', to:'nav.account' }, { label:'I forgot my password', to:'acct.forgot_password' } ] },

'acct.forgot_password': { kind:'message', ticketCategory:'account',
  body:'Use Forgot password? on the login page (or Reset it by email in My Account → Password). We email a reset link — open it, set a new password, then sign in. If the email doesn’t arrive, check your spam folder.',
  then:[ { label:'Reset by email', to:'nav.forgotPassword' }, { label:'Back to menu', to:'root' } ] },

'acct.rejected': { kind:'message', ticketCategory:'account',
  body:'If your account shows “Action needed”, it was sent back — usually for a small fix. When you open the portal you’ll see KTC’s note (What to update) plus fields to correct your name and contact number and re-upload your valid ID, then Resubmit for review. Just follow the note and resubmit — that’s the fastest path. If you believe it was a mistake, raise it with customer service.',
  then:[
    { label:'Go to my home page',                   to:'nav.home' },
    { label:'I want to appeal / dispute the rejection', to:'ticket.account' },
    { label:'Back to menu',                         to:'root' },
  ] },

'acct.suspended': { kind:'message', ticketCategory:'account',   // D10 — no hardcoded contact
  body:'A suspended account can’t use the portal and isn’t self-recoverable. Please contact KTC customer service — the live contact options (phone / email / Viber / hours) are on the Support page, and they’ll explain the reason and next steps. I can also open a support ticket so a KTC staff member follows up.',
  then:[
    { label:'See KTC contact options', to:'nav.support' },
    { label:'Raise a support ticket',  to:'ticket.account' },
    { label:'Back to menu',            to:'root' },
  ] },

'login.help': { kind:'message', ticketCategory:'account',   // D8 — signed-in scope
  body:'Signed in but having trouble? A few common ones: the portal signs you out after 30 minutes idle (just sign in again); only one device stays signed in at a time, so a newer login signs the older one out; to change your password use My Account → Password, or Forgot password? on the login page. If you’re fully locked out and can’t even reach this screen, use Forgot password on the login page — or I can open an account ticket.',
  then:[
    { label:'Reset by email',     to:'nav.forgotPassword' },
    { label:'Open My Account',    to:'nav.account' },
    { label:'Open an account ticket', to:'ticket.account' },
  ] },

'bug.report': { kind:'message', ticketCategory:'app_system',   // D7
  body:'Sorry about that. First try a quick refresh — most glitches are a stale page (pull to refresh, or close and reopen the app). If it still won’t work, tell me what you were doing and I’ll open a ticket so KTC’s team can fix it.',
  then:[
    { label:'Report a bug to KTC', to:'ticket.appSystem' },
    { label:'Back to menu',        to:'root' },
  ] },

'contact.info': { kind:'message', ticketCategory:'customer_service',   // D11 / Gap #5
  body:'KTC’s phone, email, Viber, and office hours are on the Support page (the live-agent block) — they’re kept up to date by KTC. You can reach the team there, or I can open a ticket and KTC will reply in your Support tab.',
  then:[
    { label:'See KTC contact options', to:'nav.support' },
    { label:'Open a support ticket',   to:'ticket.fromHere' },
    { label:'Back to menu',            to:'root' },
  ] },

'ticket.account': { kind:'ticket', category:'account',
  subject:{ from:'userText', prefix:'Account: ' }, body:{ from:'userText' },
  intro:'What would you like to ask KTC about your account / approval?',
  confirmLabel:'Create an account ticket', cancelOption:{ label:'Back to menu', to:'root' } },

'ticket.appSystem': { kind:'ticket', category:'app_system',
  subject:{ from:'userText', prefix:'Bug report: ' }, body:{ from:'userText' },
  intro:'Tell me what went wrong (what you tapped, what you saw) and I’ll open a ticket for KTC’s team.',
  confirmLabel:'Report a bug', cancelOption:{ label:'Back to menu', to:'root' } },
```

### 7.7 Navigation leaves (data form of §5.3)

```ts
'nav.myOrders':       { kind:'nav', route:'/job-orders',     cta:'Open My Job Orders', body:'Here are all your Job Orders with their live status and balances.' },
'nav.newJO':          { kind:'nav', route:'/job-order',      cta:'Open New Job Order',  body:'Let’s file it.' },
'nav.support':        { kind:'nav', route:'/support',        cta:'Open Support',        body:'Your tickets and live-agent contact options are here.' },
'nav.account':        { kind:'nav', route:'/account',        cta:'Open My Account',     body:'Manage your name, contact, email and password here.' },
'nav.verifyId':       { kind:'nav', route:'/verify-id',      cta:'Open Verify ID',      body:'Upload your valid ID here.' },
'nav.home':           { kind:'nav', route:'/',               cta:'Go to my home page',  body:'This is your portal home.' },
'nav.forgotPassword': { kind:'nav', route:'/forgot-password', cta:'Reset by email',     body:'We’ll email you a reset link.' },
```

---

## 8 · Node inventory (stable ids)

**74 nodes total** — by kind: **options 9 · message 44 · input 1 · action 1 · nav 10 · ticket 9.**

- **options (9):** `root`, `nomatch`, `vessel.missing`, `pay.root`, `rv.root`, `rel.root`, `rel.after`, `acct.root`, `acct.change_details`
- **input (1):** `track.input`
- **action (1):** `track.run`
- **nav (10):** `nav.myOrders`, `nav.newJO`, `nav.support`, `nav.account`, `nav.verifyId`, `nav.home`, `nav.forgotPassword`, `rv.estimate`, `rv.vessels`, `rel.nav`
- **ticket (9):** `ticket.fromHere`, `ticket.jobOrder`, `ticket.payment`, `ticket.account`, `ticket.accreditation`, `ticket.operations`, `ticket.release`, `ticket.vessel`, `ticket.appSystem`
- **message (44):** `file.how`, `file.requirements`, `file.services`, `file.which_service`, `file.supplement`, `file.pending`, `consignee.add`, `status.glossary`, `order.editcancel`, `order.print`, `order.notifications`, `pay.how`, `pay.details`, `pay.upload`, `pay.after`, `pay.invoice`, `pay.balance`, `pay.rps`, `pay.rejected`, `rv.estimate_dash`, `rv.lfd`, `rel.how`, `rel.not_approved`, `rel.docs`, `rel.on_hold`, `rel.how_pay`, `rel.or_pullout`, `rel.additional`, `rel.cancel`, `rel.statuses`, `acct.get_approved`, `acct.upload_id`, `acct.why_pending`, `acct.pending_capabilities`, `acct.change_name`, `acct.change_contact`, `acct.change_email`, `acct.change_password`, `acct.forgot_password`, `acct.rejected`, `acct.suspended`, `login.help`, `bug.report`, `contact.info`

---

## 9 · Engine + launcher (component plan)

```
src/components/chat/
  ChatWidget.tsx     // FAB + glass panel + reducer wiring; portals to document.body; mounted in Shell
  useChat.ts         // useReducer: goTo / tap / type / submit; async edges runAction + openTicket
  nodes.ts           // NodeRegistry — the whole tree (§7)
  match.ts           // MATCHERS + matchText() (§4)
  actions.ts         // ACTIONS: { trackOrder }, normalizeJo, STATUS_LINE, PAY_LINE (§5)
  types.ts           // interfaces (§2)
```

**Walker.** `goTo(id)` pushes the node's `say` bubbles + a `controls` turn and sets
`currentNodeId`. For an `action` node it runs `ACTIONS[node.action](vars,{supabase,t})` and
pushes a `result` turn (bubbles + options rendered via `t()`). For a `nav` node the CTA calls
`navigate(route)` + `setState(open:false)`. For a `ticket` node, the confirm button runs
`openTicket` (§6).

**Rendering copy.** The widget holds `const { t } = useT()` and resolves every node string
with `t(stringKey, vars?)` — labels, prompts, bodies, CTAs, status/pay lines, ticket
intros. No `{en,tl}` objects anywhere; Tagalog is dictionary-only (§11). Bot bubbles that
embed values (the track header, the "ticket #{ref}" line) use `t(key, vars)` interpolation.

**Launcher widget (`ChatWidget.tsx`).**
- A floating action button (FAB) `💬`, bottom-right, that opens a `ktc-glass` panel
  (~360×520) with: header ("KTC Assistant" + close ✕), a scrolling transcript, the current
  node's interactive controls, and an always-on text input wired to the matcher.
- **Portals to `document.body`** (like `BottomNav`) so `position:fixed` is measured against
  the viewport and isn't trapped by an ancestor `transform`/`backdrop-filter`.
- **FAB offset:** `right:16px; bottom: calc(var(--tabbar-h,64px) + 16px + env(safe-area-inset-bottom))`
  so it clears the bottom tab bar at every width.
- First-open pulse once per browser session (`sessionStorage 'ktc_chat_seen'`), mirroring the
  tour pattern.
- Reuse existing classes: `ktc-glass`, `ktc-chip`, `ktc-btn`, `ktc-btn-secondary`,
  `ktc-input`. Detailed visual polish is the UI area's job (apply the anti-slop tokens).

**Mount point — customer `Shell` ONLY** (`src/components/Shell.tsx`). Add next to
`BottomNav`, inside the `!locked` area so suspended/rejected users (who get `PendingPanel`)
don't see it:

```tsx
import ChatWidget from './chat/ChatWidget'
// …
      {!locked && <BottomNav />}
      {!locked && <ChatWidget />}      {/* customer shell only; clears the tab bar */}
      {idleWarning && <IdleWarning />}
```

- **Not** in `AdminShell.tsx`, `app/AppLayout.tsx`, or any staff PWA shell — staff never see
  it. (Because `Calculator` swaps to `AdminShell` for admin viewers, an admin on `/calculator`
  still gets no widget — correct.)
- No new route, no new table, no migration. The bot reuses `open_ticket`, `job_orders`,
  `support_contact`, and `joPaymentState` exactly as the app already does.

---

## 10 · Invariants the engine guarantees

1. **No dead ends.** Every terminal node offers at least "Back to menu" and, where an answer
   might not satisfy, a "Still need help? → ticket" path. Unmatched free text → `nomatch` →
   ticket.
2. **Every fallback is a real ticket** via `open_ticket(p_subject,p_category,p_body)` — the
   user's own words become the first message; category is meaningful (never blindly `other`).
3. **Grounded, never invented.** Each answer maps to verified app behaviour; statuses/labels
   mirror `MyJobOrders.tsx`; the money pill is `joPaymentState` (single source of truth).
4. **Customer-only surface.** Mounted in `Shell` only; absent from every staff/admin shell.
5. **Scoped reads only.** The one action (`trackOrder`) is read-only, RLS-scoped,
   parameterized (`.eq`); the bot writes only via the ticket RPCs.
6. **i18n via `t()`.** Every string is an English key resolved by the live `lang`; Tagalog is
   dictionary-only.

---

## 11 · New i18n strings (English key → Tagalog) for `translations.ts`

House style: conversational Taglish; UI/industry terms stay English (Job Order, container,
X-Ray, DEA, OOG, consignee, vessel, voyage, Last Free Day, RPS, OR, Service Invoice, GCash,
QRPH, valid ID, JO number, entry number, Verify ID, My Account, Balances). Keys that already
exist in `translations.ts` (e.g. "Back to menu" duplicates of existing nav copy) should be
reused, not re-added — verify before inserting.

### 11.1 Chrome, tiles, shared quick-replies

| English key | Tagalog |
|-------------|---------|
| KTC Assistant | KTC Assistant |
| Help | Tulong |
| Hi! I’m the KTC assistant. Pick a topic, or just type your question. | Hi! Ako ang KTC assistant. Pumili ng topic, o i-type lang ang tanong mo. |
| File a Job Order | Mag-file ng Job Order |
| Track an order | I-track ang order |
| Charges & payment | Charges at bayad |
| Rates, vessels & Last Free Day | Rates, vessels at Last Free Day |
| Container release / pull-out | Container release / pull-out |
| Account & verification | Account at verification |
| Talk to a person | Makipag-usap sa tao |
| Back to menu | Balik sa menu |
| Back to release menu | Balik sa release menu |
| Show me the main menu | Ipakita ang main menu |
| Create a support ticket | Gumawa ng support ticket |
| Open Support | Buksan ang Support |
| Open My Job Orders | Buksan ang My Job Orders |
| Open My Account | Buksan ang My Account |
| Open Verify ID | Buksan ang Verify ID |
| Open New Job Order | Buksan ang New Job Order |
| Go to my home page | Pumunta sa home page ko |
| Reset by email | I-reset via email |
| Open Rates calculator | Buksan ang Rates calculator |
| Open Vessel Schedule | Buksan ang Vessel Schedule |
| Open Release / Pull-out | Buksan ang Release / Pull-out |
| Talk to KTC | Kausapin ang KTC |
| Done — ticket #{ref} is open. KTC will reply in your Support tab; I’ll take you there. | Ayos — bukas na ang ticket #{ref}. Sasagot ang KTC sa Support tab mo; dadalhin kita doon. |
| I couldn't create the ticket. You can reach KTC directly: | Hindi ko nagawa ang ticket. Pwede mong direktang i-contact ang KTC: |
| Help request | Tulong na kahilingan |

### 11.2 Nomatch + generic ticket

| English key | Tagalog |
|-------------|---------|
| Hmm, I’m not sure I understood that. I can connect you with the KTC team — they’ll reply right here in your tickets. | Hmm, parang hindi ko ’yon na-gets. Pwede kitang ikonekta sa KTC team — sasagot sila dito mismo sa tickets mo. |
| I’ll open a ticket with what you typed so a person can pick it up. Sound good? | Mag-o-open ako ng ticket gamit ang sinulat mo para may taong sumagot. Okay ba? |
| No, back to menu | Wag na, balik sa menu |
| Chat: | Chat: |

### 11.3 Track action (status/pay lines + interactive)

| English key | Tagalog |
|-------------|---------|
| What’s the JO number? (e.g. JO-000123) | Ano ang JO number? (hal. JO-000123) |
| Track | I-track |
| Please enter a JO number like JO-000123. | Pakilagay ang JO number, hal. JO-000123. |
| I don’t have it — see all my orders | Wala ako nito — tingnan lahat ng orders |
| I need a JO number like JO-000123 to look that up. | Kailangan ko ng JO number tulad ng JO-000123 para ma-check ’yan. |
| Try another number | Subukan ang ibang number |
| See all my orders | Tingnan lahat ng orders ko |
| Hmm, I couldn't check that right now. Want me to open a ticket so KTC can look? | Hmm, hindi ko ma-check ngayon. Gusto mo bang mag-open ng ticket para tingnan ng KTC? |
| Yes, open a ticket | Oo, mag-open ng ticket |
| Try again | Subukan ulit |
| I couldn't find order {jo} on your account. If it's still a Draft it has no JO number yet — check My Job Orders. | Wala akong nakitang order na {jo} sa account mo. Kung Draft pa, wala pang JO number — tingnan sa My Job Orders. |
| Order {jo} — Consignee: {who} — Vessel: {vessel} | Order {jo} — Consignee: {who} — Vessel: {vessel} |
| Open this order | Buksan ’tong order |
| What does this status mean? | Ano’ng ibig sabihin ng status na ’to? |
| Track another | Mag-track ulit |
| Pending approval — saved as a Draft (no JO number yet). | Naghihintay ng approval — naka-save bilang Draft (wala pang JO number). |
| Submitted — in KTC’s queue. You can still Edit or Cancel it. | Submitted — nasa queue na ng KTC. Pwede mo pang i-Edit o i-Cancel. |
| Approved · processing — you can print the A6 slip and the base charge is now payable. | Approved · processing — pwede mo nang i-print ang A6 slip at babayaran na ang base charge. |
| On hold — KTC needs info. Open the order, fix the flagged fields, add a reply, and Resubmit. | On hold — may kailangan ang KTC. Buksan ang order, ayusin ang naka-flag na fields, mag-reply, at i-Resubmit. |
| Completed — all services done. Settle any balance and claim your OR / Service Invoice at the KTC office. | Completed — tapos na lahat ng services. Bayaran ang balance kung meron at kunin ang OR / Service Invoice sa KTC office. |
| Not approved — this order is closed and can’t be resubmitted. File a new one if you still need it. | Hindi na-approve — sarado na ’tong order at hindi na ma-resubmit. Mag-file ng bago kung kailangan pa. |
| Cancelled. | Kinansela. |
| Payment: nothing to pay yet — waiting for KTC to review and set charges. | Bayad: wala pang babayaran — hinihintay pa ang KTC na i-review at i-set ang charges. |
| Payment: Balance to pay — something is still owed (base, RPS, and/or additional charges). | Bayad: Balance to pay — may natitira pang bayarin (base, RPS, at/o additional charges). |
| Payment: Paid — fully settled. | Bayad: Paid — bayad na lahat. |

### 11.4 Status glossary + orders

| English key | Tagalog |
|-------------|---------|
| What each status means — Pending approval (Draft, no number yet) · Submitted (in the queue; you can Edit/Cancel) · Approved · processing (services running; print the A6 slip; base charge payable) · On hold (KTC needs info — fix the flagged fields and Resubmit) · Completed (services done; settle any balance, claim your OR) · Not approved (closed, no resubmit) · Cancelled. Tip: My Job Orders auto-refreshes every minute. | Ibig sabihin ng bawat status — Pending approval (Draft, walang number) · Submitted (nasa queue; pwedeng Edit/Cancel) · Approved · processing (ginagawa na ang services; i-print ang A6 slip; babayaran na ang base charge) · On hold (may kailangan ang KTC — ayusin ang naka-flag at i-Resubmit) · Completed (tapos na; bayaran ang balance, kunin ang OR) · Not approved (sarado, walang resubmit) · Cancelled. Tip: kusang nire-refresh ang My Job Orders kada minuto. |
| Track an order by number | Mag-track gamit ang JO number |
| Edit or cancel an order | I-edit o i-cancel ang order |
| You can Edit or Cancel your own order only while it’s Submitted (before KTC starts processing) — open it in My Job Orders. If it’s On hold, open it, fix the fields KTC flagged, add a reply, and Resubmit. Once it’s Approved · processing it locks; once Rejected it’s closed (file a new one). Cancelling is confirmed and can’t be undone. | Pwede mo lang i-Edit o i-Cancel ang sarili mong order habang Submitted pa (bago simulan ng KTC) — buksan sa My Job Orders. Kung On hold, buksan, ayusin ang fields na naka-flag, mag-reply, at i-Resubmit. Pag Approved · processing na, naka-lock na; pag Rejected, sarado na (mag-file ng bago). Ang pag-cancel ay may confirm at hindi na mababawi. |
| Once an order is Approved · processing you can print its A6 service slip: open the order in My Job Orders and tap Print slip. It’s a mini KTC service slip — the official numbered Service Invoice / OR still comes from the KTC office. | Pag Approved · processing na ang order, pwede mo nang i-print ang A6 service slip nito: buksan ang order sa My Job Orders at i-tap ang Print slip. Mini KTC service slip lang ito — galing pa rin sa KTC office ang opisyal na numbered Service Invoice / OR. |
| When KTC replies or your order changes, you’ll get a notification — tap the 🔔 bell in the top bar to see them. Ticket replies also show on the Support page. Statuses update on their own in My Job Orders (every minute, or tap ↻ Refresh). | Pag sumagot ang KTC o nagbago ang order mo, may notification ka — i-tap ang 🔔 bell sa taas para makita. Lumalabas din sa Support page ang mga reply sa ticket. Kusang nag-a-update ang status sa My Job Orders (kada minuto, o i-tap ang ↻ Refresh). |

### 11.5 Filing

| English key | Tagalog |
|-------------|---------|
| To file a Job Order, open New Job Order: 1) pick the consignee (type a few letters; not listed? tap Request new consignee and file anyway), 2) enter your Entry Number (your C-… number), 3) pick the Vessel & Voyage, 4) add containers — one row each, choose its service (X-Ray, DEA, OOG); use Bulk paste for a long list. Review, then Confirm. Verified accounts get a JO number on submit. | Para mag-file ng Job Order, buksan ang New Job Order: 1) piliin ang consignee (mag-type ng ilang letra; wala? i-tap ang Request new consignee at mag-file pa rin), 2) ilagay ang Entry Number mo (yung C-… number), 3) piliin ang Vessel & Voyage, 4) magdagdag ng containers — isang row kada isa, piliin ang service nito (X-Ray, DEA, OOG); gamitin ang Bulk paste sa mahabang listahan. I-review, tapos Confirm. Ang verified accounts ay binibigyan ng JO number pag-submit. |
| What do I need to file? | Ano ang kailangan kong ihanda? |
| What services can I request? | Anong services pwede kong i-request? |
| Can I file while pending? | Pwede bang mag-file habang pending? |
| You need four things: the Consignee (from KTC’s master list), your Entry Number (C-… customs number), the Vessel & Voyage (from KTC’s current schedule — you can’t type a new one), and at least one Container (its number + the service it needs). | Apat ang kailangan: ang Consignee (mula sa master list ng KTC), ang Entry Number mo (C-… customs number), ang Vessel & Voyage (mula sa kasalukuyang schedule ng KTC — hindi pwedeng mag-type ng bago), at kahit isang Container (ang number + service na kailangan nito). |
| My vessel isn’t listed | Wala sa listahan ang vessel ko |
| My consignee isn’t in the list | Wala sa listahan ang consignee ko |
| Each container row gets its own service. KTC’s services include X-Ray (X-ray inspection), DEA (examination), OOG Stripping (out-of-gauge cargo), and combinations like X-Ray + DEA. The dropdown shows whatever KTC currently offers — go by what’s listed when you file. | May sariling service ang bawat container row. Kabilang sa services ng KTC ang X-Ray (X-ray inspection), DEA (examination), OOG Stripping (out-of-gauge cargo), at mga combination tulad ng X-Ray + DEA. Kung ano’ng nasa dropdown, ’yun ang kasalukuyang inaalok ng KTC — sundan kung ano ang naka-list pag nag-file ka. |
| Which service does my shipment need? | Anong service ang kailangan ng shipment ko? |
| Estimate the charges first | I-estimate muna ang charges |
| Which service a container needs depends on your shipment and customs requirements — that’s an operational call I can’t decide here. Pick the service you’ve been instructed to request, or let me open a ticket so KTC can advise. | Ang service na kailangan ng container ay depende sa shipment mo at customs requirements — operational call ’yan, hindi ko ma-decide dito. Piliin ang service na sinabihan sa’yo, o pwede akong mag-open ng ticket para ma-advise ka ng KTC. |
| Ask KTC which service to use | Magtanong sa KTC kung anong service |
| A supplement is an additional charge KTC tags onto your order after it’s filed — numbered like JO-0123-A, -B, -C. Each has its own amount and its own payment, shown under additional charges as “Balance to pay.” You pay it like the base charge. Every supplement must be paid before the order can be completed. You don’t add supplements — KTC does. | Ang supplement ay additional charge na idinadagdag ng KTC sa order mo pagkatapos i-file — numbered tulad ng JO-0123-A, -B, -C. May sariling halaga at bayad ang bawat isa, lumalabas sa ilalim ng additional charges bilang “Balance to pay.” Babayaran mo ’to tulad ng base charge. Kailangang bayad lahat ng supplement bago makumpleto ang order. Hindi ikaw ang nagdadagdag ng supplement — ang KTC. |
| See my orders & balances | Tingnan ang orders at balances ko |
| Yes — you can file Job Orders while your account is still pending. They’re saved as held (“Draft — no number yet”, up to 10) and sent to KTC automatically the moment you’re approved. But held orders can’t be processed until you pass final verification — upload a valid ID. Heads up: upload it within 48 hours of confirming your email, or the account closes and you re-register. | Oo — pwede kang mag-file ng Job Orders habang pending pa ang account mo. Naka-save ang mga ito bilang held (“Draft — walang number”, hanggang 10) at automatic na ipapadala sa KTC pagka-approve sa’yo. Pero hindi mapoproseso ang held orders hangga’t hindi ka pumasa sa final verification — mag-upload ng valid ID. Paalala: i-upload within 48 hours ng pag-confirm ng email, kung hindi masasara ang account at mag-re-register ka. |
| How do I upload my valid ID? | Paano mag-upload ng valid ID? |
| No problem. On the consignee step, tap Request new consignee and enter its details. It’s tagged “pending KTC approval”, but you can still file the order now — KTC verifies the consignee on their side. You don’t have to wait. | Okay lang. Sa consignee step, i-tap ang Request new consignee at ilagay ang detalye. Mata-tag itong “pending KTC approval”, pero pwede mo pa ring i-file ang order ngayon — ang KTC ang bahalang mag-verify. Hindi mo kailangang maghintay. |
| Start a Job Order | Mag-file na ng Job Order |
| Ask KTC about a consignee | Magtanong sa KTC tungkol sa consignee |
| Only KTC operations can add a vessel — you can’t add one yourself. If your vessel/voyage isn’t in the dropdown, it usually hasn’t been entered yet (or its Last Free Day passed). I can log a ticket so KTC adds it. | KTC operations lang ang pwedeng mag-add ng vessel — hindi mo pwedeng i-add mismo. Kung wala sa dropdown ang vessel/voyage mo, kadalasan hindi pa ito na-enter (o lumampas na ang Last Free Day). Pwede akong mag-log ng ticket para ma-add ito ng KTC. |
| Open an Operations ticket | Mag-open ng Operations ticket |
| Check the vessel schedule | Tingnan ang vessel schedule |
| Tell me the vessel name & voyage in one line, then I’ll open the ticket. | Sabihin mo ang vessel name & voyage sa isang linya, tapos bubuksan ko ang ticket. |
| Job order: | Job order: |
| What’s your question about this order? I’ll send it to KTC as a ticket. | Ano ang tanong mo sa order na ’to? Ipapadala ko ’to sa KTC bilang ticket. |
| Operations: | Operations: |
| Tell me what you need and I’ll open an Operations ticket. | Sabihin mo kung ano ang kailangan mo at mag-o-open ako ng Operations ticket. |
| Consignee: | Consignee: |
| What’s the consignee you need added or checked? I’ll open a ticket. | Anong consignee ang gusto mong i-add o i-check? Mag-o-open ako ng ticket. |
| Open Operations ticket | Buksan ang Operations ticket |

### 11.6 Payments

| English key | Tagalog |
|-------------|---------|
| Payments & invoices — what do you need? | Payments & invoices — ano ang kailangan mo? |
| How do I pay? | Paano magbayad? |
| Bank / GCash / QRPH details | Bank / GCash / QRPH details |
| How do I upload my proof? | Paano mag-upload ng proof? |
| What happens after I pay? | Ano ang mangyayari pagkatapos magbayad? |
| What’s the Service Invoice / OR? | Ano ’yung Service Invoice / OR? |
| Why is there still a balance? | Bakit may balance pa? |
| My payment was rejected | Na-reject ang bayad ko |
| Open my payment page | Buksan ang payment page ko |
| Each Job Order has its own payment page. Open My Job Orders, find the order, and tap Balances (or View charges). You’ll see the exact computation — X-Ray rate × containers + 12% VAT + flat admin & print fees — plus KTC’s bank / GCash details and the QRPH code. Pay by transfer or e-wallet, then upload your deposit slip for KTC to review. Payment never blocks processing, and you can always pay at the KTC cashier. | May sariling payment page ang bawat Job Order. Buksan ang My Job Orders, hanapin ang order, i-tap ang Balances (o View charges). Makikita mo ang exact computation — X-Ray rate × containers + 12% VAT + flat admin & print fees — at ang bank / GCash details at QRPH code ng KTC. Magbayad via transfer o e-wallet, tapos i-upload ang deposit slip para i-review ng KTC. Hindi hinaharang ng bayad ang pag-process, at pwede ka ring magbayad sa KTC cashier. |
| Estimate my charges first | I-estimate muna ang charges ko |
| How do I upload the proof? | Paano mag-upload ng proof? |
| KTC’s bank account, account name/number, and the QRPH code are shown right on each order’s payment page (under How to pay) — they’re KTC-managed, so what you see there is always current. Open My Job Orders → Balances to see them. The QR is QRPH: scan it with any bank or e-wallet app (GCash, Maya, etc.). If details aren’t posted yet, the page says so — just pay at the KTC cashier. For your security, KTC never DMs separate account numbers — trust only what’s on the portal. | Ang bank account, account name/number, at QRPH code ng KTC ay nasa payment page mismo ng bawat order (sa ilalim ng How to pay) — KTC ang namamahala, kaya laging updated ang nakikita mo. Buksan ang My Job Orders → Balances para makita. QRPH ang QR: i-scan gamit ang kahit anong bank o e-wallet app (GCash, Maya, atbp.). Kung wala pang naka-post, sasabihin ’yan ng page — magbayad na lang sa KTC cashier. Para sa safety mo, hindi ka dini-DM ng KTC ng ibang account number — sa portal lang magtiwala. |
| The details aren’t showing | Walang lumalabas na details |
| After paying by transfer or GCash: open My Job Orders → Balances, go to the charge section you’re paying (X-ray, port-services / RPS, or an additional charge), pick a clear photo or PDF of your receipt under Upload, then tap Submit to KTC. Each charge block is uploaded and reviewed separately — repeat for each. The status changes to “Your proof is with KTC for review.” | Pagkatapos magbayad via transfer o GCash: buksan ang My Job Orders → Balances, pumunta sa charge section na binabayaran mo (X-ray, port-services / RPS, o additional charge), pumili ng malinaw na photo o PDF ng resibo sa ilalim ng Upload, tapos i-tap ang Submit to KTC. Hiwalay na ina-upload at nire-review ang bawat charge block — ulitin sa bawat isa. Magiging “Your proof is with KTC for review” ang status. |
| What happens after I submit? | Ano ang susunod pagka-submit? |
| My upload won’t go through | Hindi mai-upload |
| After you upload, the charge shows “Your proof is with KTC for review.” KTC either confirms it (“✓ Confirmed by KTC”) or rejects it with a short reason so you can re-upload. When all charges are confirmed, the order flips from Balance to pay to Paid. Once your X-ray is done and the balance is fully paid, the page shows “Cleared for release” — collect your gate pass / official Service Invoice at the KTC office. | Pagka-upload, lalabas sa charge ang “Your proof is with KTC for review.” Ico-confirm ito ng KTC (“✓ Confirmed by KTC”) o ire-reject na may maikling dahilan para makapag-re-upload ka. Pag confirmed na lahat, magpapalit ang order mula Balance to pay papuntang Paid. Pag tapos na ang X-ray at fully paid na, lalabas ang “Cleared for release” — kunin ang gate pass / official Service Invoice sa KTC office. |
| It was rejected — I disagree | Na-reject — hindi ako sang-ayon |
| The official Service Invoice is the BIR-registered document issued by KTC (not the portal), recorded at the KTC office. The portal just shows its number once recorded: “Official Receipt No. <no>” if you paid cash/OR, or “Billed on account — Billing Invoice No. <no>” on credit. The in-app charges page is only the computation + your proof. Pay online or at the cashier — either way the official invoice/OR is issued at the office when your container is released. | Ang official Service Invoice ay BIR-registered na dokumento na ini-issue ng KTC (hindi ng portal), naka-record sa KTC office. Ipinapakita lang ng portal ang number nito pag naka-record na: “Official Receipt No. <no>” kung cash/OR ang bayad, o “Billed on account — Billing Invoice No. <no>” kung credit. Computation at proof lang ang charges page sa app. Magbayad online o sa cashier — ini-issue ang official invoice/OR sa office pag ni-release na ang container. |
| Where do I see my invoice number? | Saan ko makikita ang invoice number ko? |
| My invoice number looks wrong | Mali yata ang invoice number ko |
| Your order shows “Balance to pay” until everything on it is settled — the base X-ray charge, any port-services (RPS) charge ops assessed, and any additional charges KTC added. Each is paid and confirmed separately, so if one block is still unpaid, submitted (under review), or rejected, the balance stays. Open My Job Orders → Balances to see which block is outstanding. When all are confirmed, it switches to Paid. | Ipinapakita ng order mo ang “Balance to pay” hangga’t hindi bayad lahat — ang base X-ray charge, anumang port-services (RPS) charge na in-assess ng ops, at anumang additional charges na idinagdag ng KTC. Hiwalay na binabayaran at kino-confirm ang bawat isa, kaya kung may isang block na unpaid, submitted (nire-review), o rejected, mananatili ang balance. Buksan ang My Job Orders → Balances para makita kung alin ang outstanding. Pag confirmed na lahat, magiging Paid. |
| What is a port-services (RPS) charge? | Ano ’yung port-services (RPS) charge? |
| I already paid but it still shows a balance | Bayad na ako pero may balance pa rin |
| RPS covers the port-services moves a Job Order may need beyond a plain X-ray — DEA / inspection work where the van is opened: lift on, trucking, shifting, stripping, stuffing. KTC’s checker assesses each order; most are plain X-ray and need none, but if yours needs these moves, KTC charges them per move on top of the base X-ray. RPS isn’t in the Rate Calculator (quoted per request). You’ll see any RPS charge under Balances before you pay. | Ang RPS ay para sa port-services moves na posibleng kailanganin ng Job Order bukod sa plain X-ray — DEA / inspection kung saan binubuksan ang van: lift on, trucking, shifting, stripping, stuffing. Ang checker ng KTC ang nag-a-assess; karamihan plain X-ray lang at walang kailangan, pero kung kailangan ng order mo, sisingilin per move dagdag sa base X-ray. Wala ang RPS sa Rate Calculator (quoted per request). Makikita mo ang RPS charge sa Balances bago magbayad. |
| When KTC can’t accept a proof, the charge shows “Your proof wasn’t accepted” with a short reason (wrong amount, unclear image, or it doesn’t match the total). The fix is usually quick: open My Job Orders → Balances, read the note, re-upload a clearer/corrected slip on that same charge, and Submit to KTC again. If you believe the rejection is a mistake — the amount IS correct — open a ticket and KTC will look into it. | Pag hindi ma-accept ng KTC ang proof, lalabas ang “Your proof wasn’t accepted” na may maikling dahilan (maling amount, malabong larawan, o ’di tugma sa total). Madalas mabilis ang ayos: buksan ang My Job Orders → Balances, basahin ang note, mag-re-upload ng mas malinaw/tamang slip sa parehong charge, at Submit to KTC ulit. Kung sa tingin mo mali ang pag-reject — TAMA ang amount — mag-open ng ticket at titingnan ito ng KTC. |
| Re-upload a corrected slip | Mag-re-upload ng tamang slip |
| I disagree — open a support ticket | Hindi ako sang-ayon — magbukas ng ticket |
| Payment: | Payment: |
| What’s your payment question? Please include your JO number, the charge (X-ray / port-services / additional), and the amount + date + reference of your transfer. I’ll send it to the KTC cashier team. | Ano ang tanong mo sa payment? Pakisama ang JO number mo, ang charge (X-ray / port-services / additional), at ang amount + petsa + reference ng transfer mo. Ipapadala ko ’to sa KTC cashier team. |
| Create a payment ticket | Gumawa ng payment ticket |

### 11.7 Rates & vessels

| English key | Tagalog |
|-------------|---------|
| Rates, charges, and the vessel schedule — what do you need? | Rates, charges, at vessel schedule — ano ang kailangan mo? |
| How do I estimate my charges? | Paano ko ma-e-estimate ang charges ko? |
| What is the Last Free Day? | Ano ang Last Free Day? |
| Where’s the vessel schedule? | Saan ang vessel schedule? |
| What is RPS? | Ano ang RPS? |
| Something else | Iba pang tanong |
| Estimate charges anytime in the Rate Calculator — no filing needed. Three steps: 1) Shipment details (line, vessel & voyage — this also sets your route and storage Last Free Day), 2) Containers (size, empty/full, dry/reefer, qty), 3) Ancillary services (DEA, electrical/reefer). Tap Generate estimate: terminal charges + 12% VAT + flat admin & print fee. It’s a guide only — the official amount is on the KTC Service Invoice. | I-estimate ang charges anytime sa Rate Calculator — hindi kailangang mag-file. Tatlong hakbang: 1) Shipment details (line, vessel & voyage — dito na rin naka-set ang route at storage Last Free Day), 2) Containers (size, empty/full, dry/reefer, qty), 3) Ancillary services (DEA, electrical/reefer). I-tap ang Generate estimate: terminal charges + 12% VAT + flat admin & print fee. Guide lang ito — ang official amount ay nasa KTC Service Invoice. |
| Why does my estimate show “—”? | Bakit may “—” sa estimate ko? |
| A “—” next to a line means KTC hasn’t set that rate yet for your exact size × empty/full × dry/reefer × route — it’s not ₱0, it’s just not in the estimate. Your total still sums the lines that do have rates. Some services (RPS, equipment rental, stripping) aren’t in the calculator at all — they’re quoted per request. Need a figure for a “—” line? KTC can give it to you. | Ang “—” sa tabi ng line ay nangangahulugang wala pang naka-set na rate ang KTC para sa exact na size × empty/full × dry/reefer × route mo — hindi ito ₱0, hindi lang kasali sa estimate. Sina-sum pa rin ng total ang mga line na may rate. May ilang services (RPS, equipment rental, stripping) na wala talaga sa calculator — quoted per request. Kailangan ng figure para sa “—” na line? Mabibigay ’yan ng KTC. |
| Ask KTC for a rate | Magtanong sa KTC ng rate |
| The Last Free Day (LFD) is the last day of free storage for a vessel call — KTC computes it as finish-discharging date + that shipping line’s free days. Up to the LFD, storage is free; after it, storage charges accrue per day until you pick up the container. Each call has its own LFD — see it on the Vessel Schedule (highlighted on every card) and in the Rate Calculator. | Ang Last Free Day (LFD) ay ang huling araw ng libreng storage para sa isang vessel call — kino-compute ito ng KTC bilang finish-discharging date + free days ng shipping line. Hanggang LFD, libre ang storage; pagkatapos, mag-a-accrue ang storage charges kada araw hanggang ma-pick up ang container. May sariling LFD ang bawat call — makikita sa Vessel Schedule (highlighted sa bawat card) at sa Rate Calculator. |
| View the vessel schedule | Tingnan ang vessel schedule |
| Estimate my storage | I-estimate ang storage ko |
| The Vessel Schedule shows KTC’s current calls — vessel, voyage, line, arrival, finish discharging, Last Free Day, and berth. It’s read-only (KTC operations maintains it) with Cards, Table, and Calendar views, plus a Show past/cancelled toggle. It’s the same list you pick from when filing a Job Order. | Ipinapakita ng Vessel Schedule ang current calls ng KTC — vessel, voyage, line, arrival, finish discharging, Last Free Day, at berth. Read-only ito (KTC operations ang namamahala) na may Cards, Table, at Calendar views, plus Show past/cancelled toggle. Ito rin ang listahang pinipilian mo pag nag-file ng Job Order. |

### 11.8 Release

| English key | Tagalog |
|-------------|---------|
| Container release / pull-out — what do you need? | Container release / pull-out — ano ang kailangan mo? |
| How do I file a release? | Paano mag-file ng release? |
| What documents do I need? (DO / BL) | Anong documents ang kailangan? (DO / BL) |
| What happens after I file? | Ano ang mangyayari pagkatapos mag-file? |
| Additional charges | Additional charges |
| What do the statuses mean? | Anong ibig sabihin ng mga status? |
| Open my releases | Buksan ang releases ko |
| Something else / I have a problem | Iba pa / may problema ako |
| Filing a release is online — no queue. Go to Release / Pull-out → File a release: 1) pick the Consignee (or Request a new consignee and file anyway), 2) enter the BL Number (required), 3) attach a photo/PDF of your DO or BL (optional at filing, but KTC verifies it before assessing charges, so attach it now). Tap File release. Note: your account must be fully approved first — a pending account can’t file a release yet. | Online ang pag-file ng release — walang pila. Pumunta sa Release / Pull-out → File a release: 1) piliin ang Consignee (o Request a new consignee at mag-file pa rin), 2) ilagay ang BL Number (required), 3) mag-attach ng photo/PDF ng DO o BL mo (optional sa pag-file, pero vine-verify ito ng KTC bago i-assess ang charges, kaya ilagay na ngayon). I-tap ang File release. Paalala: kailangang fully approved muna ang account mo — hindi pa pwede ang pending. |
| What happens next? | Ano ang susunod? |
| My account isn’t approved yet | Hindi pa approved ang account ko |
| To file a release your account must be fully approved (a pending account can’t — this is stricter than Job Orders). If you’ve uploaded your valid ID, wait for KTC’s approval email. If not, upload one valid government ID from the banner on your home page within 48 hours of confirming your email, or the account closes. Once approved, the File a release form opens up. | Para makapag-file ng release, kailangang fully approved ang account mo (hindi pwede ang pending — mas mahigpit ito kaysa Job Orders). Kung na-upload mo na ang valid ID, hintayin ang approval email ng KTC. Kung hindi pa, mag-upload ng isang valid government ID sa banner ng home page within 48 hours ng pag-confirm ng email, kung hindi masasara ang account. Pag approved na, magbubukas ang File a release form. |
| Still stuck — contact KTC | Stuck pa rin — i-contact ang KTC |
| For a release you provide: the BL Number (required — the Bill of Lading number) and a DO (Delivery Order) or BL document (photo or PDF) so KTC can verify it before computing charges. It’s optional at filing but must be accepted to move forward. If KTC marks it “Needs a corrected document”, open it, re-upload a clearer/corrected DO/BL, and tap Resubmit document. | Para sa release, ibibigay mo: ang BL Number (required — ang Bill of Lading number) at ang DO (Delivery Order) o BL document (photo o PDF) para ma-verify ng KTC bago mag-compute ng charges. Optional sa pag-file pero kailangang ma-accept para makausad. Kung mamark ng KTC na “Needs a corrected document”, buksan, mag-re-upload ng mas malinaw/tamang DO/BL, at i-tap ang Resubmit document. |
| What happens after? | Ano ang mangyayari pagkatapos? |
| After you file, it moves through: 1) Awaiting document check, 2) Documents verified, 3) Ready for payment, 4) Paid — claim OR at office, 5) Released. Track each live in My Releases. Which step do you want details on? | Pagkatapos mag-file, dadaan ito sa: 1) Awaiting document check, 2) Documents verified, 3) Ready for payment, 4) Paid — claim OR at office, 5) Released. I-track live sa My Releases. Aling step ang gusto mong i-detalye? |
| Document check & “needs correction” | Document check & “needs correction” |
| How do I pay the charges? | Paano bayaran ang charges? |
| Getting the OR & pulling out | Pagkuha ng OR at pull-out |
| Can I cancel a release? | Pwede ko bang i-cancel ang release? |
| If KTC needs a better document, the release shows “Needs a corrected document” with a note. Open it, choose the corrected/clearer DO or BL (image or PDF), and tap Resubmit document — it goes back to KTC for verification. Until the document is accepted, KTC can’t assess your charges. | Kung kailangan ng KTC ng mas maayos na document, magpapakita ang release ng “Needs a corrected document” na may note. Buksan, piliin ang tama/mas malinaw na DO o BL (image o PDF), at i-tap ang Resubmit document — babalik ito sa KTC para i-verify. Hangga’t hindi tanggap, hindi ma-a-assess ng KTC ang charges mo. |
| Resubmitted but still on hold | Na-resubmit na pero on hold pa rin |
| When KTC verifies your document and computes charges, the release becomes Ready for payment. Open it for the Amount due, a charges note, and How to pay — KTC’s bank / GCash details and a QRPH QR (scan with any bank or e-wallet app). After paying, upload a clear photo/PDF of your deposit slip and tap Submit to KTC. Once confirmed, it becomes Paid. Rejected proof shows the reason so you can re-upload. You can also pay at the KTC cashier. | Pag na-verify ng KTC ang document at na-compute ang charges, magiging Ready for payment ang release. Buksan para sa Amount due, charges note, at How to pay — bank / GCash details ng KTC at QRPH QR (i-scan gamit ang kahit anong bank o e-wallet app). Pagkabayad, mag-upload ng malinaw na photo/PDF ng deposit slip at i-tap ang Submit to KTC. Pag confirmed, magiging Paid. Ang rejected na proof ay may dahilan para makapag-re-upload. Pwede ka ring magbayad sa KTC cashier. |
| I paid but it’s still not confirmed | Bayad na pero hindi pa confirmed |
| Estimate charges first (Rates) | I-estimate muna ang charges (Rates) |
| When KTC confirms your payment, the release becomes “Paid — claim OR at office.” Go to the KTC office to claim your Official Receipt (OR) — that’s what lets you pull out the container. After the OR is recorded, the status turns Released and shows your Official Receipt No. (and ERP invoice no., if recorded). Reminder: any additional charges must all be settled before the OR can be released. | Pag na-confirm ng KTC ang bayad mo, magiging “Paid — claim OR at office” ang release. Pumunta sa KTC office para kunin ang Official Receipt (OR) — yan ang magpapahintulot mong i-pull out ang container. Pagka-record ng OR, magiging Released ang status at ipapakita ang Official Receipt No. mo (at ERP invoice no., kung naka-record). Paalala: kailangang bayad lahat ng additional charges bago mailabas ang OR. |
| About additional charges | Tungkol sa additional charges |
| Paid but OR / pull-out problem | Bayad na pero may problema sa OR / pull-out |
| KTC sometimes adds additional charges after assessing your release (separate lines with a label + amount). Each line is paid separately — pay to the same bank account / QR, upload that line’s own receipt, and Submit to KTC. Each shows its own status: Unpaid, Under review, Paid, or Rejected (re-upload if rejected). Important: your OR can’t be released until every additional charge is confirmed. | Minsan nagdadagdag ang KTC ng additional charges pagkatapos i-assess ang release (hiwalay na lines na may label + amount). Hiwalay na binabayaran ang bawat line — magbayad sa parehong bank account / QR, i-upload ang sariling resibo ng line, at Submit to KTC. May sariling status ang bawat isa: Unpaid, Under review, Paid, o Rejected (mag-re-upload kung rejected). Mahalaga: hindi mailalabas ang OR mo hangga’t hindi confirmed lahat ng additional charges. |
| How do I pay? | Paano magbayad? |
| I dispute a charge / wrong amount | May dispute ako sa charge / maling amount |
| You can cancel your own release while it’s Awaiting document check, Documents verified, Ready for payment, or Needs a corrected document — open it and tap Cancel this request (there’s a confirm step; it can’t be undone). Once it’s Paid or Released it can’t be cancelled here — contact KTC for those. | Pwede mong i-cancel ang sarili mong release habang Awaiting document check, Documents verified, Ready for payment, o Needs a corrected document — buksan at i-tap ang Cancel this request (may confirm; hindi na mababawi). Pag Paid o Released na, hindi na ito ma-cancel dito — i-contact ang KTC para diyan. |
| Need to cancel a Paid/Released one | Kailangang i-cancel ang Paid/Released |
| Release statuses, in order: Awaiting document check (KTC verifies your DO/BL) · Documents verified (computing charges) · Ready for payment (pay + upload, or pay at the cashier) · Paid — claim OR at office · Released (OR recorded; shows your OR number) · Needs a corrected document (re-upload a clearer DO/BL) · Cancelled. | Mga release status, sunod-sunod: Awaiting document check (vine-verify ang DO/BL) · Documents verified (kino-compute ang charges) · Ready for payment (magbayad + upload, o sa cashier) · Paid — claim OR at office · Released (naka-record ang OR; ipinapakita ang OR number) · Needs a corrected document (mag-re-upload ng mas malinaw na DO/BL) · Cancelled. |
| Opening Release / Pull-out — track each release live here. | Binubuksan ang Release / Pull-out — i-track live ang bawat release dito. |
| Release: | Release: |
| Tell me what’s happening with your release (and your release no. — REL-… — or the BL number) and I’ll open a ticket so KTC can look into it. | Sabihin mo kung ano ang nangyayari sa release mo (at ang release no. — REL-… — o ang BL number) at mag-o-open ako ng ticket para tingnan ng KTC. |

### 11.9 Account

| English key | Tagalog |
|-------------|---------|
| What do you need help with on your account? | Ano ang kailangan mo sa account mo? |
| How do I get approved / accredited? | Paano ako ma-approve / ma-accredit? |
| Upload my valid ID | Mag-upload ng valid ID |
| Why is my account still pending? | Bakit pending pa rin ang account ko? |
| What can I do while pending? | Ano ang pwede kong gawin habang pending? |
| Change my email, password, or contact | Palitan ang email, password, o contact ko |
| My account says “Action needed” / was rejected | May “Action needed” / na-reject ang account ko |
| My account is suspended | Naka-suspend ang account ko |
| Sign-in / password trouble | Problema sa sign-in / password |
| Something else about my account | Iba pang concern sa account ko |
| The accreditation flow: 1) Sign up (full name, contact number, email, password), 2) read the KTC Customer Agreement to the end + tick consent + pass the security check, 3) confirm your email and sign in, 4) upload one valid government ID on the Verify ID page, 5) wait for KTC to review and approve (you get an approval email; status becomes Verified). You can file Job Orders while you wait — held as Draft (up to 10) and sent automatically on approval. Important: upload your ID within 48 hours of confirming your email, or the account closes and you re-register. | Ang accreditation flow: 1) Sign up (full name, contact number, email, password), 2) basahin ang KTC Customer Agreement hanggang dulo + i-tick ang consent + ipasa ang security check, 3) i-confirm ang email at mag-sign in, 4) mag-upload ng isang valid government ID sa Verify ID page, 5) hintayin ang review at approval ng KTC (may approval email; magiging Verified). Pwede kang mag-file ng Job Orders habang naghihintay — held bilang Draft (hanggang 10) at automatic na ipapadala pag-approve. Importante: i-upload ang ID within 48 hours ng pag-confirm ng email, kung hindi masasara ang account at mag-re-register ka. |
| Upload my valid ID now | Mag-upload na ng valid ID |
| To upload your valid ID, go to the Verify ID page: tick the data-privacy consent, attach a clear photo or PDF of one valid government ID, and tap Submit valid ID for verification (large images are compressed). Past your first sign-in? You can also upload it anytime from the orange banner on your home page. Your uploaded ID is deleted from our servers no later than 3 days after upload (Agreement §4). A KTC admin then reviews and approves. | Para mag-upload ng valid ID, pumunta sa Verify ID page: i-tick ang data-privacy consent, mag-attach ng malinaw na photo o PDF ng isang valid government ID, at i-tap ang Submit valid ID for verification (auto-compress ang malalaking image). Lampas na sa unang sign-in? Pwede mo rin itong i-upload anytime sa orange banner sa home page. Bububurahin ang na-upload mong ID sa servers namin hindi lalampas ng 3 araw mula nang i-upload (Agreement §4). Irere-review at a-approve ito ng KTC admin. |
| “Pending verification” means a KTC admin still has to review your account. Two usual reasons: you haven’t uploaded a valid ID yet (do it from the home banner or Verify ID — this is what unlocks approval), or you’ve uploaded it and KTC is still reviewing (you’ll get an approval email once verified). Reminder: upload within 48 hours of confirming your email or the account closes. You can keep filing meanwhile — orders stay held until you’re approved. | Ang “Pending verification” ay ibig sabihin kailangan pang i-review ng KTC admin ang account mo. Dalawang madalas na dahilan: wala ka pang na-upload na valid ID (gawin sa home banner o Verify ID — ito ang nagbubukas ng approval), o na-upload mo na at nire-review pa ng KTC (may approval email pagka-verify). Paalala: i-upload within 48 hours ng pag-confirm ng email o masasara ang account. Pwede ka pang mag-file — naka-hold ang orders hangga’t hindi ka approved. |
| A pending (not-yet-verified) account already has the full portal. While you wait you can browse, use the Rates calculator, check Vessels, and file Job Orders — they’re saved as held (Draft — no number yet, up to 10) and sent to KTC automatically the moment you’re approved (they can’t be processed until then). Once verified, your held orders go live and each gets its permanent JO number. | Ang pending (hindi pa verified) na account ay may buong portal na. Habang naghihintay, pwede kang mag-browse, gamitin ang Rates calculator, tingnan ang Vessels, at mag-file ng Job Orders — naka-save bilang held (Draft — walang number, hanggang 10) at automatic na ipapadala pagka-approve (hindi mapoproseso hangga’t hindi). Pagka-verify, magiging live ang held orders at bibigyan ng permanenteng JO number ang bawat isa. |
| Which detail do you want to change? | Alin ang gusto mong palitan? |
| My name | Pangalan ko |
| My contact number | Contact number ko |
| My email | Email ko |
| My password | Password ko |
| I forgot my password | Nakalimutan ko ang password ko |
| Edit your name in My Account → Personal details, then Save changes. Heads up: if your account is already Verified, changing your legal name sends it back to pending for re-verification — you’ll re-upload a valid ID so KTC can re-check, because your details must match your ID. Any Job Orders you file meanwhile are held until you’re re-approved. | I-edit ang pangalan mo sa My Account → Personal details, tapos Save changes. Paalala: kung Verified na ang account mo, ang pagpalit ng legal name ay magbabalik nito sa pending para sa re-verification — mag-upload ulit ng valid ID para i-recheck ng KTC, kasi dapat tugma ang details mo sa ID. Ang mga Job Orders na ifa-file mo habang ganito ay naka-hold hangga’t hindi ka na-re-approve. |
| Edit your contact number in My Account → Personal details and Save changes. Changing only your contact number does not affect your verified status — no re-verification needed. | I-edit ang contact number mo sa My Account → Personal details at Save changes. Kung contact number lang ang papalitan, hindi naaapektuhan ang verified status mo — walang re-verification. |
| In My Account → Email address, type the new email and tap Send confirmation link. We email a link to the new address — the change only takes effect once you click it, and your current email stays active until you confirm. | Sa My Account → Email address, i-type ang bagong email at i-tap ang Send confirmation link. Magpapadala kami ng link sa bagong address — magkakabisa lang ang pagbabago pagka-click mo, at active pa rin ang kasalukuyang email hangga’t hindi mo na-confirm. |
| In My Account → Password, enter a new password (at least 8 characters) twice and tap Update password. You’ll stay signed in on this device. | Sa My Account → Password, ilagay nang dalawang beses ang bagong password (at least 8 characters) at i-tap ang Update password. Mananatili kang naka-sign in sa device na ito. |
| Use Forgot password? on the login page (or Reset it by email in My Account → Password). We email a reset link — open it, set a new password, then sign in. If the email doesn’t arrive, check your spam folder. | Gamitin ang Forgot password? sa login page (o ang Reset it by email sa My Account → Password). Magpapadala kami ng reset link — buksan, mag-set ng bagong password, tapos mag-sign in. Kung walang dumating, i-check ang spam folder. |
| If your account shows “Action needed”, it was sent back — usually for a small fix. When you open the portal you’ll see KTC’s note (What to update) plus fields to correct your name and contact number and re-upload your valid ID, then Resubmit for review. Just follow the note and resubmit — that’s the fastest path. If you believe it was a mistake, raise it with customer service. | Kung “Action needed” ang account mo, ibinalik ito — kadalasan maliit na ayos lang. Pagbukas mo ng portal, makikita mo ang note ng KTC (What to update) plus fields para i-correct ang pangalan at contact number at i-re-upload ang valid ID, tapos Resubmit for review. Sundin lang ang note at i-resubmit — ito ang pinakamabilis. Kung sa tingin mo mali, i-raise sa customer service. |
| I want to appeal / dispute the rejection | Gusto kong i-appeal / i-dispute ang rejection |
| A suspended account can’t use the portal and isn’t self-recoverable. Please contact KTC customer service — the live contact options (phone / email / Viber / hours) are on the Support page, and they’ll explain the reason and next steps. I can also open a support ticket so a KTC staff member follows up. | Ang suspended na account ay hindi makakagamit ng portal at hindi self-recoverable. Paki-contact ang KTC customer service — nasa Support page ang live contact options (phone / email / Viber / hours), at ipapaliwanag nila ang dahilan at susunod na steps. Pwede rin akong mag-open ng support ticket para may KTC staff na mag-follow up. |
| See KTC contact options | Tingnan ang contact options ng KTC |
| Raise a support ticket | Mag-raise ng support ticket |
| Signed in but having trouble? A few common ones: the portal signs you out after 30 minutes idle (just sign in again); only one device stays signed in at a time, so a newer login signs the older one out; to change your password use My Account → Password, or Forgot password? on the login page. If you’re fully locked out and can’t even reach this screen, use Forgot password on the login page — or I can open an account ticket. | Naka-sign in pero may problema? Ilang madalas: nila-log out ka ng portal pagkatapos ng 30 minutong idle (mag-sign in ulit); iisang device lang ang nakaka-sign in, kaya nila-log out ang mas luma pag may bagong login; para palitan ang password gamitin ang My Account → Password, o Forgot password? sa login page. Kung fully locked out ka at hindi mo maabot ang screen na ito, gamitin ang Forgot password sa login page — o pwede akong mag-open ng account ticket. |
| Open an account ticket | Mag-open ng account ticket |
| Sorry about that. First try a quick refresh — most glitches are a stale page (pull to refresh, or close and reopen the app). If it still won’t work, tell me what you were doing and I’ll open a ticket so KTC’s team can fix it. | Pasensya na. Subukan muna ang quick refresh — kadalasan stale page lang ang glitch (i-pull para mag-refresh, o isara at buksang muli ang app). Kung ayaw pa rin, sabihin mo kung ano ang ginagawa mo at mag-o-open ako ng ticket para ayusin ng team ng KTC. |
| Report a bug to KTC | Mag-report ng bug sa KTC |
| KTC’s phone, email, Viber, and office hours are on the Support page (the live-agent block) — they’re kept up to date by KTC. You can reach the team there, or I can open a ticket and KTC will reply in your Support tab. | Ang telepono, email, Viber, at office hours ng KTC ay nasa Support page (sa live-agent block) — pinapanatiling updated ng KTC. Maaabot mo sila roon, o pwede akong mag-open ng ticket at sasagot ang KTC sa Support tab mo. |
| Open a support ticket | Mag-open ng support ticket |
| Account: | Account: |
| What would you like to ask KTC about your account / approval? | Ano ang gusto mong itanong sa KTC tungkol sa account / approval mo? |
| Create an account ticket | Gumawa ng account ticket |
| Bug report: | Bug report: |
| Tell me what went wrong (what you tapped, what you saw) and I’ll open a ticket for KTC’s team. | Sabihin mo kung ano ang mali (ano ang na-tap mo, ano ang nakita mo) at mag-o-open ako ng ticket para sa team ng KTC. |
| Report a bug | Mag-report ng bug |

### 11.10 Nav leaf bodies/CTAs

| English key | Tagalog |
|-------------|---------|
| Here are all your Job Orders with their live status and balances. | Nandito lahat ng Job Orders mo kasama ang live status at balances. |
| Let’s file it. | Tara, i-file na natin. |
| Your tickets and live-agent contact options are here. | Nandito ang tickets at live-agent contact options mo. |
| Manage your name, contact, email and password here. | I-manage ang pangalan, contact, email at password mo dito. |
| Upload your valid ID here. | I-upload ang valid ID mo dito. |
| This is your portal home. | Ito ang home ng portal mo. |
| We’ll email you a reset link. | Magpapadala kami ng reset link sa email mo. |

---

## 12 · Open decisions for the owner (must confirm before build)

1. **String model deviation from engine.md.** This spec uses `t('English')` keys (your
   instruction) instead of engine.md's inline `{en,tl}`. Confirm — it changes the data shape
   and means ~150 new keys land in `translations.ts` (full table in §11). *(Recommended:
   keep — matches the house i18n pattern and the rest of the app.)*
2. **Track by JO number only** (entry-number lookup deferred — non-unique, needs `orSafe` +
   ordering). OK to ship JO-number-only first?
3. **6 tiles + a standing "Talk to a person"** (not 8). Confirm the tile set, labels, and
   glyphs in §3.
4. **`transcript` ticket body** (used by `ticket.vessel`): needs a `summariseTranscript(state)`
   helper (a few lines summarising the path + the user's last free-typed line). Confirm a
   one-line format is fine, e.g. `Asked via chat → Add vessel. User typed: "<lastUserText>"`.
5. **First-open pulse** once per browser session — keep, or open silent? (UX call.)
6. **i18n insertion check:** several short labels ("Open My Account", "Back to menu",
   "Additional charges", "How do I pay?", etc.) may already exist in `translations.ts`. Before
   adding §11, de-dupe against the existing dictionary so we don't double-key.
7. **Mounting:** the FAB sits above `BottomNav` via `--tabbar-h`. Confirm that CSS var exists
   (or supply the actual tab-bar height) so the offset is correct on mobile.
