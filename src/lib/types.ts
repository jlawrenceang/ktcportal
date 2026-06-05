export interface Consignee {
  id: string
  code: string
  name: string
}

export interface Broker {
  id: string
  user_id: string
  customer_id: string | null
  company_name: string | null
  email: string | null
  is_admin: boolean
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
