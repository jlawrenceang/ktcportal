import { serviceLineOf, hasOutstandingSupplements, type JobOrder, type ServiceLine } from './types'

// Two-gate release model (the "cleared for release" / gate-pass signal).
//
// An order leaves KTC only when BOTH independent gates are clear — they run in
// parallel, by different desks, in either order:
//   • Payment gate  — cashier: payment confirmed (+ RPS if needed, no unpaid
//                     supplements). Also satisfied once an ERP invoice is on file.
//   • X-ray gate    — checker: every service line the order needs is completed.
// "Cleared for release" is the DERIVED convergence of the two — never stored, so
// it can't drift. (NB: "lifted" is the BOC term for a customs hold being removed,
// a separate gate KTC doesn't own — see the release-status notes / Tagalog copy.)
export type PaymentState =
  | 'unpaid' | 'submitted' | 'rejected' | 'confirmed' | 'rps_due' | 'supplement_due'

export interface ReleaseState {
  /** False for held / cancelled / rejected — no release path applies. */
  applicable: boolean
  // ── payment track ──
  paymentDone: boolean
  paymentState: PaymentState
  // ── X-ray / service track ──
  services: { line: ServiceLine; done: boolean }[]
  serviceTotal: number
  serviceDone: number
  serviceComplete: boolean
  // ── converged ──
  cleared: boolean
}

export function releaseState(o: JobOrder): ReleaseState {
  const applicable = !['held', 'cancelled', 'rejected'].includes(o.status)

  // X-ray gate — every distinct service line the order needs has a completion.
  const needed = new Set<ServiceLine>((o.lines ?? []).map((l) => serviceLineOf(l.service_request)))
  const doneSet = new Set((o.completions ?? []).map((c) => c.service_line))
  const services = Array.from(needed).map((line) => ({ line, done: doneSet.has(line) }))
  const serviceTotal = services.length
  const serviceDone = services.filter((s) => s.done).length
  const serviceComplete = serviceTotal > 0 && serviceDone === serviceTotal

  // Payment gate — paid (or invoiced), with no RPS / supplement still owed.
  const paid = o.payment_status === 'confirmed' || !!o.service_invoice_no
  const rpsDue = o.rps_status === 'needed' && o.rps_payment_status !== 'confirmed'
  const supplementDue = hasOutstandingSupplements(o)
  const paymentDone = paid && !rpsDue && !supplementDue

  let paymentState: PaymentState
  if (supplementDue) paymentState = 'supplement_due'
  else if (paid && rpsDue) paymentState = 'rps_due'
  else if (paid) paymentState = 'confirmed'
  else if (o.payment_status === 'submitted') paymentState = 'submitted'
  else if (o.payment_status === 'rejected') paymentState = 'rejected'
  else paymentState = 'unpaid'

  const cleared = o.status === 'completed' || (applicable && serviceComplete && paymentDone)
  return { applicable, paymentDone, paymentState, services, serviceTotal, serviceDone, serviceComplete, cleared }
}
