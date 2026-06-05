import { useEffect, useRef, useState, type FormEvent } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import type { AccreditationStatus, Consignee } from '../lib/types'

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = '', record: string[] = [], inQuotes = false, i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue } inQuotes = false; i++; continue }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { record.push(field); field = ''; i++; continue }
    if (ch === '\r') { i++; continue }
    if (ch === '\n') { record.push(field); rows.push(record); record = []; field = ''; i++; continue }
    field += ch; i++
  }
  if (field.length || record.length) { record.push(field); rows.push(record) }
  return rows
}

function rowsToConsignees(grid: string[][]): { code: string; name: string }[] {
  if (grid.length === 0) return []
  const header = grid[0].map((h) => h.trim().toLowerCase())
  const nameIdx = header.findIndex((h) => h === 'name' || h === 'consignee' || h.includes('customer name') || h.includes('consignee name'))
  const codeIdx = header.findIndex((h) => h === 'code')
  const nIdx = nameIdx >= 0 ? nameIdx : 1
  const cIdx = nameIdx >= 0 ? codeIdx : 0
  const body = nameIdx >= 0 ? grid.slice(1) : grid
  const seen = new Set<string>()
  const out: { code: string; name: string }[] = []
  for (const r of body) {
    const name = (r[nIdx] ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ code: cIdx >= 0 ? (r[cIdx] ?? '').trim() : '', name })
  }
  return out
}

function friendly(err: unknown): string {
  const e = err as { code?: string; message?: string }
  if (e?.code === '23505') return 'A consignee with that name or code already exists.'
  return e?.message ?? 'Something went wrong.'
}

const MIN_NAME = 2
const PAGE = 200
type Filter = 'all' | AccreditationStatus

const STATUS_STYLE: Record<AccreditationStatus, { bg: string; fg: string }> = {
  pending: { bg: 'hsl(40 90% 94%)', fg: 'hsl(35 80% 38%)' },
  approved: { bg: 'hsl(150 50% 93%)', fg: 'hsl(150 60% 30%)' },
  rejected: { bg: 'hsl(0 70% 95%)', fg: 'hsl(0 65% 45%)' },
}

export default function Consignees() {
  const [list, setList] = useState<Consignee[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [editing, setEditing] = useState<{ id: string; code: string; name: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const s = query.replace(/[,()%*]/g, ' ').trim()
    let req = supabase.from('consignees').select('id, code, name, status', { count: 'exact' }).order('code').range(page * PAGE, page * PAGE + PAGE - 1)
    if (s) req = req.or(`name.ilike.*${s}*,code.ilike.*${s}*`)
    if (filter !== 'all') req = req.eq('status', filter)
    const { data, count, error } = await req
    if (error) setError(error.message)
    else { setList((data ?? []) as Consignee[]); setTotal(count ?? 0) }
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(() => { void load() }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter, page])

  function resetTo(p: number) { setPage(p) }
  function changeQuery(v: string) { setQuery(v); setPage(0) }
  function changeFilter(v: Filter) { setFilter(v); setPage(0) }

  async function bulkUpsert(rows: { code: string; name: string }[]) {
    const withCode = rows.filter((r) => r.code)
    const noCode = rows.filter((r) => !r.code)
    for (let i = 0; i < withCode.length; i += 500) {
      const { error } = await supabase.from('consignees').upsert(withCode.slice(i, i + 500), { onConflict: 'code' })
      if (error) throw new Error(error.message)
    }
    for (let i = 0; i < noCode.length; i += 500) {
      const { error } = await supabase.from('consignees').insert(noCode.slice(i, i + 500).map((r) => ({ name: r.name })))
      if (error) throw new Error(error.message)
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const rows = rowsToConsignees(parseCsv(await file.text()))
      if (rows.length === 0) throw new Error('No valid rows found. Expected a name column (and optional code).')
      await bulkUpsert(rows)
      setNotice(`Imported ${rows.length} row${rows.length === 1 ? '' : 's'} (pending approval).`)
      resetTo(0); await load()
    } catch (err) { setError(friendly(err)) }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function addOne(e: FormEvent) {
    e.preventDefault()
    const n = name.trim(), cc = code.trim()
    if (n.length < MIN_NAME) { setError(`Name must be at least ${MIN_NAME} characters.`); return }
    setBusy(true); setError(null); setNotice(null)
    try {
      const row: { name: string; code?: string } = { name: n }
      if (cc) row.code = cc
      const { data, error } = await supabase.from('consignees').insert(row).select('code').single()
      if (error) throw error
      setNotice(`Added ${(data as { code: string }).code} – ${n} (pending approval).`)
      setName(''); setCode(''); await load()
    } catch (err) { setError(friendly(err)) }
    finally { setBusy(false) }
  }

  async function setStatus(c: Consignee, status: AccreditationStatus) {
    setBusy(true); setError(null)
    const { error } = await supabase.from('consignees').update({ status, decided_at: new Date().toISOString() }).eq('id', c.id)
    setBusy(false)
    if (error) return setError(friendly(error))
    if (filter === 'all') setList((l) => l.map((x) => (x.id === c.id ? { ...x, status } : x)))
    else setList((l) => l.filter((x) => x.id !== c.id))
  }

  async function approveAllPending() {
    if (!window.confirm('Approve ALL pending consignees?')) return
    setBusy(true); setError(null); setNotice(null)
    const { error } = await supabase.from('consignees').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('status', 'pending')
    setBusy(false)
    if (error) return setError(friendly(error))
    setNotice('All pending consignees approved.'); resetTo(0); await load()
  }

  async function saveEdit() {
    if (!editing) return
    const n = editing.name.trim(), cc = editing.code.trim()
    if (n.length < MIN_NAME) { setError(`Name must be at least ${MIN_NAME} characters.`); return }
    if (!cc) { setError('Code cannot be empty.'); return }
    setBusy(true); setError(null)
    const { error } = await supabase.from('consignees').update({ code: cc, name: n }).eq('id', editing.id)
    setBusy(false)
    if (error) return setError(friendly(error))
    setList((l) => l.map((c) => (c.id === editing.id ? { ...c, code: cc, name: n } : c)))
    setEditing(null); setNotice('Saved.')
  }

  async function remove(c: Consignee) {
    if (!window.confirm(`Delete ${c.code} – ${c.name}?`)) return
    setBusy(true); setError(null)
    const { error } = await supabase.from('consignees').delete().eq('id', c.id)
    setBusy(false)
    if (error) return setError(friendly(error))
    setList((l) => l.filter((x) => x.id !== c.id)); setTotal((t) => Math.max(0, t - 1)); setNotice(`Deleted ${c.code}.`)
  }

  const from = total === 0 ? 0 : page * PAGE + 1
  const to = Math.min(total, (page + 1) * PAGE)
  const hasPrev = page > 0
  const hasNext = (page + 1) * PAGE < total

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Consignees</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>
          Newly added consignees are <b>pending</b> until approved; only approved ones are visible to brokers.
          Duplicate names/codes are rejected.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="csv">Import CSV</label>
            <input id="csv" ref={fileRef} type="file" accept=".csv,text/csv" className="ktc-input" onChange={onFile} disabled={busy} style={{ padding: '9px 13px' }} />
          </div>
          <form onSubmit={addOne} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="name">Consignee name *</label>
              <input id="name" className="ktc-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={MIN_NAME} style={{ width: 220 }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="code">Code (optional)</label>
              <input id="code" className="ktc-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="auto" style={{ width: 130 }} />
            </div>
            <button className="ktc-btn" type="submit" disabled={busy} style={{ width: 'auto', padding: '11px 18px' }}>Add consignee</button>
          </form>
        </div>

        {busy && <div className="ktc-label" style={{ marginTop: 12 }}>Working…</div>}
        {notice && <div className="ktc-label" style={{ marginTop: 12, fontSize: 13 }}>{notice}</div>}
        {error && <div style={{ marginTop: 12, color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}
      </div>

      <div className="ktc-glass" style={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="ktc-input" value={filter} onChange={(e) => changeFilter(e.target.value as Filter)} style={{ padding: '8px 10px' }}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <button className="ktc-link" onClick={approveAllPending} disabled={busy} style={{ fontSize: 13, fontWeight: 600, color: 'hsl(150 60% 32%)' }}>
              Approve all pending
            </button>
          </div>
          <input className="ktc-input" placeholder="Search code or name…" value={query} onChange={(e) => changeQuery(e.target.value)} style={{ width: 240 }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="ktc-label" style={{ fontSize: 13 }}>{total === 0 ? 'No results' : `Showing ${from}–${to} of ${total}`}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="ktc-link" onClick={() => setPage((p) => p - 1)} disabled={!hasPrev || busy} style={{ fontSize: 13, opacity: hasPrev ? 1 : 0.4 }}>‹ Prev</button>
            <button className="ktc-link" onClick={() => setPage((p) => p + 1)} disabled={!hasNext || busy} style={{ fontSize: 13, opacity: hasNext ? 1 : 0.4 }}>Next ›</button>
          </span>
        </div>

        {loading ? <span className="ktc-label">Loading…</span> : list.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>{query || filter !== 'all' ? 'No matches.' : 'No consignees yet — add or import above.'}</div>
        ) : (
          <div style={{ display: 'grid', gap: 4 }}>
            {list.map((c) => {
              const ss = STATUS_STYLE[c.status] ?? STATUS_STYLE.pending
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid hsl(var(--line-soft))' }}>
                  {editing?.id === c.id ? (
                    <>
                      <input className="ktc-input" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} style={{ width: 120, padding: '6px 10px' }} />
                      <input className="ktc-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ flex: 1, padding: '6px 10px' }} />
                      <button className="ktc-link" disabled={busy} onClick={saveEdit} style={{ fontSize: 13, fontWeight: 600 }}>Save</button>
                      <button className="ktc-link" onClick={() => setEditing(null)} style={{ fontSize: 13 }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 14 }}><b>{c.code}</b> – {c.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: ss.bg, color: ss.fg }}>{c.status}</span>
                      {c.status !== 'approved' && <button className="ktc-link" disabled={busy} onClick={() => setStatus(c, 'approved')} style={{ fontSize: 13, color: 'hsl(150 60% 32%)' }}>Approve</button>}
                      {c.status !== 'rejected' && <button className="ktc-link" disabled={busy} onClick={() => setStatus(c, 'rejected')} style={{ fontSize: 13 }}>Reject</button>}
                      <button className="ktc-link" onClick={() => setEditing({ id: c.id, code: c.code, name: c.name })} style={{ fontSize: 13 }}>Edit</button>
                      <button className="ktc-link" disabled={busy} onClick={() => remove(c)} style={{ fontSize: 13, color: 'var(--acc-2)' }}>Delete</button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
