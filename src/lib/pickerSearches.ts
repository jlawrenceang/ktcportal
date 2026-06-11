import { supabase } from './supabase'
import type { PickerItem } from '../components/SearchPicker'

/** Consignee master-list search (code or name) — used by the customer JO form
 *  and the admin file-on-behalf form. */
export async function searchConsignees(q: string): Promise<PickerItem[]> {
  const { data } = await supabase
    .from('consignees')
    .select('id, code, name')
    .or(`code.ilike.%${q}%,name.ilike.%${q}%`)
    .order('code')
    .limit(40)
  return ((data ?? []) as { id: string; code: string; name: string }[])
    .map((c) => ({ id: c.id, title: c.code, sub: c.name }))
}

/** Customer search for the admin file-on-behalf form. Staff rows are excluded;
 *  rejected/suspended accounts can't have orders filed (the RPC re-checks). */
export async function searchCustomers(q: string): Promise<PickerItem[]> {
  const { data } = await supabase
    .from('customers')
    .select('id, customer_code, full_name, email, status')
    .or(`full_name.ilike.%${q}%,customer_code.ilike.%${q}%,email.ilike.%${q}%`)
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
