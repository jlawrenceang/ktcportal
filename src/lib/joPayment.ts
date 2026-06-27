import type { JobOrder } from './types'

// Unified payment state for a job order — ONE pill instead of separate base /
// RPS / supplement chips. "balance" means *anything* is still owed (base, the RPS
// charge if assessed, or any additional charge); "paid" means every applicable
// charge is confirmed; "none" means the order hasn't reached a billable stage yet
// (held / submitted, before KTC accepts + sets charges).
export type JoPaymentState = 'paid' | 'balance' | 'none'

export function joPaymentState(o: Pick<JobOrder,
  'status' | 'payment_status' | 'rps_status' | 'rps_payment_status' | 'supplements'>): JoPaymentState {
  const baseDue = o.payment_status !== 'confirmed'
  const rpsDue = o.rps_status === 'needed' && o.rps_payment_status !== 'confirmed'
  // Only a BILLED charge (amount set by the cashier) counts as owed — a 'requested',
  // not-yet-priced charge is internal staff queue work, not a customer balance.
  const suppDue = (o.supplements ?? []).some((s) => s.amount > 0 && s.payment_status !== 'confirmed')
  const anyDue = baseDue || rpsDue || suppDue

  // The base charge is collectible once KTC accepts the order (processing+). Before
  // that there is nothing to pay, so show no money pill. Once any payment is in
  // flight, or a supplement exists, it's billable regardless of status.
  const billable =
    o.status === 'processing' || o.status === 'completed' ||
    o.payment_status === 'submitted' || o.payment_status === 'confirmed' ||
    (o.supplements ?? []).some((s) => s.amount > 0)

  if (!billable) return 'none'
  return anyDue ? 'balance' : 'paid'
}

// True when a payment proof (base / RPS / any supplement) is sitting "submitted"
// and waiting on the cashier — used to surface a "to review" cue on the admin side.
export function hasPaymentToReview(o: Pick<JobOrder,
  'payment_status' | 'rps_payment_status' | 'supplements'>): boolean {
  return o.payment_status === 'submitted' ||
    o.rps_payment_status === 'submitted' ||
    (o.supplements ?? []).some((s) => s.payment_status === 'submitted')
}
