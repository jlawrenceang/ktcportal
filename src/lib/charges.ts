import { supabase } from './supabase'

// Shared types + helpers for the X-ray anti-fraud charge tools (ADR-0037 Phase A).
// One owning file for the `charges` / `charge_audit` shapes so the admin charge
// approval, reconciliation, and audit screens don't redeclare them.

export type ChargeType = 'service' | 'rps' | 'addon'
export type BillStatus = 'proposed' | 'billed' | 'cancelled'
export type InvoiceState = 'draft' | 'final'
export type ChargePaymentStatus = 'unpaid' | 'submitted' | 'confirmed' | 'rejected' | 'reversed'

export interface Charge {
  id: string
  job_order_id: string
  charge_type: ChargeType
  label: string
  qty: number
  unit_rate: number | null
  amount: number | null
  vatable: boolean
  bill_status: BillStatus
  approved_by: string | null
  erp_invoice_no: string | null
  bir_invoice_no: string | null
  invoice_state: InvoiceState
  invoice_recorded_at: string | null
  payment_status: ChargePaymentStatus
  payment_order_id: string | null
  created_by: string | null
  created_at: string
  // Embedded for display context.
  job_order?: { jo_number: string | null; status: string | null; consignee?: { code: string; name: string } | null } | null
}

export interface ChargeAuditRow {
  charge_id: string
  action: string
  actor: string | null
  detail: Record<string, unknown> | null
  at: string
}

// Postgrest embeds return a single related row as an object OR (under some FK
// shapes) a one-element array — normalise to a single value (mirrors the `one`
// helpers already used in AllJobOrders / CashierStation).
export function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

/**
 * Resolve a set of actor / staff ids to a human display name. A charge's
 * created_by / approved_by and a charge_audit actor may be stored as either the
 * auth user_id or the customers row id, so we look up BOTH and key the map by
 * each — an unresolved id falls back to a short prefix at the call site.
 */
export async function resolveNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)))
  const map = new Map<string, string>()
  if (!uniq.length) return map
  const [{ data: byId }, { data: byUid }] = await Promise.all([
    supabase.from('customers').select('id, full_name, email').in('id', uniq),
    supabase.from('customers').select('user_id, full_name, email').in('user_id', uniq),
  ])
  for (const c of (byId ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
    map.set(c.id, c.full_name || c.email || c.id)
  }
  for (const c of (byUid ?? []) as { user_id: string | null; full_name: string | null; email: string | null }[]) {
    if (c.user_id) map.set(c.user_id, c.full_name || c.email || c.user_id)
  }
  return map
}

// Short fallback for an id with no resolved name (so the UI never shows a raw
// 36-char uuid).
export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : '—'
}
