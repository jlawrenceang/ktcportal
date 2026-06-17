import { useCallback, useEffect, useRef, useState } from 'react'
import AppLayout from './AppLayout'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import type { ServingNumber } from '../lib/types'
import { useT } from '../lib/i18n'

// Checker app screen: scan the slip QR (encodes /verify/<jo-id>) with the
// camera, or type the JO number, then confirm X-ray per van. Reuses the same
// record_van_xray RPC (idempotent + permission-gated) as the desktop Checker.
interface Line { id: string; container_number: string; service_request: string; xray_done_at: string | null }
interface Order {
  id: string; jo_number: string | null; status: string
  broker?: { full_name: string | null } | null
  consignee?: { code: string; name: string } | null
  lines?: Line[]
  serving?: ServingNumber[]
}
const SELECT =
  'id, jo_number, status, broker:customers(full_name), consignee:consignees(code, name), lines:job_order_lines(id, container_number, service_request, xray_done_at), serving:serving_numbers(service_line, serving_no, week_start, vacated_at)'
const isXray = (s: string) => s.toLowerCase().includes('x-ray')
function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }
function shape(o: Order): Order { return { ...o, broker: one(o.broker), consignee: one(o.consignee) } }
const servingNo = (o: Order) => o.serving?.find((s) => !s.vacated_at)?.serving_no ?? null

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
const hasBarcode = typeof window !== 'undefined' && 'BarcodeDetector' in window

export default function AppChecker() {
  const { t } = useT()
  const { can } = usePermissions()
  const allowed = can('confirm_xray')

  const [queue, setQueue] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<Order | null>(null)
  const [scanning, setScanning] = useState(false)
  const [manual, setManual] = useState('')
  const [busyLine, setBusyLine] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('job_orders').select(SELECT)
      .in('status', ['submitted', 'processing', 'on_hold']).order('created_at', { ascending: true })
    const rows = ((data ?? []) as unknown as Order[]).map(shape)
      .filter((o) => (o.lines ?? []).some((l) => isXray(l.service_request) && !l.xray_done_at))
      .sort((a, b) => (servingNo(a) ?? Infinity) - (servingNo(b) ?? Infinity))
    setQueue(rows)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  useAutoRefresh(load)

  const openOrder = useCallback(async (id: string) => {
    setError(null)
    const { data } = await supabase.from('job_orders').select(SELECT).eq('id', id).maybeSingle()
    if (!data) { setError(t('No job order found for that code.')); return }
    setActive(shape(data as unknown as Order))
  }, [t])

  async function openByJo(jo: string) {
    setError(null)
    const q = jo.trim()
    if (!q) return
    const { data } = await supabase.from('job_orders').select(SELECT).ilike('jo_number', `%${q}%`).limit(1)
    const row = (data ?? [])[0] as unknown as Order | undefined
    if (!row) { setError(t('No job order found for “{q}”.', { q })); return }
    setActive(shape(row))
    setManual('')
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
      streamRef.current = stream
      setScanning(true)
    } catch {
      setError(t('Could not open the camera. Allow camera access, or type the JO number.'))
    }
  }

  // Drive the camera + QR detection loop while scanning.
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
          if (m) { stopScan(); void openOrder(m[1]) }
        }
      } catch { /* transient detect errors are fine */ }
    }, 500)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [scanning, openOrder])

  // Stop the camera if the component unmounts.
  useEffect(() => () => stopScan(), [])

  async function confirmVan(lineId: string) {
    setBusyLine(lineId); setError(null)
    const { error: rpcErr } = await supabase.rpc('record_van_xray', { p_line_id: lineId })
    setBusyLine(null)
    if (rpcErr) { setError(rpcErr.message); return }
    if (active) await openOrder(active.id)
    void load()
  }

  const xrayLines = (active?.lines ?? []).filter((l) => isXray(l.service_request))

  return (
    <AppLayout title="X-ray Checker">
      {!allowed ? (
        <div className="ktc-glass" style={{ padding: 18, marginTop: 14 }}>
          <p className="ktc-label" style={{ fontSize: 14 }}>{t('You don’t have permission to confirm X-ray.')}</p>
        </div>
      ) : (
        <>
          {error && (
            <div role="alert" style={{ margin: '12px 0', fontSize: 13.5, fontWeight: 500, color: 'var(--acc-2)', padding: '11px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }}>{error}</div>
          )}

          {/* Scan / lookup */}
          <div className="ktc-glass" style={{ padding: 18, marginTop: 14 }}>
            {scanning ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <video ref={videoRef} playsInline muted style={{ width: '100%', maxHeight: '50vh', borderRadius: 12, background: '#000', objectFit: 'cover' }} />
                <button type="button" className="ktc-btn-secondary" onClick={stopScan}>{t('Cancel scan')}</button>
                <p className="ktc-label" style={{ fontSize: 12.5, textAlign: 'center' }}>{t('Point the camera at the QR on the Job Order slip.')}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                <button type="button" className="ktc-btn" style={{ fontSize: 17, padding: '16px' }} onClick={() => void startScan()}>
                  📷 {t('Scan slip QR')}
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="ktc-input ktc-mono" value={manual} onChange={(e) => setManual(e.target.value)}
                    placeholder={t('or type JO number')} style={{ flex: 1, fontSize: 16, padding: '12px 14px' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void openByJo(manual) }} />
                  <button type="button" className="ktc-btn-secondary" onClick={() => void openByJo(manual)}>{t('Find')}</button>
                </div>
              </div>
            )}
          </div>

          {/* Scanned/opened order */}
          {active && (
            <div className="ktc-glass" style={{ padding: 18, marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {servingNo(active) != null && <span className="ktc-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--acc-2)' }}>#{servingNo(active)}</span>}
                <b className="ktc-mono" style={{ fontSize: 18 }}>{active.jo_number ?? '—'}</b>
                <button type="button" className="ktc-link" style={{ marginLeft: 'auto', fontSize: 13 }} onClick={() => setActive(null)}>{t('Close')}</button>
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
                      ) : ['submitted', 'processing', 'on_hold'].includes(active.status) ? (
                        <button className="ktc-btn ktc-btn--sm" style={{ marginLeft: 'auto', fontSize: 15, padding: '10px 18px' }}
                          disabled={busyLine === l.id} onClick={() => void confirmVan(l.id)}>
                          {busyLine === l.id ? t('Saving…') : `✓ ${t('Confirm X-ray')}`}
                        </button>
                      ) : (
                        <span className="ktc-chip" style={{ marginLeft: 'auto' }}>{t(active.status)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Queue */}
          <div className="ktc-glass" style={{ padding: 18, marginTop: 14 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>{t('X-ray line — {count} waiting', { count: loading ? '…' : queue.length })}</h2>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {loading ? [60, 60].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 12 }} />)
                : queue.length === 0 ? <span className="ktc-label" style={{ fontSize: 14 }}>{t('Queue is clear. 🎉')}</span>
                : queue.map((o) => (
                  <button key={o.id} type="button" onClick={() => setActive(o)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '12px 14px', borderRadius: 12, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)', cursor: 'pointer', font: 'inherit', color: 'hsl(var(--ink))' }}>
                    {servingNo(o) != null && <span className="ktc-mono" style={{ fontSize: 17, fontWeight: 700, color: 'var(--acc-2)' }}>#{servingNo(o)}</span>}
                    <b className="ktc-mono" style={{ fontSize: 14.5 }}>{o.jo_number ?? '—'}</b>
                    <span className="ktc-label" style={{ fontSize: 12, marginLeft: 'auto' }}>
                      {(o.lines ?? []).filter((l) => isXray(l.service_request) && !l.xray_done_at).length} {t('van(s)')}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </>
      )}
    </AppLayout>
  )
}
