import { useEffect, useRef, useState, type FormEvent } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import type { AccreditationStatus, Consignee } from '../lib/types'
import { prepareUpload } from '../lib/validation'
import { useFileViewer } from '../components/FileViewerModal'
import { cisPrintUrl } from '../lib/cis'
import { usePermissions } from '../lib/usePermissions'
import { useT } from '../lib/i18n'
import { AlertTriangleIcon, CheckCircleIcon } from '../components/icons'

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

function friendly(err: unknown, t: (k: string, vars?: Record<string, string | number>) => string): string {
  const e = err as { code?: string; message?: string }
  if (e?.code === '23505') return t('A consignee with that name or code already exists.')
  return e?.message ?? t('Something went wrong.')
}

const MIN_NAME = 2
const PAGE = 200
type Filter = 'all' | 'needs_docs' | AccreditationStatus

const STATUS_STYLE: Record<AccreditationStatus, { bg: string; fg: string }> = {
  pending: { bg: 'var(--c-h40-90-94)', fg: 'var(--c-h35-80-38)' },
  approved: { bg: 'var(--c-h150-50-93)', fg: 'var(--c-h150-60-30)' },
  rejected: { bg: 'var(--c-h0-70-95)', fg: 'var(--c-h0-65-45)' },
  needs_info: { bg: 'var(--c-h40-95-92)', fg: 'var(--c-h30-70-38)' },
}

interface EditState {
  id: string; code: string; name: string; address: string; tin: string; doc_2303_path: string | null
}

async function upload2303(consigneeId: string, file: File): Promise<string> {
  const prepared = await prepareUpload(file) // oversized images auto-compress
  if ('error' in prepared) throw new Error(prepared.error)
  const ext = prepared.file.name.split('.').pop()?.toLowerCase() || 'pdf'
  const path = `${consigneeId}/2303.${ext}`
  const { error } = await supabase.storage.from('consignee-docs').upload(path, prepared.file, { upsert: true })
  if (error) throw new Error(error.message)
  return path
}

export default function Consignees() {
  const { t } = useT()
  const { can } = usePermissions()
  // Full management (add/edit/delete/bulk) = manage_consignees (admin/owner).
  // Review-only (approve/reject/needs info) = also CSR via review_consignee_requests.
  const canManage = can('manage_consignees')
  const canReview = canManage || can('review_consignee_requests')
  const [list, setList] = useState<Consignee[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { openFromStorage, viewerModal } = useFileViewer(setError)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)

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
  // detail modal (clickable row)
  const [selected, setSelected] = useState<Consignee | null>(null)
  const [requester, setRequester] = useState<{ full_name: string | null; email: string | null } | null>(null)

  async function load() {
    setLoading(true)
    const s = query.replace(/[,()%*]/g, ' ').trim()
    let req = supabase
      .from('consignees')
      .select('id, code, name, status, address, tin, doc_2303_path, doc_2307_path, requested_by, note, created_at, requested_at, decided_at', { count: 'exact' })
      .order('code')
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (s) req = req.or(`name.ilike.*${s}*,code.ilike.*${s}*,address.ilike.*${s}*`)
    if (filter === 'needs_docs') req = req.is('doc_2303_path', null)
    else if (filter !== 'all') req = req.eq('status', filter)
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

  // Keep the "pending" count fresh for the bulk-approve bar — recompute whenever
  // the visible list changes (after any load or status action).
  useEffect(() => {
    void supabase.from('consignees').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0))
  }, [list])

  // When the detail modal opens a customer-requested consignee, look up who filed it.
  useEffect(() => {
    setRequester(null)
    const id = selected?.requested_by
    if (!id) return
    void supabase.from('customers').select('full_name, email').eq('id', id).maybeSingle()
      .then(({ data }) => setRequester((data as { full_name: string | null; email: string | null } | null) ?? { full_name: null, email: null }))
  }, [selected?.requested_by])

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
      if (rows.length === 0) throw new Error(t('No valid rows found. Expected a name column (and optional code).'))
      await bulkUpsert(rows)
      setNotice(t('Imported {n} row(s) (pending; add address/TIN/2303 to approve).', { n: rows.length }))
      setPage(0); await load()
    } catch (err) { setError(friendly(err, t)) }
    finally { setBusy(false); if (csvRef.current) csvRef.current.value = '' }
  }

  async function addOne(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (n.length < MIN_NAME) { setError(t('Name must be at least {n} characters.', { n: MIN_NAME })); return }
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
      setNotice(t('Added {code} – {name} (pending approval).', { code: created.code, name: n }))
      setName(''); setCode(''); setAddress(''); setTin(''); setDoc(null)
      if (docRef.current) docRef.current.value = ''
      await load()
    } catch (err) { setError(friendly(err, t)) }
    finally { setBusy(false) }
  }

  // Bulk approve every pending consignee in one update (across all pages). Used
  // for the seeded master list, which is name + code only — completeness is
  // filled in later (0120 dropped the address/TIN/2303 pre-approval requirement).
  async function approveAllPending() {
    if (pendingCount === 0) return
    if (!window.confirm(t('Approve all {n} pending consignees? They become visible to customers in job orders. You can still edit details afterwards.', { n: pendingCount }))) return
    setBusy(true); setError(null); setNotice(null)
    const { error } = await supabase.from('consignees')
      .update({ status: 'approved', decided_at: new Date().toISOString() })
      .eq('status', 'pending')
    setBusy(false)
    if (error) return setError(friendly(error, t))
    setNotice(t('Approved {n} pending consignee(s).', { n: pendingCount }))
    setPendingCount(0)
    await load()
  }

  async function review(c: Consignee, action: 'approve' | 'reject' | 'needs_info', note?: string | null) {
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('review_consignee', { p_id: c.id, p_action: action, p_note: note ?? null })
    setBusy(false)
    if (error) return setError(friendly(error, t))
    const status: AccreditationStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'needs_info'
    if (filter === 'all') setList((l) => l.map((x) => (x.id === c.id ? { ...x, status, note: note ?? x.note } : x)))
    else setList((l) => l.filter((x) => x.id !== c.id))
    setSelected((s) => (s && s.id === c.id ? { ...s, status, note: note ?? s.note } : s))
  }

  async function saveEdit() {
    if (!editing) return
    const n = editing.name.trim(), cc = editing.code.trim()
    if (n.length < MIN_NAME) { setError(t('Name must be at least {n} characters.', { n: MIN_NAME })); return }
    if (!cc) { setError(t('Code cannot be empty.')); return }
    setBusy(true); setError(null)
    try {
      let docPath = editing.doc_2303_path
      if (editDoc) docPath = await upload2303(editing.id, editDoc)
      const { error } = await supabase.from('consignees')
        .update({ code: cc, name: n, address: editing.address.trim() || null, tin: editing.tin.trim() || null, doc_2303_path: docPath })
        .eq('id', editing.id)
      if (error) throw error
      await load()
      setSelected((s) => (s && s.id === editing.id ? { ...s, code: cc, name: n, address: editing.address.trim() || null, tin: editing.tin.trim() || null, doc_2303_path: docPath } : s))
      setEditing(null); setEditDoc(null); setNotice(t('Saved.'))
    } catch (err) { setError(friendly(err, t)) }
    finally { setBusy(false) }
  }

  async function remove(c: Consignee) {
    if (!window.confirm(t('Delete {code} – {name}?', { code: c.code, name: c.name }))) return
    setBusy(true); setError(null)
    const { error } = await supabase.from('consignees').delete().eq('id', c.id)
    setBusy(false)
    if (error) return setError(friendly(error, t))
    setList((l) => l.filter((x) => x.id !== c.id)); setTotal((n) => Math.max(0, n - 1)); setNotice(t('Deleted {code}.', { code: c.code }))
    setSelected((s) => (s && s.id === c.id ? null : s))
  }

  const from = total === 0 ? 0 : page * PAGE + 1
  const to = Math.min(total, (page + 1) * PAGE)
  const hasPrev = page > 0
  const hasNext = (page + 1) * PAGE < total

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 18, marginBottom: 16 }}>
        <h1 className="ktc-title" style={{ fontSize: 18 }}>{t('Consignees')}</h1>
        <p className="ktc-sub" style={{ marginBottom: 14, fontSize: 12 }}>
          {t('Added consignees are')} <b>{t('pending')}</b> {t('and become visible to customers once approved. Address, TIN, and the 2303 can be filled in later — they’re no longer required to approve.')}
        </p>

        {canManage && (
          <>
            <div style={{ display: 'grid', gap: 5, marginBottom: 14, maxWidth: 340 }}>
              <label className="ktc-label" htmlFor="csv" style={{ fontSize: 12 }}>{t('Bulk import CSV (name, optional code)')}</label>
              <input id="csv" ref={csvRef} type="file" accept=".csv,text/csv" className="ktc-input ktc-input--compact" onChange={onCsv} disabled={busy} style={{ padding: '6px 10px' }} />
            </div>

            <form onSubmit={addOne} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label={t('Consignee name *')} w={200}><input className="ktc-input ktc-input--compact" value={name} onChange={(e) => setName(e.target.value)} required minLength={MIN_NAME} /></Field>
              <Field label={t('Code (optional)')} w={110}><input className="ktc-input ktc-input--compact" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('auto')} /></Field>
              <Field label={t('Address')} w={230}><input className="ktc-input ktc-input--compact" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
              <Field label={t('TIN')} w={140}><input className="ktc-input ktc-input--compact" value={tin} onChange={(e) => setTin(e.target.value)} /></Field>
              <Field label={t('2303 document')} w={190}><input ref={docRef} className="ktc-input ktc-input--compact" type="file" accept="image/*,application/pdf" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} style={{ padding: '6px 10px' }} /></Field>
              <button className="ktc-btn ktc-btn--sm" type="submit" disabled={busy} style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}>{t('Add consignee')}</button>
            </form>
          </>
        )}

        {busy && <div className="ktc-label" style={{ marginTop: 10, fontSize: 12.5 }}>{t('Working…')}</div>}
        {notice && <div className="ktc-label" style={{ marginTop: 10, fontSize: 12.5 }}>{notice}</div>}
        {error && <div style={{ marginTop: 10, color: 'var(--acc-2)', fontSize: 12.5 }}>{error}</div>}
      </div>

      <div className="ktc-glass" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <select className="ktc-input ktc-input--compact" value={filter} onChange={(e) => changeFilter(e.target.value as Filter)}>
            <option value="all">{t('All')}</option>
            <option value="needs_docs">{t('Needs documents')}</option>
            <option value="pending">{t('Pending')}</option>
            <option value="needs_info">{t('Needs info')}</option>
            <option value="approved">{t('Approved')}</option>
            <option value="rejected">{t('Rejected')}</option>
          </select>
          <input className="ktc-input ktc-input--compact" placeholder={t('Search code, name, or address…')} value={query} onChange={(e) => changeQuery(e.target.value)} style={{ maxWidth: 260, width: '100%' }} />
        </div>

        {canManage && pendingCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '9px 13px', borderRadius: 10, background: 'var(--c-h40-90-94)', border: '1px solid var(--glass-brd)', flexWrap: 'wrap' }}>
            <span className="ktc-label" style={{ fontSize: 12.5, flex: 1, minWidth: 160 }}>
              {t('{n} consignee(s) pending approval.', { n: pendingCount })}
            </span>
            <button className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void approveAllPending()} style={{ width: 'auto', padding: '6px 14px', fontSize: 12.5 }}>
              {t('Approve all pending')}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="ktc-label" style={{ fontSize: 13 }}>{total === 0 ? t('No results') : t('Showing {from}–{to} of {total}', { from, to, total })}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="ktc-link" onClick={() => setPage((p) => p - 1)} disabled={!hasPrev || busy} style={{ fontSize: 13, opacity: hasPrev ? 1 : 0.4 }}>{t('‹ Prev')}</button>
            <button className="ktc-link" onClick={() => setPage((p) => p + 1)} disabled={!hasNext || busy} style={{ fontSize: 13, opacity: hasNext ? 1 : 0.4 }}>{t('Next ›')}</button>
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gap: 6 }}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="ktc-skeleton" style={{ height: 48, borderRadius: 11 }} />)}</div>
        ) : list.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>{query || filter !== 'all' ? t('No matches.') : t('No consignees yet.')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {list.map((c) => {
              const ss = STATUS_STYLE[c.status] ?? STATUS_STYLE.pending
              const complete = !!(c.address && c.tin && c.doc_2303_path)
              return (
                <button key={c.id} type="button" className="ktc-cn-row" onClick={() => { setSelected(c); setEditing(null); setError(null) }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <b className="ktc-mono" style={{ fontSize: 12.5 }}>{c.code}</b>
                      <span style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                      <span className="ktc-label" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, color: c.doc_2303_path ? 'var(--c-h150-60-30)' : 'var(--c-h30-70-38)' }}>
                        {c.doc_2303_path ? <><CheckCircleIcon size={11} /> {t('2303 on file')}</> : <><AlertTriangleIcon size={11} /> {t('needs documents')}</>}
                      </span>
                      {c.requested_by && <span className="ktc-chip ktc-chip--accent" style={{ fontSize: 10 }}>{t('customer-requested')}</span>}
                      {!complete && c.status !== 'approved' && <span className="ktc-label" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--c-h30-70-38)' }}><AlertTriangleIcon size={11} /> {t('needs address/TIN/2303')}</span>}
                      {c.tin && <span className="ktc-label" style={{ fontSize: 11 }}>{t('TIN')} {c.tin}</span>}
                    </span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: ss.bg, color: ss.fg, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{t(c.status)}</span>
                  <span aria-hidden style={{ color: 'hsl(var(--ink-2))', fontSize: 17, flex: '0 0 auto', lineHeight: 1 }}>›</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {selected && (() => {
        const c = selected
        const ss = STATUS_STYLE[c.status] ?? STATUS_STYLE.pending
        const close = () => { setSelected(null); setEditing(null); setEditDoc(null) }
        return (
          <div className="ktc-modal-backdrop" onClick={close}>
            <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 520, maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                  <b className="ktc-mono" style={{ fontSize: 15 }}>{c.code}</b>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: ss.bg, color: ss.fg }}>{t(c.status)}</span>
                  {c.requested_by && <span className="ktc-chip ktc-chip--accent" style={{ fontSize: 10.5 }}>{t('customer-requested')}</span>}
                </div>
                <button type="button" aria-label={t('Close')} onClick={close} style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))', flex: '0 0 auto' }}>✕</button>
              </div>

              <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
                {error && <div style={{ marginBottom: 12, color: 'var(--acc-2)', fontSize: 12.5 }} role="alert">{error}</div>}

                {editing && editing.id === c.id ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <ModalField label={t('Code')}><input className="ktc-input" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></ModalField>
                    <ModalField label={t('Consignee name')}><input className="ktc-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></ModalField>
                    <ModalField label={t('Business address')}><input className="ktc-input" value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></ModalField>
                    <ModalField label={t('TIN / VAT Reg #')}><input className="ktc-input" value={editing.tin} onChange={(e) => setEditing({ ...editing, tin: e.target.value })} /></ModalField>
                    <ModalField label={editing.doc_2303_path ? t('Replace BIR 2303') : t('BIR 2303')}><input className="ktc-input" type="file" accept="image/*,application/pdf" onChange={(e) => setEditDoc(e.target.files?.[0] ?? null)} style={{ padding: '8px 11px' }} /></ModalField>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 2 }}>
                      <button className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void saveEdit()} style={{ width: 'auto', padding: '8px 18px' }}>{busy ? t('Saving…') : t('Save changes')}</button>
                      <button className="ktc-link" onClick={() => { setEditing(null); setEditDoc(null) }}>{t('Cancel')}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.35 }}>{c.name}</div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '12px 16px', fontSize: 13, marginTop: 14 }}>
                      <Meta label={t('Business address')} value={c.address || '—'} span2 />
                      {c.requested_by && <Meta label={t('Requested by')} value={requester ? [requester.full_name, requester.email].filter(Boolean).join(' · ') || '—' : t('Loading…')} span2 />}
                      <Meta label={t('TIN / VAT Reg #')} value={c.tin || '—'} />
                      <Meta label={t('Date added')} value={c.created_at ? fmtDate(c.created_at) : '—'} />
                      {c.requested_at && <Meta label={t('Requested')} value={fmtDate(c.requested_at)} />}
                      {c.decided_at && <Meta label={t('Reviewed')} value={fmtDate(c.decided_at)} />}
                    </div>

                    {c.note && (
                      <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5, padding: '9px 12px', borderRadius: 9, background: ss.bg, color: ss.fg }}>
                        <b>{t('Note:')}</b> {c.note}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                      {c.doc_2303_path
                        ? <button className="ktc-btn-secondary ktc-btn--sm" onClick={() => void openFromStorage('consignee-docs', c.doc_2303_path, t('2303 — {name}', { name: c.name }))} style={{ width: 'auto', padding: '7px 13px' }}>{t('View BIR 2303')}</button>
                        : <span className="ktc-label" style={{ fontSize: 12, alignSelf: 'center' }}>{t('No BIR 2303 on file')}</span>}
                      {c.doc_2307_path && <button className="ktc-btn-secondary ktc-btn--sm" onClick={() => void openFromStorage('consignee-docs', c.doc_2307_path, t('2307 — {name}', { name: c.name }))} style={{ width: 'auto', padding: '7px 13px' }}>{t('View BIR 2307')}</button>}
                      <a className="ktc-btn-secondary ktc-btn--sm" href={cisPrintUrl({ mode: 'update', trade_name: c.name, address1: c.address ?? '', tin: c.tin ?? '' })} target="_blank" rel="noopener" style={{ width: 'auto', padding: '7px 13px', textDecoration: 'none' }}>{t('Print CIS')}</a>
                    </div>

                    {(canReview || canManage) && (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--glass-brd)' }}>
                        {canReview && c.status !== 'approved' && <button className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void review(c, 'approve')} style={{ width: 'auto', padding: '8px 16px' }}>{t('Approve')}</button>}
                        {canReview && c.status !== 'needs_info' && <button className="ktc-link" disabled={busy} onClick={() => { const r = window.prompt(t('Ask the customer for more info — what’s needed:'), ''); if (r === null) return; if (!r.trim()) { setError(t('Add a note for the customer.')); return } void review(c, 'needs_info', r.trim()) }}>{t('Needs info')}</button>}
                        {canReview && c.status !== 'rejected' && <button className="ktc-link" disabled={busy} onClick={() => { const r = window.prompt(t('Reason for rejecting (shown to the customer):'), ''); if (r === null) return; if (!r.trim()) { setError(t('Add a reason.')); return } void review(c, 'reject', r.trim()) }} style={{ color: 'var(--acc-2)' }}>{t('Reject')}</button>}
                        {canManage && <button className="ktc-link" onClick={() => setEditing({ id: c.id, code: c.code, name: c.name, address: c.address ?? '', tin: c.tin ?? '', doc_2303_path: c.doc_2303_path })} style={{ marginLeft: 'auto' }}>{t('Edit')}</button>}
                        {canManage && <button className="ktc-link" disabled={busy} onClick={() => void remove(c)} style={{ color: 'var(--acc-2)' }}>{t('Delete')}</button>}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {viewerModal}
    </AdminShell>
  )
}

// mm/dd/yyyy
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

function Meta({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div style={{ gridColumn: span2 ? '1 / -1' : undefined }}>
      <div className="ktc-label" style={{ fontSize: 11, opacity: 0.7 }}>{label}</div>
      <div style={{ fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <label className="ktc-label" style={{ fontSize: 12 }}>{label}</label>
      {children}
    </div>
  )
}

function Field({ label, w, children }: { label: string; w: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 6, maxWidth: w, width: '100%', flexBasis: w, flexGrow: 1 }}>
      <label className="ktc-label">{label}</label>
      {children}
    </div>
  )
}
