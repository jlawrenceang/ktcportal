export interface Consignee {
  id: string
  code: string
  name: string
  status: AccreditationStatus
  address: string | null
  tin: string | null
  /** Full Customer Information Sheet contact fields (migration 0166). */
  customer_name?: string | null
  address2?: string | null
  tel?: string | null
  mobile?: string | null
  email?: string | null
  doc_2303_path: string | null
  doc_2307_path?: string | null
  payment_terms?: 'cash' | 'credit'
  requested_by?: string | null
  note?: string | null
  created_at?: string | null
  requested_at?: string | null
  decided_at?: string | null
}

export type BrokerStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

export interface Broker {
  id: string
  user_id: string
  customer_code: string | null
  customer_id: string | null
  company_name: string | null
  full_name: string | null
  email: string | null
  contact_number: string | null
  valid_id_path: string | null
  /** Stamped on upload; the ID becomes deletable 7 days later (0052). */
  valid_id_uploaded_at?: string | null
  status: BrokerStatus
  decided_at: string | null
  decision_reason: string | null
  email_confirmed_at: string | null
  is_admin: boolean
  is_owner: boolean
  is_root_owner?: boolean
  /** Staff role ('admin' | 'operations' | 'cashier' | 'checker' | 'csr' | 'purchaser'); null for customers. */
  staff_role: string | null
  tours_seen?: string[]
  irr_version: string | null
  irr_accepted_at: string | null
  terms_version: string | null
  terms_accepted_at: string | null
  privacy_consent_version: string | null
  privacy_consented_at: string | null
}

/** Valid-ID retention (migration 0053): guaranteed kept 24h (no deletion),
 *  manually deletable 24h–3d, auto-purged at 3 days. */
export const ID_MIN_RETENTION_MS = 24 * 3_600_000
export function idDeletable(b: Pick<Broker, 'valid_id_uploaded_at'>): boolean {
  if (!b.valid_id_uploaded_at) return true // legacy file, age unknown
  return Date.now() - new Date(b.valid_id_uploaded_at).getTime() >= ID_MIN_RETENTION_MS
}

/** Owner is a superset of admin — treat both as admin in the UI. */
export function hasAdminAccess(b: Pick<Broker, 'is_admin' | 'is_owner'> | null | undefined): boolean {
  return !!b && (b.is_admin || b.is_owner)
}

/** Any back-office account: owner, admin, or a restricted role (cashier/checker). */
export function isStaff(b: Pick<Broker, 'is_admin' | 'is_owner' | 'staff_role'> | null | undefined): boolean {
  return !!b && (b.is_admin || b.is_owner || !!b.staff_role)
}

/** Per-role landing page — each restricted role opens on its own work home
 *  (admin/owner default to the admin dashboard). Single source for both the
 *  admin shell start-link and the focused app's "open full portal". */
export function staffHome(b: Pick<Broker, 'staff_role'> | null | undefined): string {
  switch (b?.staff_role) {
    case 'checker': return '/admin/checker'
    case 'operations': return '/admin/job-orders'
    case 'cashier': return '/admin/payment-orders'
    case 'csr': return '/admin/support'
    default: return '/admin'
  }
}

// Also the consignee approval status (the accreditation *feature* UI was
// removed 2026-06-11; the DB table remains — see the ADR-0007 addendum).
export type AccreditationStatus = 'pending' | 'approved' | 'rejected' | 'needs_info'

export type ServiceLine = 'xray' | 'dea' | 'oog' | 'other' | 'queue' | 'priority' | 'rexray'

export const SERVICE_LINE_LABEL: Record<ServiceLine, string> = {
  xray: 'X-ray', dea: 'DEA', oog: 'OOG', other: 'Other', queue: 'Queue', priority: 'Priority', rexray: 'Re-X-ray',
}

/** Which queue/line a service label belongs to (mirrors SQL service_line_of). */
export function serviceLineOf(service: string): ServiceLine {
  const s = service.toLowerCase()
  if (s.includes('x-ray')) return 'xray'
  if (s.includes('dea')) return 'dea'
  if (s.includes('oog')) return 'oog'
  return 'other'
}

/** Weekly per-service-line queue number (separate from the permanent JO number). */
export interface ServingNumber {
  service_line: ServiceLine
  serving_no: number
  week_start: string
  vacated_at: string | null
}

/** Per-service-line completion (a JO completes only when all its lines are done). */
export interface ServiceCompletion {
  service_line: ServiceLine
  completed_at: string
}

/** An additional charge line tagged onto a JO after filing (JO-####-A/B/C…),
 *  with its own payment proof + confirm. Every supplement must be paid before
 *  the order can complete (0101). */
export interface JoSupplement {
  bill_status?: 'requested' | 'billed'
  id: string
  job_order_id?: string
  suffix: string
  label: string
  amount: number
  payment_status: 'unpaid' | 'submitted' | 'confirmed' | 'rejected'
  payment_proof_path?: string | null
  payment_submitted_at?: string | null
  payment_confirmed_at?: string | null
  payment_note?: string | null
  created_at?: string
}

/** True when an order carries an additional charge that isn't yet paid —
 *  the order is "under review" until it's settled. */
export function hasOutstandingSupplements(
  o: { supplements?: JoSupplement[] | null },
): boolean {
  return (o.supplements ?? []).some((s) => s.amount > 0 && s.payment_status !== 'confirmed')
}

export interface JobOrderEvent {
  id: string
  event: string
  detail: Record<string, unknown>
  actor: string | null // auth user id; null = system
  created_at: string
}

export interface JobOrderLine {
  id: string
  job_order_id: string
  container_number: string
  service_request: string
}

export interface JobOrder {
  id: string
  jo_number: string | null
  customer_id: string
  consignee_id: string | null
  entry_number: string | null
  vessel_visit?: string | null
  vessel_name?: string | null
  voyage_number?: string | null
  status: string
  created_at: string
  admin_note: string | null
  customer_note?: string | null
  rejected_recoverable?: boolean
  /** Field-targeted "needs info": which fields staff asked the customer to
   *  re-enter on an on-hold order (subset of consignee/entry/vessel/containers).
   *  null/empty = general hold (note only). Set by hold_job_order (0154). */
  needs_fields?: string[] | null
  has_open_supplement?: boolean
  last_customer_edit_at?: string | null
  xray_performed_at?: string | null
  service_invoice_no?: string | null
  /** Printed OR / Billing Invoice pad serial (the paper the customer holds). */
  invoice_pad_no?: string | null
  invoice_recorded_at?: string | null
  payment_status?: 'unpaid' | 'submitted' | 'confirmed' | 'rejected'
  payment_proof_path?: string | null
  payment_submitted_at?: string | null
  payment_confirmed_at?: string | null
  payment_note?: string | null
  rps_status?: 'not_assessed' | 'not_needed' | 'needed'
  rps_payment_status?: 'unpaid' | 'submitted' | 'confirmed' | 'rejected'
  rps_payment_proof_path?: string | null
  rps_payment_submitted_at?: string | null
  rps_payment_confirmed_at?: string | null
  rps_payment_note?: string | null
  completed_at?: string | null
  archived_at?: string | null
  priority_status?: 'requested' | 'granted' | null
  is_rexray?: boolean
  rexray_status?: 'requested' | 'approved' | null
  rexray_billable?: boolean
  parent_job_order_id?: string | null
  consignee?: Consignee | null
  lines?: JobOrderLine[]
  serving?: ServingNumber[]
  completions?: ServiceCompletion[]
  supplements?: JoSupplement[]
}

// ── Release / pull-out module (ADR-0024, migration 0124) ──────────────────
export type ReleaseStatus =
  | 'submitted' | 'docs_verified' | 'payable' | 'paid' | 'released' | 'on_hold' | 'cancelled'

export interface ReleaseOrder {
  id: string
  release_number: string | null
  customer_id: string
  consignee_id: string | null
  bl_number: string
  doc_path: string | null
  /** Staff-uploaded bill / SOA (release-docs bucket, bills/<id>.<ext>); 0188. */
  bill_doc_path?: string | null
  status: ReleaseStatus
  verified_at?: string | null
  amount?: number | null
  charges_note?: string | null
  charges_set_at?: string | null
  payment_status: 'unpaid' | 'submitted' | 'confirmed' | 'rejected'
  payment_proof_path?: string | null
  payment_submitted_at?: string | null
  payment_confirmed_at?: string | null
  payment_note?: string | null
  or_number?: string | null
  released_at?: string | null
  /** ERP (Frappe) service-invoice control no. recorded with the OR — the ERP link. */
  service_invoice_no?: string | null
  invoice_recorded_at?: string | null
  staff_note?: string | null
  created_at: string
  consignee?: { code: string; name: string } | null
  broker?: { full_name: string | null; email: string | null } | null
  supplements?: ReleaseSupplement[]
}

export interface ReleaseSupplement {
  id: string
  release_order_id?: string
  label: string
  amount: number
  payment_status: 'unpaid' | 'submitted' | 'confirmed' | 'rejected'
  payment_proof_path?: string | null
  payment_submitted_at?: string | null
  payment_note?: string | null
  created_at?: string
}

export const RELEASE_STATUS_LABEL: Record<ReleaseStatus, string> = {
  submitted: 'Awaiting document check',
  docs_verified: 'Documents verified',
  payable: 'Ready for payment',
  paid: 'Paid — claim OR at office',
  released: 'Released',
  on_hold: 'Needs a corrected document',
  cancelled: 'Cancelled',
}

// Last-resort fallback only — the live catalogue is service_rates
// (admin-managed in Settings; cached per browser by useServices).
export const SERVICE_REQUESTS = [
  'X-Ray',
  'DEA',
  'X-Ray + DEA',
  'X-Ray + DEA (For PDEA)',
] as const
