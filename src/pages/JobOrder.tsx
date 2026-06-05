import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { SERVICE_REQUESTS, type Consignee } from '../lib/types'

interface LineDraft {
  container_number: string
  service_request: string
}

function emptyLine(): LineDraft {
  return { container_number: '', service_request: SERVICE_REQUESTS[0] }
}

export default function JobOrder() {
  const { broker, loading: brokerLoading } = useBroker()
  const [consignees, setConsignees] = useState<Consignee[]>([])
  const [loadingConsignees, setLoadingConsignees] = useState(true)

  const [consigneeId, setConsigneeId] = useState('')
  const [entryNumber, setEntryNumber] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdJo, setCreatedJo] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('accreditations')
      .select('consignee:consignees(id, code, name)')
      .eq('status', 'approved')
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as { consignee: Consignee | Consignee[] | null }[]
        const list = rows
          .map((r) => (Array.isArray(r.consignee) ? (r.consignee[0] ?? null) : r.consignee))
          .filter((c): c is Consignee => !!c)
        setConsignees(list)
        setLoadingConsignees(false)
      })
  }, [])

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((ls) => [...ls, emptyLine()])
  }
  function removeLine(i: number) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!broker) {
      setError('Broker profile not found.')
      return
    }
    const filled = lines.filter((l) => l.container_number.trim())
    if (filled.length === 0) {
      setError('Add at least one container.')
      return
    }
    setBusy(true)
    const { data: jo, error: joErr } = await supabase
      .from('job_orders')
      .insert({
        broker_id: broker.id,
        consignee_id: consigneeId || null,
        entry_number: entryNumber.trim() || null,
      })
      .select('id, jo_number')
      .single()

    if (joErr || !jo) {
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
      setError(lineErr.message)
      return
    }
    setCreatedJo((jo as { jo_number: string }).jo_number)
    setConsigneeId('')
    setEntryNumber('')
    setLines([emptyLine()])
  }

  return (
    <Shell>
      <div className="ktc-glass" style={{ padding: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>New Job Order</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 22 }}>
          For X-ray / DEA / OOG stripping service orders.
        </p>

        {createdJo && (
          <div
            style={{
              marginBottom: 18,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgb(var(--acc-rgb) / 0.1)',
              border: '1px solid rgb(var(--acc-rgb) / 0.25)',
              fontSize: 14,
            }}
          >
            ✅ Job Order <b>{createdJo}</b> submitted.
          </div>
        )}

        {!brokerLoading && !loadingConsignees && consignees.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14, lineHeight: 1.6 }}>
            You have no <b>approved consignees</b> yet. Request accreditation first on the{' '}
            <Link to="/accreditation" className="ktc-link">Accreditation</Link> page — once KTC approves them,
            they'll appear here.
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="consignee">Consignee</label>
              <select
                id="consignee"
                className="ktc-input"
                value={consigneeId}
                onChange={(e) => setConsigneeId(e.target.value)}
                required
              >
                <option value="" disabled>
                  {loadingConsignees ? 'Loading…' : 'Select an accredited consignee'}
                </option>
                {consignees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} – {c.name}
                  </option>
                ))}
              </select>
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

            <div style={{ display: 'grid', gap: 10 }}>
              <span className="ktc-label">Container Details</span>
              {lines.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="ktc-input"
                    style={{ flex: '1 1 45%' }}
                    placeholder="Container number (e.g. ABCD1234567)"
                    value={line.container_number}
                    onChange={(e) => updateLine(i, { container_number: e.target.value })}
                  />
                  <select
                    className="ktc-input"
                    style={{ flex: '1 1 45%' }}
                    value={line.service_request}
                    onChange={(e) => updateLine(i, { service_request: e.target.value })}
                  >
                    {SERVICE_REQUESTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="ktc-link"
                    onClick={() => removeLine(i)}
                    style={{ opacity: lines.length === 1 ? 0.3 : 1 }}
                    aria-label="Remove row"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" className="ktc-link" onClick={addLine} style={{ justifySelf: 'start' }}>
                + Add container
              </button>
            </div>

            {error && <div style={{ color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}

            <button className="ktc-btn" type="submit" disabled={busy} style={{ marginTop: 4 }}>
              {busy ? 'Submitting…' : 'Submit Job Order'}
            </button>
          </form>
        )}
      </div>
    </Shell>
  )
}
