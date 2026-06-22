// Build the URL to the printable Customer Information Sheet
// (public/customer-info-sheet.html), pre-filled from a consignee's data. The
// static form reads these query params and fills the matching fields, so the
// "Print CIS" buttons (customer request modal + admin Consignees) render a
// filled, printable/downloadable sheet.
export function cisPrintUrl(fields: {
  mode?: 'new' | 'update'
  trade_name?: string
  customer_name?: string
  address1?: string
  address2?: string
  tin?: string
  tel?: string
  mobile?: string
  email?: string
}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(fields)) {
    if (v && String(v).trim()) q.set(k, String(v).trim())
  }
  return '/customer-info-sheet.html?' + q.toString()
}
