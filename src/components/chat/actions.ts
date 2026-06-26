// Deterministic actions for Lara — the only places the bot touches the DB.
// Both are READ-ONLY and RLS-scoped: no customer_id filter, no service role, no
// .or()/string-interpolation. The job_orders SELECT policy already limits rows to
// the signed-in customer (0055 weaves session_alive() into current_broker_id()).
//
// Each action returns bubbles ALREADY resolved through t() (rendered literally in
// the transcript) plus follow-up options whose labels are t() keys. We import the
// shared `supabase` client directly (house convention) and ALWAYS await the query
// builder — an un-awaited supabase builder never executes (real gotcha, 2026-06-15).

import { supabase } from '../../lib/supabase'
import { joPaymentState } from '../../lib/joPayment'
import type { JobOrder } from '../../lib/types'
import type { ActionFn, ChatOption } from './types'

// "JO12" / "jo-000123" / "123" / "000123" → "JO-000123"; '' if no digits.
function normalizeJo(raw: string): string {
  const digits = raw.match(/\d+/g)?.join('') ?? ''
  if (!digits) return ''
  return 'JO-' + digits.padStart(6, '0').slice(-6)
}

// supabase returns a to-one embed as an object at runtime, but its generated
// types can widen to an array — normalise either shape to the single name.
function consigneeName(c: unknown): string {
  if (!c) return '—'
  const row = Array.isArray(c) ? c[0] : c
  return (row && typeof row === 'object' && 'name' in row && (row as { name?: string }).name) || '—'
}

// Per-status one-liner for the track result (t() keys, grounded in MyJobOrders).
const STATUS_LINE: Record<string, string> = {
  held: 'Pending approval — saved as a Draft (no JO number yet).',
  submitted: 'Submitted — in KTC’s queue. You can still Edit or Cancel it.',
  processing: 'Approved · processing — you can print the A6 slip and the base charge is now payable.',
  on_hold: 'On hold — KTC needs info. Open the order, fix the flagged fields, add a reply, and Resubmit.',
  completed: 'Completed — all services done. Settle any balance and claim your OR / Service Invoice at the KTC office.',
  rejected: 'Not approved — this order is closed and can’t be resubmitted. File a new one if you still need it.',
  cancelled: 'Cancelled.',
}
const PAY_LINE: Record<'none' | 'balance' | 'paid', string> = {
  none: 'Payment: nothing to pay yet — waiting for KTC to review and set charges.',
  balance: 'Payment: Balance to pay — something is still owed (base, RPS, and/or additional charges).',
  paid: 'Payment: Paid — fully settled.',
}

// Compact status label for the "all my orders" list (mirrors MyJobOrders).
const STATUS_LABEL: Record<string, string> = {
  held: 'Pending approval',
  submitted: 'Submitted',
  processing: 'Approved · processing',
  on_hold: 'On hold · info needed',
  completed: 'Completed',
  rejected: 'Not approved · closed',
  cancelled: 'Cancelled',
}

const TRACK_COLS =
  'jo_number, status, payment_status, rps_status, rps_payment_status, ' +
  'completed_at, vessel_name, voyage_number, ' +
  'consignee:consignees(name), supplements:jo_supplements(payment_status)'

const LIST_COLS =
  'jo_number, entry_number, status, payment_status, rps_status, rps_payment_status, ' +
  'created_at, consignee:consignees(name), supplements:jo_supplements(payment_status)'

export const trackOrder: ActionFn = async (vars, { t }) => {
  const jo = normalizeJo(vars.jo ?? '')
  if (!jo) {
    return {
      bubbles: [t('I need a JO number like JO-000123 to look that up.')],
      options: [
        { label: 'Try another number', to: 'track.input' },
        { label: 'See all my orders', to: 'orders.listAll' },
      ],
    }
  }

  const { data, error } = await supabase
    .from('job_orders')
    .select(TRACK_COLS)
    .eq('jo_number', jo)        // PARAMETERIZED — no interpolation, RLS-scoped
    .maybeSingle()             // 0 or 1 row for the caller

  if (error) {
    return {
      bubbles: [t('Hmm, I couldn’t check that right now. Want me to open a ticket so KTC can look?')],
      options: [
        { label: 'Yes, open a ticket', to: 'ticket.jobOrder' },
        { label: 'Try again', to: 'track.input' },
        { label: 'Back to menu', to: 'root' },
      ],
    }
  }
  if (!data) {
    return {
      bubbles: [t('I couldn’t find order {jo} on your account. If it’s still a Draft it has no JO number yet — check My Job Orders.', { jo })],
      options: [
        { label: 'Open My Job Orders', to: 'nav.myOrders' },
        { label: 'Try another number', to: 'track.input' },
        { label: 'Talk to KTC', to: 'ticket.jobOrder' },
      ],
    }
  }

  const o = data as unknown as JobOrder
  const pay = joPaymentState(o)
  const who = consigneeName((data as { consignee?: unknown }).consignee)
  const vessel = o.vessel_name
    ? o.vessel_name + (o.voyage_number ? ' · ' + o.voyage_number : '')
    : '—'

  return {
    bubbles: [
      t('Order {jo} — Consignee: {who} — Vessel: {vessel}', { jo, who, vessel }),
      t(STATUS_LINE[o.status] ?? o.status),
      t(PAY_LINE[pay]),
    ],
    options: [
      { label: 'Open this order', to: 'nav.myOrders' },
      { label: 'What does this status mean?', to: 'status.glossary' },
      { label: 'Track another', to: 'track.input' },
      { label: 'Back to menu', to: 'root' },
    ],
  }
}

export const listMyOrders: ActionFn = async (_vars, { t }) => {
  const { data, error } = await supabase
    .from('job_orders')
    .select(LIST_COLS)           // RLS-scoped — only the caller's own rows
    .order('created_at', { ascending: false })
    .limit(8)

  const back: ChatOption[] = [
    { label: 'Open My Job Orders', to: 'nav.myOrders' },
    { label: 'Track a specific order', to: 'track.input' },
    { label: 'Back to menu', to: 'root' },
  ]

  if (error) {
    return {
      bubbles: [t('Hmm, I couldn’t load your orders right now. You can open My Job Orders directly.')],
      options: back,
    }
  }
  const rows = (data ?? []) as unknown as JobOrder[]
  if (rows.length === 0) {
    return {
      bubbles: [t('You don’t have any Job Orders yet. Tap below to file your first one.')],
      options: [
        { label: 'File a new order', to: 'file.how' },
        { label: 'Back to menu', to: 'root' },
      ],
    }
  }

  const payChip = (s: 'none' | 'balance' | 'paid') =>
    s === 'balance' ? ' · ' + t('Balance to pay') : s === 'paid' ? ' · ' + t('Paid') : ''

  const lines = rows.map((o) => {
    const id = o.jo_number ?? o.entry_number ?? t('Draft')
    const status = t(STATUS_LABEL[o.status] ?? o.status)
    return `• ${id} — ${status}${payChip(joPaymentState(o))}`
  })

  return {
    bubbles: [
      t('Here are your most recent orders ({n}):', { n: rows.length }),
      lines.join('\n'),
    ],
    options: back,
  }
}

export const ACTIONS: Record<'trackOrder' | 'listMyOrders', ActionFn> = { trackOrder, listMyOrders }
