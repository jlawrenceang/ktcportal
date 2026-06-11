import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import SearchPicker, { type PickerItem } from '../components/SearchPicker'
import ContainerLinesEditor, { emptyLine, type LineDraft } from '../components/ContainerLinesEditor'
import { searchConsignees } from '../lib/pickerSearches'

export default function JobOrder() {
  const { broker } = useBroker()
  const navigate = useNavigate()

  // Consignee picker — searchable typeahead over the full master list.
  // (No per-broker accreditation gate: any registered broker can pick any consignee.)
  const [consignee, setConsignee] = useState<PickerItem | null>(null)
  const [entryNumber, setEntryNumber] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Ref guard: state updates are async, so a rapid double-click can pass a
  // `busy` check twice and file the order twice.
  const submittingRef = useRef(false)

  const approved = broker?.status === 'approved'
  const hasId = !!broker?.valid_id_path

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    setError(null)
    if (!broker) {
      setError('Customer profile not found.')
      return
    }
    if (!consignee) {
      setError('Select a consignee from the list.')
      return
    }
    const filled = lines.filter((l) => l.container_number.trim())
    if (filled.length === 0) {
      setError('Add at least one container.')
      return
    }
    submittingRef.current = true
    setBusy(true)
    const { data: jo, error: joErr } = await supabase
      .from('job_orders')
      .insert({
        customer_id: broker.id,
        consignee_id: consignee.id,
        entry_number: entryNumber.trim() || null,
        // Pending brokers file as 'held' (released to the admin queue on approval);
        // approved brokers go straight to 'submitted'. Enforced by RLS either way.
        status: approved ? 'submitted' : 'held',
      })
      .select('id, jo_number')
      .single()

    if (joErr || !jo) {
      submittingRef.current = false
      setBusy(false)
      setError(joErr?.message ?? 'Could not create job order.')
      return
    }
    const { error: lineErr } = await supabase.from('job_order_lines').insert(
      filled.map((l) => ({
        job_order_id: (jo as { id: string }).id,
        container_number: l.container_number.trim(),
        service_request: l.service_request,
      })),
    )
    setBusy(false)
    if (lineErr) {
      submittingRef.current = false
      setError(lineErr.message)
      return
    }
    // Redirect to the list and auto-expand the order we just filed.
    sessionStorage.setItem('ktc_jo_filed_id', (jo as { id: string }).id)
    navigate('/job-orders')
  }

  return (
    <Shell>
      <div className="ktc-glass" style={{ padding: 28 }}>
        <h1 className="ktc-title">New Job Order</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 22 }}>
          For X-ray / DEA / OOG stripping service orders.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
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

          {!approved && (
            <div style={{ fontSize: 13, lineHeight: 1.6, padding: '10px 12px', borderRadius: 10, background: 'hsl(40 90% 97%)', border: '1px solid hsl(35 85% 82%)', color: 'hsl(30 60% 32%)' }}>
              You can file job orders now, but they <b>can’t be processed until you pass final verification</b>.{' '}
              {hasId
                ? 'Your valid ID is on file — a KTC admin is verifying your account. Once approved, your held orders are sent to KTC automatically.'
                : 'Upload your valid ID for final verification (banner above); once a KTC admin approves you, your held orders are sent automatically.'}
            </div>
          )}

          <button className="ktc-btn" type="submit" disabled={busy} style={{ marginTop: 4 }}>
            {busy ? (approved ? 'Submitting…' : 'Filing…') : approved ? 'Submit Job Order' : 'File Job Order'}
          </button>
        </form>
      </div>
    </Shell>
  )
}
