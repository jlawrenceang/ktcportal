// Lara — the KTC portal's customer help assistant.
// DETERMINISTIC, NO-AI / NO-LLM: a hand-written decision tree + keyword matcher,
// with a real support-ticket fallback. These are the data shapes; the tree lives
// in nodes.ts, the matcher in match.ts, the DB lookups in actions.ts, and the
// reducer/walker in useChat.ts. Every copy `string` below is an English t() key
// (i18n.tsx resolves it; Tagalog lives in translations.ts).

import type { TFunc } from '../../lib/i18n'

export type NodeId = string

/** The 8 real ticket categories — mirror CATEGORIES in SupportTickets.tsx exactly. */
export type TicketCategory =
  | 'app_system' | 'customer_service' | 'operations' | 'account'
  | 'accreditation' | 'job_order' | 'payment' | 'other'

/** Deterministic, RLS-scoped DB lookups (no LLM). */
export type ActionName = 'trackOrder' | 'listMyOrders'

/** A tappable quick-reply / tile. `label` is a t() key. */
export interface ChatOption {
  label: string            // t() key
  to: NodeId
  glyph?: string           // optional emoji for tile chrome
}

interface NodeBase {
  id?: NodeId
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
  /** subject (<=120): from the user's last free-typed line + a prefix, or a fixed t() key. */
  subject: { from: 'userText'; prefix?: string } | { fixed: string }
  /** first message body: the user's own words, or fixed copy. */
  body: { from: 'userText' } | { fixed: string }
  intro: string                    // consent bubble before we create it
  confirmLabel: string
  cancelOption?: ChatOption
  /** ONLY ticket.fromHere sets this: a matcher near-miss carries its category in. */
  inheritCategory?: boolean
}

export type ChatNode =
  | MessageNode | OptionsNode | InputNode | NavNode | ActionNode | TicketNode

export type NodeRegistry = Record<NodeId, ChatNode>

/** What a deterministic action returns: fully-resolved bot bubbles + follow-up options. */
export interface ActionResult {
  bubbles: string[]                // already run through t() — rendered literally
  options: ChatOption[]            // labels are t() keys
}

export interface ActionCtx { t: TFunc }
export type ActionFn = (vars: Record<string, string>, ctx: ActionCtx) => Promise<ActionResult>
