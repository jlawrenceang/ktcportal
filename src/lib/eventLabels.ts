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

/** Human labels for security_events kinds — the full set actually emitted by
 *  log_security_event / direct inserts across the migrations (0046 role gate +
 *  protected-field, 0055/0116 session + sign-in, 0092 privilege grant, 0093
 *  owner grant/revoke, 0115 status + password reset, 0116 valid-ID delete, 0135
 *  fuel config). Any unlabeled kind falls back to its raw enum at the call site,
 *  so a newly-added kind shows its code rather than crashing. */
export const SECURITY_EVENT_LABEL: Record<string, string> = {
  protected_field_attempt: 'Blocked privilege-escalation attempt',
  privilege_granted: 'Privileged role granted',
  owner_granted: 'Owner access granted',
  owner_revoked: 'Owner access revoked',
  role_gate_changed: 'Role permission changed',
  customer_status_changed: 'Account status changed',
  staff_password_reset: 'Staff password reset',
  valid_id_deleted: 'Valid ID deleted',
  sign_in: 'Staff sign-in',
  session_evicted: 'Session evicted — account signed in on a new device',
  fuel_config_changed: 'Fuel settings changed',
}

/** A short, human one-liner built from a security event's JSON `detail`, shown
 *  in place of the raw blob. Returns undefined when there's nothing useful to
 *  summarise — the caller then falls back to the raw detail / kind. Defensive:
 *  every field is optional, so an empty or malformed detail just yields a
 *  shorter line (or undefined) and never throws. */
export function securityEventSummary(kind: string, detail: Record<string, unknown> | null | undefined): string | undefined {
  const d = (detail ?? {}) as Record<string, unknown>
  const s = (v: unknown) => (v == null ? '' : String(v))
  switch (kind) {
    case 'protected_field_attempt': {
      const fields = Array.isArray(d.fields) ? d.fields.map(String) : []
      return fields.length ? `Tried to set: ${fields.join(', ')}` : undefined
    }
    case 'privilege_granted': {
      const who = s(d.email) || 'account'
      const role = d.is_owner ? 'owner' : d.is_admin ? 'admin' : s(d.staff_role) || 'staff'
      return `${who} → ${role}${d.by_db_context ? ' · direct DB write (no app session)' : ''}`
    }
    case 'owner_granted':
    case 'owner_revoked':
      return s(d.email) || undefined
    case 'role_gate_changed': {
      const role = s(d.role), perm = s(d.permission)
      if (!role && !perm) return undefined
      return `${role} · ${perm} → ${d.allowed ? 'allowed' : 'denied'}`
    }
    case 'customer_status_changed': {
      const from = s(d.from), to = s(d.to), reason = s(d.reason)
      if (!from && !to) return undefined
      return `${from || '?'} → ${to || '?'}${reason ? ` — “${reason}”` : ''}`
    }
    case 'staff_password_reset':
      return s(d.username) ? `Staff: ${s(d.username)}` : undefined
    case 'valid_id_deleted':
      return s(d.path) ? `File: ${s(d.path)}` : undefined
    case 'sign_in':
      return s(d.aal) === 'aal2' ? 'Signed in (2-factor)' : 'Signed in'
    case 'session_evicted': {
      const n = typeof d.evicted_sessions === 'number' ? d.evicted_sessions : Number(d.evicted_sessions)
      return Number.isFinite(n) ? `${n} other session(s) signed out` : undefined
    }
    case 'fuel_config_changed': {
      const op = s(d.op), table = s(d.table)
      if (!op && !table) return undefined
      return `${op || 'change'} on ${table || 'fuel config'}`
    }
    default:
      return undefined
  }
}
