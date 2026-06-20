import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { prepareUpload } from '../lib/validation'
import { useFileViewer } from './FileViewerModal'
import { joEventLabel } from '../lib/eventLabels'
import type { JobOrderEvent } from '../lib/types'
import { useT } from '../lib/i18n'
import { PaperclipIcon } from './icons'

// Unified Job Order timeline: lifecycle events + supporting documents + two-way
// comments (customer ↔ KTC), from the jo_timeline RPC (migration 0070). The
// input adds a comment (text only) or a supporting document (text becomes the
// note) via add_jo_comment / add_jo_support. Used in the customer modal and the
// admin queue.
type Row = {
  row_id: string
  source: string
  kind: 'event' | 'comment' | 'document'
  event_name: string | null
  detail: Record<string, unknown> | null
  who: string
  body: string | null
  doc_path: string | null
  doc_filename: string | null
  deletable: boolean
  visibility: 'public' | 'staff_only'
  flagged: boolean
  at: string
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function JoTimeline({ orderId, userId, canComment, canAttach, staff = false }: {
  orderId: string; userId: string; canComment: boolean; canAttach: boolean; staff?: boolean
}) {
  const { t } = useT()
  const [rows, setRows] = useState<Row[]>([])
  const [text, setText] = useState('')
  const [internal, setInternal] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { openFromStorage, viewerModal } = useFileViewer(setErr)

  async function load() {
    const { data } = await supabase.rpc('jo_timeline', { p_jo: orderId })
    setRows((data ?? []) as Row[])
  }
  useEffect(() => { void load() }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    if (!text.trim() && !file) { setErr(t('Write a comment or attach a document.')); return }
    setBusy(true); setErr(null)
    if (staff && internal && !file) {
      const { error: rErr } = await supabase.rpc('add_jo_staff_note', { p_jo: orderId, p_text: text.trim() })
      if (rErr) { setBusy(false); setErr(rErr.message); return }
      setBusy(false); setText(''); void load(); return
    }
    if (file) {
      const prepared = await prepareUpload(file)
      if ('error' in prepared) { setBusy(false); setErr(prepared.error); return }
      const safe = prepared.file.name.replace(/[^A-Za-z0-9._-]/g, '_')
      const path = `${userId}/${orderId}/${Date.now()}_${safe}`
      const { error: upErr } = await supabase.storage.from('jo-documents').upload(path, prepared.file, { upsert: false })
      if (upErr) { setBusy(false); setErr(upErr.message); return }
      const { error: rErr } = await supabase.rpc('add_jo_support', { p_jo: orderId, p_path: path, p_filename: file.name, p_note: text.trim() || null })
      if (rErr) { setBusy(false); setErr(rErr.message); return }
    } else {
      const { error: rErr } = await supabase.rpc('add_jo_comment', { p_jo: orderId, p_text: text.trim() })
      if (rErr) { setBusy(false); setErr(rErr.message); return }
    }
    setBusy(false); setText(''); setFile(null)
    void load()
  }

  async function remove(r: Row) {
    if (!window.confirm(t('Delete this entry? This can’t be undone.'))) return
    const { error } = await supabase.rpc('delete_jo_entry', { p_source: r.source, p_id: r.row_id })
    if (error) { setErr(error.message); return }
    void load()
  }

  async function flag(r: Row) {
    const { error } = await supabase.rpc('flag_jo_comment', { p_id: r.row_id, p_flagged: !r.flagged })
    if (error) { setErr(error.message); return }
    void load()
  }

  function lineFor(r: Row): { label: string; tone: string } {
    if (r.kind === 'event') {
      const label = joEventLabel({ event: r.event_name ?? '', detail: r.detail ?? {}, actor: null, created_at: r.at, id: '' } as JobOrderEvent)
      return { label, tone: 'event' }
    }
    if (r.kind === 'comment') return { label: r.body ?? '', tone: 'comment' }
    return { label: r.body || t('Attached a document'), tone: 'doc' }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--glass-brd)' }}>
      <span className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>{t('Timeline')}</span>

      {rows.length === 0 ? (
        <p className="ktc-label" style={{ fontSize: 12.5, marginTop: 8, opacity: 0.75 }}>{t('No activity yet.')}</p>
      ) : (
        <div style={{ display: 'grid', gap: 0, marginTop: 10 }}>
          {rows.map((r, i) => {
            const { label, tone } = lineFor(r)
            const dot = tone === 'comment' ? 'var(--acc)' : tone === 'doc' ? 'hsl(var(--ink-3))' : 'hsl(var(--ink-3))'
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 10, position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: dot, marginTop: 5, flex: '0 0 auto' }} />
                  {i < rows.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--glass-brd)', margin: '2px 0' }} />}
                </div>
                <div style={{ paddingBottom: 12, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{r.who}</span>
                    <span className="ktc-label" style={{ fontSize: 11, opacity: 0.7 }}>{fmtWhen(r.at)}</span>
                    {/* staff-only signals; customers never receive these rows */}
                    {r.visibility === 'staff_only' && (
                      <span className="ktc-chip" style={{ fontSize: 10.5 }}>{t('internal')}</span>
                    )}
                    {r.flagged && (
                      <span className="ktc-chip" style={{ fontSize: 10.5, color: 'var(--acc-2)' }}>🚩 {t('complaint')}</span>
                    )}
                    {staff && r.kind === 'comment' && (
                      <button type="button" className="ktc-link" title={r.flagged ? t('Remove flag') : t('Flag as complaint')}
                        onClick={() => void flag(r)}
                        style={{ fontSize: 11.5, marginLeft: r.deletable ? 0 : 'auto', opacity: 0.8 }}>
                        {r.flagged ? t('Unflag') : t('🚩 Flag')}
                      </button>
                    )}
                    {r.deletable && (
                      <button type="button" className="ktc-link" title={t('Delete')} aria-label={t('Delete')}
                        onClick={() => void remove(r)}
                        style={{ fontSize: 11.5, marginLeft: staff && r.kind === 'comment' ? 0 : 'auto', color: 'var(--acc-2)', opacity: 0.8 }}>
                        {t('Delete')}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.45, marginTop: 2, color: tone === 'event' ? 'hsl(var(--ink-2))' : 'hsl(var(--ink))', fontStyle: tone === 'event' ? 'italic' : 'normal', wordBreak: 'break-word' }}>
                    {label}
                  </div>
                  {r.doc_path && (
                    <button type="button" className="ktc-link" style={{ fontSize: 12.5, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      onClick={() => void openFromStorage('jo-documents', r.doc_path!, r.doc_filename ?? t('Document'))}>
                      <PaperclipIcon size={13} /> {r.doc_filename ?? t('View document')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {canComment && (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {err && <div style={{ fontSize: 12.5, color: 'var(--acc-2)' }} role="alert">{err}</div>}
          {staff && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              <span>{t('Internal note (staff only — not shown to the customer)')}</span>
            </label>
          )}
          <textarea className="ktc-input" rows={2}
            placeholder={staff && internal ? t('Add an internal note…') : canAttach ? t('Add a comment, or attach a document (note optional)…') : t('Add a comment…')}
            value={text} onChange={(e) => setText(e.target.value)} />
          {canAttach && !(staff && internal) && (file ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '8px 12px', borderRadius: 9, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
              <span style={{ flex: '1 1 auto', wordBreak: 'break-all', display: 'inline-flex', alignItems: 'center', gap: 6 }}><PaperclipIcon size={14} /> {file.name}</span>
              <button type="button" className="ktc-link" style={{ fontSize: 12.5, color: 'var(--acc-2)' }} onClick={() => setFile(null)}>{t('Remove')}</button>
            </div>
          ) : (
            <input className="ktc-input" type="file" accept="image/*,application/pdf" style={{ padding: '9px 12px', fontSize: 13 }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
          ))}
          <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void send()} style={{ justifySelf: 'start' }}>
            {busy ? t('Sending…') : staff && internal ? t('Add internal note') : file ? t('Attach & send') : t('Add comment')}
          </button>
        </div>
      )}
      {viewerModal}
    </div>
  )
}
