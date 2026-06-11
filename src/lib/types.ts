export interface Consignee {
  id: string
  code: string
  name: string
  status: AccreditationStatus
  address: string | null
  tin: string | null
  doc_2303_path: string | null
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
  status: BrokerStatus
  decided_at: string | null
  decision_reason: string | null
  email_confirmed_at: string | null
  is_admin: boolean
  is_owner: boolean
  /** Staff role ('admin' | 'cashier' | 'checker'); null for customers. */
  staff_role: string | null
  irr_version: string | null
  irr_accepted_at: string | null
  terms_version: string | null
  terms_accepted_at: string | null
  privacy_consent_version: string | null
  privacy_consented_at: string | null
}

/** Owner is a superset of admin — treat both as admin in the UI. */
export function hasAdminAccess(b: Pick<Broker, 'is_admin' | 'is_owner'> | null | undefined): boolean {
  return !!b && (b.is_admin || b.is_owner)
}

/** Any back-office account: owner, admin, or a restricted role (cashier/checker). */
export function isStaff(b: Pick<Broker, 'is_admin' | 'is_owner' | 'staff_role'> | null | undefined): boolean {
  return !!b && (b.is_admin || b.is_owner || !!b.staff_role)
}

// Also the consignee approval status (the accreditation *feature* UI was
// removed 2026-06-11; the DB table remains — see the ADR-0007 addendum).
export type AccreditationStatus = 'pending' | 'approved' | 'rejected'

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
  status: string
  created_at: string
  admin_note: string | null
  customer_note?: string | null
  rejected_recoverable?: boolean
  xray_performed_at?: string | null
  service_invoice_no?: string | null
  invoice_recorded_at?: string | null
  payment_status?: 'unpaid' | 'submitted' | 'confirmed' | 'rejected'
  payment_proof_path?: string | null
  payment_submitted_at?: string | null
  payment_confirmed_at?: string | null
  payment_note?: string | null
  consignee?: Consignee | null
  lines?: JobOrderLine[]
}

export const SERVICE_REQUESTS = [
  'X-ray',
  'DEA ONLY',
  'X-ray + DEA',
  'X-ray + DEA (For PDEA)',
  'DEA ONLY (For PDEA)',
  'OOG Stripping',
] as const
