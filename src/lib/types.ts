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
  broker_code: string | null
  customer_id: string | null
  company_name: string | null
  full_name: string | null
  email: string | null
  valid_id_path: string | null
  status: BrokerStatus
  decided_at: string | null
  decision_reason: string | null
  email_confirmed_at: string | null
  is_admin: boolean
  is_owner: boolean
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

export type AccreditationStatus = 'pending' | 'approved' | 'rejected'

export interface Accreditation {
  id: string
  broker_id: string
  consignee_id: string
  status: AccreditationStatus
  requested_at: string
  consignee?: Consignee | null
}

export interface JobOrderLine {
  id: string
  job_order_id: string
  container_number: string
  service_request: string
}

export interface JobOrder {
  id: string
  jo_number: string
  broker_id: string
  consignee_id: string | null
  entry_number: string | null
  status: string
  created_at: string
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
