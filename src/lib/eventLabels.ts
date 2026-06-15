import { SERVICE_LINE_LABEL, type JobOrderEvent, type ServiceLine } from './types'

/** BI-INV-… = billed on credit (not cash-paid); OR-INV-… / OR pad serial = cash. */
export const isCreditInvoice = (si: string) => si.toUpperCase().startsWith('BI')

/** Human labels for job-order audit-trail events (G6). Shared by the admin
 *  queue's History expander and the Logs tab. */
export function joEventLabel(e: JobOrderEvent): string {
  const d = e.detail as { from?: string; to?: string; line?: string; si?: string; pad?: string; note?: string }
  switch (e.event) {
    case 'filed': return 'Filed'
    case 'edited': return 'Order details edited'
    case 'status_changed': return `Status: ${d.from} → ${d.to}${d.note ? ` — “${d.note}”` : ''}`
    case 'service_done': return `${SERVICE_LINE_LABEL[(d.line as ServiceLine) ?? 'other']} done`
    case 'payment_submitted': return 'Payment proof submitted'
    case 'payment_confirmed': return 'Payment confirmed'
    case 'payment_rejected': return `Payment proof rejected${d.note ? ` — “${d.note}”` : ''}`
    case 'payment_unpaid': return 'Payment reset'
    case 'invoice_recorded': return `Service Invoice ${d.si ?? ''}${d.pad ? ` · #${d.pad}` : ''} recorded (${isCreditInvoice(String(d.si ?? '')) ? 'BILLED · credit' : 'PAID'})`
    case 'archived': return 'Archived'
    default: return e.event
  }
}

/** Labels for security_events kinds. */
export const SECURITY_EVENT_LABEL: Record<string, string> = {
  protected_field_attempt: '🚨 Blocked privilege-escalation attempt',
  role_gate_changed: 'Role gate changed',
  session_evicted: 'Session evicted — account signed in on a new device',
}
