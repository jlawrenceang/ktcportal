import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import SearchPicker, { type PickerItem } from '../components/SearchPicker'
import ContainerLinesEditor, { emptyLine, type LineDraft } from '../components/ContainerLinesEditor'
import { searchConsignees, searchCustomers } from '../lib/pickerSearches'

// Admin "file on behalf of" (gap G3) — walk-ins at the window and in-house
// ops. Files straight to 'submitted' via the admin_file_job_order RPC
// (permission-gated server-side; JO number + serving numbers + audit actor
// all come from the same triggers as a customer filing).

interface Filed {
  id: string
  jo_number: string | null
  customer_name: string | null
}

export default function NewJobOrder() {
  const { can, loading } = usePermissions()
  const [customer, setCustomer] = useState<PickerItem | null>(null)
  const [consignee, setConsignee] = useState<PickerItem | null>(null)
  const [entryNumber, setEntryNumber] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filed, setFiled] = useState<Filed | null>(null)
  const submittingRef = useRef(false)

  function reset() {
    setCustomer(null)
    setConsignee(null)
    setEntryNumber('')
    setLines([emptyLine()])
    setFiled(null)
    setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    setError(null)
    if (!customer) { setError('Pick the customer this order is for.'); return }
    if (!consignee) { setError('Select a consignee from the list.'); return }
    const filled = lines.filter((l) => l.container_number.trim())
    if (filled.length === 0) { setError('Add at least one container.'); return }

    submittingRef.current = true
    setBusy(true)
    const { data, error: rpcErr } = await supabase.rpc('admin_file_job_order', {
      p_customer_id: customer.id,
      p_consignee_id: consignee.id,
      p_entry_number: entryNumber.trim() || null,
      p_lines: filled.map((l) => ({
        container_number: l.container_number.trim(),
        service_request: l.service_request,
      })),
    })
    submittingRef.current = false
    setBusy(false)
    if (rpcErr) { setError(rpcErr.message); return }
    setFiled(data as unknown as Filed)
  }

  if (!loading && !can('file_job_orders')) {
    return (
      <AdminShell>
        <div className="ktc-glass" style={{ padding: 28 }}>
          <p className="ktc-label">Your role doesn't have permission to file job orders on behalf of customers.</p>
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 28, maxWidth: 720 }}>
        <h1 className="ktc-title">File for a Customer</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 22 }}>
          Walk-ins and in-house ops — the order is filed under the customer's account and
          enters the line as <b>submitted</b> (serving number assigned now).
        </p>

        {filed ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ fontSize: 15, lineHeight: 1.7, padding: '16px 18px', borderRadius: 12, background: 'hsl(145 60% 96%)', border: '1px solid hsl(145 50% 80%)' }}>
              ✓ Filed <b className="ktc-mono">{filed.jo_number ?? '—'}</b>
              {filed.customer_name ? <> for <b>{filed.customer_name}</b></> : null}.
              Serving numbers are assigned — the slip can be printed now.
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to={`/job-order/${filed.id}/print`} className="ktc-btn" style={{ width: 'auto', padding: '11px 22px', textDecoration: 'none' }}>
                🖨 Print slip
              </Link>
              <button type="button" className="ktc-btn-secondary" onClick={reset} style={{ width: 'auto', padding: '11px 22px' }}>
                + File another
              </button>
              <Link to="/admin/job-orders" className="ktc-link" style={{ alignSelf: 'center' }}>
                View queue →
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="customer">Customer</label>
              <SearchPicker
                inputId="customer"
                placeholder="Search by name, customer code, or email…"
                selected={customer}
                onSelect={setCustomer}
                search={searchCustomers}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="consignee">Consignee</label>
              <SearchPicker
                inputId="consignee"
                placeholder="Search consignee by code or name…"
                selected={consignee}
                onSelect={setConsignee}
                search={searchConsignees}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="entry">Entry Number</label>
              <input
                id="entry"
                className="ktc-input"
                placeholder="e.g. C-0000012345"
                value={entryNumber}
                onChange={(e) => setEntryNumber(e.target.value)}
              />
            </div>

            <ContainerLinesEditor lines={lines} onChange={setLines} />

            {error && <div style={{ color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}

            <button className="ktc-btn" type="submit" disabled={busy} style={{ marginTop: 4 }}>
              {busy ? 'Filing…' : 'File Job Order'}
            </button>
          </form>
        )}
      </div>
    </AdminShell>
  )
}
