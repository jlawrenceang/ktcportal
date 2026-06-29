import { supabase } from './supabase'
import type { PickerItem } from '../components/SearchPicker'

// Strip PostgREST-significant characters before interpolating user input into an
// .or() filter string. Commas/parens/%/* are filter syntax in a logic tree, so
// raw input could otherwise malform or broaden the query (bounded by RLS, but we
// sanitize anyway — same guard Consignees.tsx already applies).
const orSafe = (q: string) => q.replace(/[,()%*\\]/g, ' ').trim()

/** Consignee master-list search (code or name) — used by the customer JO form
 *  and the admin file-on-behalf form. Goes through the column-scoped, anti-scrape
 *  `search_consignees` RPC (id/code/name only, server-side gate + limit) so the
 *  master list's PII (TIN / contact) is never exposed to brokers (ADR-0037). */
export async function searchConsignees(q: string): Promise<PickerItem[]> {
  const { data } = await supabase.rpc('search_consignees', { p_q: q })
  return ((data ?? []) as { id: string; code: string; name: string }[])
    .map((c) => ({ id: c.id, title: c.code, sub: c.name }))
}

/** Customer search for the admin file-on-behalf form. Staff rows are excluded;
 *  rejected/suspended accounts can't have orders filed (the RPC re-checks). */
export async function searchCustomers(q: string): Promise<PickerItem[]> {
  const s = orSafe(q)
  const { data } = await supabase
    .from('customers')
    .select('id, customer_code, full_name, email, status')
    .or(`full_name.ilike.%${s}%,customer_code.ilike.%${s}%,email.ilike.%${s}%`)
    .is('staff_role', null)
    .in('status', ['approved', 'pending'])
    .order('full_name')
    .limit(30)
  return ((data ?? []) as { id: string; customer_code: string | null; full_name: string | null; email: string | null; status: string }[])
    .map((c) => ({
      id: c.id,
      title: c.customer_code ?? '—',
      sub: `${c.full_name ?? 'Unnamed'}${c.email ? ` · ${c.email}` : ''}${c.status === 'pending' ? ' · PENDING' : ''}`,
    }))
}
