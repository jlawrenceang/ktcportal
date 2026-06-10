import { useEffect, useState, type FormEvent } from 'react'
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
  const { broker } = useBroker()

  // Consignee picker — searchable typeahead over the full master list.
  // (No per-broker accreditation gate: any registered broker can pick any consignee.)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Consignee[]>([])
  const [searching, setSearching] = useState(false)
  const [showList, setShowList] = useState(false)
  const [consigneeId, setConsigneeId] = useState('')

  const [entryNumber, setEntryNumber] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdJo, setCreatedJo] = useState<string | null>(null)
  const [createdHeld, setCreatedHeld] = useState(false)

  // Debounced server-side search (the master list has thousands of rows, past
  // the 1000-row select cap — so we query as the broker types).
  useEffect(() => {
    if (consigneeId) return // a consignee is selected; don't search
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from('consignees')
        .select('id, code, name')
        .or(`code.ilike.%${q}%,name.ilike.%${q}%`)
        .order('code')
        .limit(40)
      setResults((data ?? []) as Consignee[])
      setSearching(false)
    }, 250)
    return () => clearTimeout(handle)
  }, [query, consigneeId])

  function selectConsignee(c: Consignee) {
    setConsigneeId(c.id)
    setQuery(`${c.code} – ${c.name}`)
    setShowList(false)
  }
  function clearConsignee() {
    setConsigneeId('')
    setQuery('')
    setResults([])
    setShowList(true)
  }

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((ls) => [...ls, emptyLine()])
  }
  function removeLine(i: number) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)))
  }

  const approved = broker?.status === 'approved'
  const hasId = !!broker?.valid_id_path

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!broker) {
      setError('Customer profile not found.')
      return
    }
    if (!consigneeId) {
      setError('Select a consignee from the list.')
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
        consignee_id: consigneeId,
        entry_number: entryNumber.trim() || null,
        // Pending brokers file as 'held' (released to the admin queue on approval);
        // approved brokers go straight to 'submitted'. Enforced by RLS either way.
        status: approved ? 'submitted' : 'held',
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
    setCreatedJo((jo as { jo_number: string | null }).jo_number)
    setCreatedHeld(!approved)
    clearConsignee()
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

        {(createdJo || createdHeld) && (
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
            {createdHeld ? '✅ Job order filed (held).' : <>✅ Job Order <b>{createdJo}</b> submitted.</>}
            {createdHeld && (
              <div style={{ marginTop: 4, fontSize: 13 }}>
                It’s <b>held — it can’t be processed until you pass final verification</b>, and it gets its official JO number when released.{' '}
                {hasId
                  ? 'Your valid ID is on file; a KTC admin will verify your account, then it’s sent automatically.'
                  : 'Upload your valid ID for final verification (banner above) so KTC can process your job orders.'}
              </div>
            )}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="consignee">Consignee</label>
            <div style={{ position: 'relative' }}>
              <input
                id="consignee"
                className="ktc-input"
                placeholder="Search consignee by code or name…"
                value={query}
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value)
                  setConsigneeId('')
                  setShowList(true)
                }}
                onFocus={() => {
                  if (!consigneeId) setShowList(true)
                }}
                onBlur={() => setTimeout(() => setShowList(false), 150)}
              />
              {consigneeId && (
                <button
                  type="button"
                  className="ktc-link"
                  onClick={clearConsignee}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}
                >
                  Change
                </button>
              )}
              {showList && !consigneeId && (
                <div
                  role="listbox"
                  style={{
                    position: 'absolute',
                    zIndex: 20,
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    maxHeight: 260,
                    overflowY: 'auto',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.92)',
                    backdropFilter: 'blur(20px) saturate(1.6)',
                    border: '1px solid var(--glass-brd)',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
                    padding: 6,
                  }}
                >
                  {searching ? (
                    <div className="ktc-label" style={{ padding: '8px 10px', fontSize: 13 }}>Searching…</div>
                  ) : query.trim().length < 2 ? (
                    <div className="ktc-label" style={{ padding: '8px 10px', fontSize: 13 }}>
                      Type at least 2 characters to search the consignee master list.
                    </div>
                  ) : results.length === 0 ? (
                    <div className="ktc-label" style={{ padding: '8px 10px', fontSize: 13 }}>No matches.</div>
                  ) : (
                    results.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        // onMouseDown (not onClick) so selection fires before the input blur closes the list
                        onMouseDown={(e) => {
                          e.preventDefault()
                          selectConsignee(c)
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <b>{c.code}</b> – {c.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
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
