import { useCallback, useEffect, useRef, useState } from 'react'
import AppLayout from './AppLayout'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import type { ServingNumber } from '../lib/types'
import { servingKey, servingTag } from '../lib/serving'
import { useT } from '../lib/i18n'
import { CameraIcon } from '../components/icons'
import NowServing from '../components/NowServing'
import { usePageTour } from '../components/TourProvider'
import { checkerSteps } from '../admin/AdminTour'

// Checker app screen: scan the slip QR (encodes /verify/<jo-id>) with the
// camera, or type the JO number, then confirm X-ray per van. Reuses the same
// record_van_xray RPC (idempotent + permission-gated) as the desktop Checker,
// including the confirm-before-e-signature modal.
interface Line { id: string; container_number: string; service_request: string; xray_done_at: string | null }
interface Order {
  id: string; jo_number: string | null; status: string
  is_rexray?: boolean | null; rexray_status?: string | null
  broker?: { full_name: string | null } | null
  consignee?: { code: string; name: string } | null
  lines?: Line[]
  serving?: ServingNumber[]
}
const SELECT =
  'id, jo_number, status, is_rexray, rexray_status, broker:customers(full_name), consignee:consignees(code, name), lines:job_order_lines(id, container_number, service_request, xray_done_at), serving:serving_numbers(service_line, serving_no, week_start, vacated_at)'
const isXray = (s: string) => s.toLowerCase().includes('x-ray')
function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }
function shape(o: Order): Order { return { ...o, broker: one(o.broker), consignee: one(o.consignee) } }
// Lane order + lane-tagged display (P-1 priority / R-1 re-X-ray / #1 regular) come from
// lib/serving so the desktop Checker + queue table show the exact same thing.

// Map the raw DB status token to a friendly, translatable label (mirrors the
// other pages so the chip never shows a bare lowercase token).
const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted', processing: 'Processing', on_hold: 'On hold',
  completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled', held: 'Held',
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
const hasBarcode = typeof window !== 'undefined' && 'BarcodeDetector' in window

export default function AppChecker() {
  const { t } = useT()
  const { can } = usePermissions()
  const allowed = can('confirm_xray')
  const canRexray = can('request_rexray')
  // Same tour key as the desktop Checker so the once-per-role flag is shared.
  usePageTour('checker', checkerSteps)

  const [queue, setQueue] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<Order | null>(null)
  const [scanning, setScanning] = useState(false)
  const [manual, setManual] = useState('')
  const [busyLine, setBusyLine] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; container: string; jo: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('job_orders').select(SELECT)
      .in('status', ['processing', 'on_hold']).order('created_at', { ascending: true })
    if (e) { setError(e.message); setLoading(false); return }
    const rows = ((data ?? []) as unknown as Order[]).map(shape)
      .filter((o) => (o.lines ?? []).some((l) => isXray(l.service_request) && !l.xray_done_at))
      // KTC-26: an unapproved re-X-ray child can't be acted on — keep it out of the queue.
      .filter((o) => !(o.is_rexray && o.rexray_status !== 'approved'))
      .sort((a, b) => servingKey(a.serving) - servingKey(b.serving))
    setQueue(rows)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  useAutoRefresh(load)

  const openOrder = useCallback(async (id: string) => {
    setError(null)
    const { data, error: e } = await supabase.from('job_orders').select(SELECT).eq('id', id).maybeSingle()
    if (e) { setError(e.message); return }
    if (!data) { setError(t('No job order found for that code.')); return }
    setActive(shape(data as unknown as Order))
  }, [t])
  // Keep the latest openOrder in a ref so the scan loop doesn't tear down when
  // the i18n `t` identity changes (e.g. a language switch mid-scan).
  const openOrderRef = useRef(openOrder)
  useEffect(() => { openOrderRef.current = openOrder }, [openOrder])

  async function openByJo(jo: string) {
    setError(null)
    const raw = jo.trim().toUpperCase()
    if (!raw) return
    // Exact match only (no substring/wildcard) so a short entry can't open the
    // wrong van. Accept a bare number too → canonical JO-######.
    const candidates = [raw]
    const digits = raw.replace(/\D/g, '')
    if (digits) candidates.push('JO-' + digits.padStart(6, '0'))
    const { data, error: e } = await supabase.from('job_orders').select(SELECT).in('jo_number', candidates).limit(2)
    if (e) { setError(e.message); return }
    const rows = (data ?? []) as unknown as Order[]
    if (rows.length === 0) { setError(t('No job order found for “{q}”.', { q: jo.trim() })); return }
    if (rows.length > 1) { setError(t('More than one order matches — type the full JO number.')); return }
    setActive(shape(rows[0])); setManual('')
  }

  function stopScan() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    setScanning(false)
  }
  async function startScan() {
    setError(null)
    if (!hasBarcode) { setError(t('Scanning isn’t supported on this browser — type the JO number instead.')); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      // The user may have navigated away while the permission prompt was open.
      if (!mountedRef.current) { stream.getTracks().forEach((tr) => tr.stop()); return }
      streamRef.current = stream
      setScanning(true)
    } catch {
      setError(t('Could not open the camera. Allow camera access, or type the JO number.'))
    }
  }

  // Drive the camera + QR detection loop while scanning (deps: scanning only).
  useEffect(() => {
    if (!scanning) return
    const video = videoRef.current
    if (!video || !streamRef.current) return
    video.srcObject = streamRef.current
    void video.play().catch(() => {})
    const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector
    const detector = new Ctor({ formats: ['qr_code'] })
    timerRef.current = window.setInterval(async () => {
      try {
        const codes = await detector.detect(video)
        if (codes.length) {
          const m = codes[0].rawValue.match(/verify\/([0-9a-fA-F-]{36})/)
          if (m) { stopScan(); void openOrderRef.current(m[1]) }
        }
      } catch { /* transient detect errors are fine */ }
    }, 500)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [scanning])

  // Stop the camera if the component unmounts.
  useEffect(() => () => stopScan(), [])

  async function confirmVan(lineId: string) {
    setBusyLine(lineId); setError(null)
    const { error: rpcErr } = await supabase.rpc('record_van_xray', { p_line_id: lineId })
    setBusyLine(null); setConfirmTarget(null)
    if (rpcErr) { setError(rpcErr.message); return }
    if (active) await openOrder(active.id)
    void load()
  }

  // Re-X-ray: request on a COMPLETED order (opened via scan/lookup) → admin approves → child JO.
  // Mirrors the desktop Checker + AllJobOrders; the checker holds request_rexray.
  const [rexrayBusy, setRexrayBusy] = useState(false)
  async function requestRexray(id: string) {
    if (!window.confirm(t('Request a re-X-ray for this completed order? It creates a suffixed child order (e.g. JO-000001A) for admin approval.'))) return
    setRexrayBusy(true); setError(null)
    const { error: rpcErr } = await supabase.rpc('request_rexray', { p_parent: id })
    setRexrayBusy(false)
    if (rpcErr) { setError(rpcErr.message); return }
    if (active) await openOrder(active.id)
    void load()
  }

  const xrayLines = (active?.lines ?? []).filter((l) => isXray(l.service_request))
  const statusChip = (s: string) => t(STATUS_LABEL[s] ?? s)
  // An unapproved re-X-ray child can't be confirmed (record_van_xray rejects it) — guard the
  // opened-order detail (the queue already excludes them). T2-20.
  const activeRexrayPending = !!active?.is_rexray && active?.rexray_status !== 'approved'

  return (
    <AppLayout title="X-ray Checker">
      {!allowed ? (
        <div className="ktc-glass" style={{ padding: 18, marginTop: 14 }}>
          <p className="ktc-label" style={{ fontSize: 14 }}>{t('You don’t have permission to confirm X-ray.')}</p>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 14 }}><NowServing /></div>
          {error && (
            <div role="alert" style={{ margin: '12px 0', fontSize: 14, fontWeight: 600, color: 'var(--c-h0-65-40)', padding: '11px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }}>{error}</div>
          )}

          {/* Scan / lookup */}
          <div className="ktc-glass" style={{ padding: 18, marginTop: 14 }}>
            {scanning ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <video ref={videoRef} playsInline muted aria-label={t('Camera — point at the slip QR')} style={{ width: '100%', maxHeight: '50vh', borderRadius: 12, background: '#000', objectFit: 'cover' }} />
                <button type="button" className="ktc-btn-secondary" style={{ padding: '14px' }} onClick={stopScan}>{t('Cancel scan')}</button>
                <p className="ktc-label" style={{ fontSize: 12.5, textAlign: 'center' }}>{t('Point the camera at the QR on the Job Order slip.')}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                <button type="button" className="ktc-btn" style={{ fontSize: 17, padding: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => void startScan()}>
                  <CameraIcon size={18} /> {t('Scan slip QR')}
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="ktc-input ktc-mono" value={manual} onChange={(e) => setManual(e.target.value)}
                    aria-label={t('JO number')} placeholder={t('or type JO number')} style={{ flex: 1, fontSize: 16, padding: '14px' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void openByJo(manual) }} />
                  <button type="button" className="ktc-btn-secondary" style={{ padding: '14px 18px' }} onClick={() => void openByJo(manual)}>{t('Find')}</button>
                </div>
              </div>
            )}
          </div>

          {/* Scanned/opened order */}
          {active && (
            <div className="ktc-glass" style={{ padding: 18, marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {servingTag(active.serving) != null && <span className="ktc-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--acc-2)' }}>{servingTag(active.serving)}</span>}
                <b className="ktc-mono" style={{ fontSize: 18 }}>{active.jo_number ?? '—'}</b>
                <span className="ktc-chip">{statusChip(active.status)}</span>
                <button type="button" className="ktc-btn-secondary ktc-btn--sm" style={{ marginLeft: 'auto', padding: '8px 14px' }} onClick={() => setActive(null)}>{t('Close')}</button>
              </div>
              <div className="ktc-label" style={{ fontSize: 13.5, marginTop: 4 }}>
                {active.broker?.full_name || t('Unknown customer')} · {active.consignee ? `${active.consignee.code} – ${active.consignee.name}` : t('no consignee')}
              </div>
              {xrayLines.length === 0 ? (
                <p className="ktc-label" style={{ fontSize: 13.5, marginTop: 12 }}>{t('This order has no X-ray containers.')}</p>
              ) : (
                <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                  {xrayLines.map((l) => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 12, background: 'var(--c-w70)', border: '1px solid var(--glass-brd)' }}>
                      <span className="ktc-mono" style={{ fontSize: 16, fontWeight: 600 }}>{l.container_number}</span>
                      {l.xray_done_at ? (
                        <span className="ktc-chip ktc-chip--success" style={{ marginLeft: 'auto' }}>✓ {t('X-ray confirmed')}</span>
                      ) : activeRexrayPending ? (
                        <span className="ktc-chip" style={{ marginLeft: 'auto' }}>{t('Re-X-ray — awaiting admin approval')}</span>
                      ) : active.status === 'submitted' ? (
                        <span className="ktc-chip" style={{ marginLeft: 'auto' }}>{t('Awaiting ops acceptance')}</span>
                      ) : ['processing', 'on_hold'].includes(active.status) ? (
                        <button className="ktc-btn ktc-btn--sm" style={{ marginLeft: 'auto', fontSize: 15, padding: '10px 18px' }}
                          onClick={() => setConfirmTarget({ id: l.id, container: l.container_number, jo: active.jo_number ?? '—' })}>
                          ✓ {t('Confirm X-ray')}
                        </button>
                      ) : (
                        <span className="ktc-chip" style={{ marginLeft: 'auto' }}>{statusChip(active.status)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {canRexray && active.status === 'completed' && !active.is_rexray && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--glass-brd)' }}>
                  <button className="ktc-btn-secondary" style={{ width: '100%', padding: '12px' }} disabled={rexrayBusy} onClick={() => void requestRexray(active.id)}>
                    {rexrayBusy ? t('Requesting…') : t('Request re-X-ray')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Queue */}
          <div className="ktc-glass" style={{ padding: 18, marginTop: 14 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>{t('X-ray line — {count} waiting', { count: loading ? '…' : queue.length })}</h2>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {loading ? [60, 60].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 12 }} />)
                : queue.length === 0 ? <span className="ktc-label" style={{ fontSize: 14 }}>{t('Queue is clear.')}</span>
                : queue.map((o) => (
                  <button key={o.id} type="button" onClick={() => setActive(o)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '12px 14px', borderRadius: 12, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)', cursor: 'pointer', font: 'inherit', color: 'hsl(var(--ink))' }}>
                    {servingTag(o.serving) != null && <span className="ktc-mono" style={{ fontSize: 17, fontWeight: 700, color: 'var(--acc-2)' }}>{servingTag(o.serving)}</span>}
                    <b className="ktc-mono" style={{ fontSize: 14.5 }}>{o.jo_number ?? '—'}</b>
                    <span className="ktc-label" style={{ fontSize: 12, marginLeft: 'auto' }}>
                      {(o.lines ?? []).filter((l) => isXray(l.service_request) && !l.xray_done_at).length} {t('van(s)')}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          {/* Confirm-before-e-signature modal (mirrors the desktop Checker). */}
          {confirmTarget && (
            <div className="ktc-modal-backdrop" onClick={() => { if (!busyLine) setConfirmTarget(null) }}>
              <div className="ktc-glass ktc-modal-panel" role="dialog" aria-modal="true" aria-label={t('Confirm X-ray?')}
                onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, padding: 22 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>{t('Confirm X-ray?')}</h3>
                <p className="ktc-label" style={{ fontSize: 13.5, lineHeight: 1.55, margin: '0 0 16px' }}>
                  {t('Confirm that container {c} ({jo}) has entered the X-ray division for BOC X-ray. This records your e-signature with the date and time.', { c: confirmTarget.container, jo: confirmTarget.jo })}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="ktc-btn" style={{ width: 'auto', padding: '12px 22px' }} disabled={!!busyLine}
                    onClick={() => void confirmVan(confirmTarget.id)}>{busyLine ? t('Saving…') : t('✓ Yes, confirm')}</button>
                  <button className="ktc-btn-secondary" style={{ padding: '12px 18px' }} disabled={!!busyLine} onClick={() => setConfirmTarget(null)}>{t('Cancel')}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  )
}
