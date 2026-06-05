import { useEffect, useRef, useState, type FormEvent } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import type { Consignee } from '../lib/types'

// Minimal CSV parser (handles quotes, embedded commas, CRLF).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = '', record: string[] = [], inQuotes = false, i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
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
  const hasHeader = header.includes('code') && header.includes('name')
  const codeIdx = hasHeader ? header.indexOf('code') : 0
  const nameIdx = hasHeader ? header.indexOf('name') : 1
  const body = hasHeader ? grid.slice(1) : grid
  return body
    .map((r) => ({ code: (r[codeIdx] ?? '').trim(), name: (r[nameIdx] ?? '').trim() }))
    .filter((r) => r.code && r.name)
}

export default function Consignees() {
  const [list, setList] = useState<Consignee[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    const { data, count, error } = await supabase
      .from('consignees')
      .select('id, code, name', { count: 'exact' })
      .order('code')
      .limit(200)
    if (error) { setError(error.message); setLoading(false); return }
    setList((data ?? []) as Consignee[])
    setTotal(count ?? 0)
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  async function upsert(rows: { code: string; name: string }[]) {
    // chunk to keep requests reasonable
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('consignees').upsert(rows.slice(i, i + 500), { onConflict: 'code' })
      if (error) throw new Error(error.message)
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const text = await file.text()
      const rows = rowsToConsignees(parseCsv(text))
      if (rows.length === 0) throw new Error('No valid rows found. Expected columns: code, name.')
      await upsert(rows)
      setNotice(`Imported ${rows.length} consignee${rows.length === 1 ? '' : 's'}.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function addOne(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setNotice(null)
    try {
      const c = code.trim()
      const n = name.trim()
      if (c) {
        // explicit code (e.g. legacy number) — upsert by code
        await upsert([{ code: c, name: n }])
        setNotice(`Saved ${c} – ${n}.`)
      } else {
        // blank code — let the DB auto-generate (CN-00001, …)
        const { data, error } = await supabase.from('consignees').insert({ name: n }).select('code').single()
        if (error) throw new Error(error.message)
        setNotice(`Added ${(data as { code: string }).code} – ${n}.`)
      }
      setCode(''); setName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Consignees</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>
          Master list ({total}). Upload a CSV (export your Excel as CSV) with columns <b>code, name</b>.
          Existing codes are updated, new ones added.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="csv">Import CSV</label>
            <input id="csv" ref={fileRef} type="file" accept=".csv,text/csv" className="ktc-input"
              onChange={onFile} disabled={busy} style={{ padding: '9px 13px' }} />
          </div>
          <form onSubmit={addOne} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="name">Consignee name</label>
              <input id="name" className="ktc-input" value={name} onChange={(e) => setName(e.target.value)} required style={{ width: 220 }} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="code">Code (optional)</label>
              <input id="code" className="ktc-input" value={code} onChange={(e) => setCode(e.target.value)}
                placeholder="auto" style={{ width: 130 }} />
            </div>
            <button className="ktc-btn" type="submit" disabled={busy} style={{ width: 'auto', padding: '11px 18px' }}>Add consignee</button>
          </form>
        </div>

        {busy && <div className="ktc-label" style={{ marginTop: 12 }}>Working…</div>}
        {notice && <div className="ktc-label" style={{ marginTop: 12, fontSize: 13 }}>{notice}</div>}
        {error && <div style={{ marginTop: 12, color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}
      </div>

      <div className="ktc-glass" style={{ padding: 28 }}>
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 600 }}>
          List {total > list.length ? `(showing first ${list.length} of ${total})` : ''}
        </h2>
        {loading ? <span className="ktc-label">Loading…</span> : list.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No consignees yet — import a CSV above.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {list.map((c) => (
              <div key={c.id} style={{ fontSize: 14, padding: '6px 0', borderBottom: '1px solid hsl(var(--line-soft))' }}>
                <b>{c.code}</b> – {c.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
