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

interface EditState {
  id: string; code: string; name: string; address: string; tin: string; doc_2303_path: string | null
}

async function upload2303(consigneeId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
  const path = `${consigneeId}/2303.${ext}`
  const { error } = await supabase.storage.from('consignee-docs').upload(path, file, { upsert: true })
  if (error) throw new Error(error.message)
  return path
}

async function view2303(path: string | null, onErr: (m: string) => void) {
  if (!path) return
  const { data, error } = await supabase.storage.from('consignee-docs').createSignedUrl(path, 60)
  if (error || !data) return onErr(error?.message ?? 'Could not open document.')
  window.open(data.signedUrl, '_blank', 'noopener')
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

  // add form
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [address, setAddress] = useState('')
  const [tin, setTin] = useState('')
  const [doc, setDoc] = useState<File | null>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)

  // edit
  const [editing, setEditing] = useState<EditState | null>(null)
  const [editDoc, setEditDoc] = useState<File | null>(null)

  async function load() {
    setLoading(true)
    const s = query.replace(/[,()%*]/g, ' ').trim()
    let req = supabase
      .from('consignees')
      .select('id, code, name, status, address, tin, doc_2303_path', { count: 'exact' })
      .order('code')
      .range(page * PAGE, page * PAGE + PAGE - 1)
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

  async function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const rows = rowsToConsignees(parseCsv(await file.text()))
      if (rows.length === 0) throw new Error('No valid rows found. Expected a name column (and optional code).')
      await bulkUpsert(rows)
      setNotice(`Imported ${rows.length} row${rows.length === 1 ? '' : 's'} (pending; add address/TIN/2303 to approve).`)
      setPage(0); await load()
    } catch (err) { setError(friendly(err)) }
    finally { setBusy(false); if (csvRef.current) csvRef.current.value = '' }
  }

  async function addOne(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (n.length < MIN_NAME) { setError(`Name must be at least ${MIN_NAME} characters.`); return }
    setBusy(true); setError(null); setNotice(null)
    try {
      const row: { name: string; code?: string; address?: string; tin?: string } = { name: n }
      if (code.trim()) row.code = code.trim()
      if (address.trim()) row.address = address.trim()
      if (tin.trim()) row.tin = tin.trim()
      const { data, error } = await supabase.from('consignees').insert(row).select('id, code').single()
      if (error) throw error
      const created = data as { id: string; code: string }
      if (doc) {
        const path = await upload2303(created.id, doc)
        await supabase.from('consignees').update({ doc_2303_path: path }).eq('id', created.id)
      }
      setNotice(`Added ${created.code} – ${n} (pending approval).`)
      setName(''); setCode(''); setAddress(''); setTin(''); setDoc(null)
      if (docRef.current) docRef.current.value = ''
      await load()
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

  async function saveEdit() {
    if (!editing) return
    const n = editing.name.trim(), cc = editing.code.trim()
    if (n.length < MIN_NAME) { setError(`Name must be at least ${MIN_NAME} characters.`); return }
    if (!cc) { setError('Code cannot be empty.'); return }
    setBusy(true); setError(null)
    try {
      let docPath = editing.doc_2303_path
      if (editDoc) docPath = await upload2303(editing.id, editDoc)
      const { error } = await supabase.from('consignees')
        .update({ code: cc, name: n, address: editing.address.trim() || null, tin: editing.tin.trim() || null, doc_2303_path: docPath })
        .eq('id', editing.id)
      if (error) throw error
      await load()
      setEditing(null); setEditDoc(null); setNotice('Saved.')
    } catch (err) { setError(friendly(err)) }
    finally { setBusy(false) }
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
          Added consignees are <b>pending</b>. A consignee needs <b>address, TIN, and an attached 2303</b> before it
          can be approved; only approved consignees are visible to customers.
        </p>

        <div style={{ display: 'grid', gap: 6, marginBottom: 18, maxWidth: 360 }}>
          <label className="ktc-label" htmlFor="csv">Bulk import CSV (name, optional code)</label>
          <input id="csv" ref={csvRef} type="file" accept=".csv,text/csv" className="ktc-input" onChange={onCsv} disabled={busy} style={{ padding: '9px 13px' }} />
        </div>

        <form onSubmit={addOne} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Consignee name *" w={220}><input className="ktc-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={MIN_NAME} /></Field>
          <Field label="Code (optional)" w={120}><input className="ktc-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="auto" /></Field>
          <Field label="Address" w={260}><input className="ktc-input" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          <Field label="TIN" w={150}><input className="ktc-input" value={tin} onChange={(e) => setTin(e.target.value)} /></Field>
          <Field label="2303 document" w={210}><input ref={docRef} className="ktc-input" type="file" accept="image/*,application/pdf" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} style={{ padding: '9px 11px' }} /></Field>
          <button className="ktc-btn" type="submit" disabled={busy} style={{ width: 'auto', padding: '11px 18px' }}>Add consignee</button>
        </form>

        {busy && <div className="ktc-label" style={{ marginTop: 12 }}>Working…</div>}
        {notice && <div className="ktc-label" style={{ marginTop: 12, fontSize: 13 }}>{notice}</div>}
        {error && <div style={{ marginTop: 12, color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}
      </div>

      <div className="ktc-glass" style={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <select className="ktc-input" value={filter} onChange={(e) => changeFilter(e.target.value as Filter)} style={{ padding: '8px 10px' }}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
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
          <div className="ktc-label" style={{ fontSize: 14 }}>{query || filter !== 'all' ? 'No matches.' : 'No consignees yet.'}</div>
        ) : (
          <div style={{ display: 'grid', gap: 4 }}>
            {list.map((c) => {
              const ss = STATUS_STYLE[c.status] ?? STATUS_STYLE.pending
              const complete = !!(c.address && c.tin && c.doc_2303_path)
              if (editing?.id === c.id) {
                return (
                  <div key={c.id} style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.6)', border: '1px solid var(--glass-brd)', margin: '4px 0' }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <Field label="Code" w={120}><input className="ktc-input" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></Field>
                      <Field label="Name" w={220}><input className="ktc-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
                      <Field label="Address" w={240}><input className="ktc-input" value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
                      <Field label="TIN" w={150}><input className="ktc-input" value={editing.tin} onChange={(e) => setEditing({ ...editing, tin: e.target.value })} /></Field>
                      <Field label={`2303 ${editing.doc_2303_path ? '(replace)' : ''}`} w={200}><input className="ktc-input" type="file" accept="image/*,application/pdf" onChange={(e) => setEditDoc(e.target.files?.[0] ?? null)} style={{ padding: '9px 11px' }} /></Field>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
                      <button className="ktc-link" disabled={busy} onClick={saveEdit} style={{ fontSize: 13, fontWeight: 600 }}>Save</button>
                      <button className="ktc-link" onClick={() => { setEditing(null); setEditDoc(null) }} style={{ fontSize: 13 }}>Cancel</button>
                      {editing.doc_2303_path && <button className="ktc-link" onClick={() => view2303(editing.doc_2303_path, setError)} style={{ fontSize: 13 }}>View current 2303</button>}
                    </div>
                  </div>
                )
              }
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid hsl(var(--line-soft))' }}>
                  <span style={{ flex: 1, fontSize: 14 }}>
                    <b>{c.code}</b> – {c.name}
                    {!complete && c.status !== 'approved' && <span className="ktc-label" style={{ fontSize: 11, marginLeft: 8 }}>⚠ needs address/TIN/2303</span>}
                  </span>
                  {c.doc_2303_path && <button className="ktc-link" onClick={() => view2303(c.doc_2303_path, setError)} style={{ fontSize: 12 }}>2303</button>}
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: ss.bg, color: ss.fg }}>{c.status}</span>
                  {c.status !== 'approved' && <button className="ktc-link" disabled={busy} onClick={() => setStatus(c, 'approved')} style={{ fontSize: 13, color: 'hsl(150 60% 32%)' }}>Approve</button>}
                  {c.status !== 'rejected' && <button className="ktc-link" disabled={busy} onClick={() => setStatus(c, 'rejected')} style={{ fontSize: 13 }}>Reject</button>}
                  <button className="ktc-link" onClick={() => setEditing({ id: c.id, code: c.code, name: c.name, address: c.address ?? '', tin: c.tin ?? '', doc_2303_path: c.doc_2303_path })} style={{ fontSize: 13 }}>Edit</button>
                  <button className="ktc-link" disabled={busy} onClick={() => remove(c)} style={{ fontSize: 13, color: 'var(--acc-2)' }}>Delete</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminShell>
  )
}

function Field({ label, w, children }: { label: string; w: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 6, width: w }}>
      <label className="ktc-label">{label}</label>
      {children}
    </div>
  )
}
