import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Shell from '../components/Shell'
import Notice from '../components/Notice'
import FileViewerModal from '../components/FileViewerModal'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { prepareUpload } from '../lib/validation'
import { loadPricingConfig, computeCharges, peso, type PricingConfig } from '../lib/pricing'
import { useT } from '../lib/i18n'
import { ClockIcon, PaperclipIcon } from '../components/icons'
import type { JobOrder } from '../lib/types'

// Per-JO payment page: fee computation + KTC bank/GCash details + QR +
// deposit-slip upload → admin review. NON-GATED: the order is processed
// regardless; the official Service Invoice still comes from the ERP cashier.

interface PayInfo { key: string; value: string; label: string | null }

export default function Payment() {
  const { t } = useT()
  const { id } = useParams()
  const { broker } = useBroker()
  const [order, setOrder] = useState<JobOrder | null>(null)
  const [cfg, setCfg] = useState<PricingConfig | null>(null)
  const [moves, setMoves] = useState<Map<string, number>>(new Map())
  const [info, setInfo] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [rpsFile, setRpsFile] = useState<File | null>(null)
  const [suppFiles, setSuppFiles] = useState<Record<string, File | null>>({})
  const [busy, setBusy] = useState(false)
  const [suppBusy, setSuppBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)

  async function load() {
    if (!id) return
    const [{ data: jo }, pricing, { data: pi }, { data: rm }] = await Promise.all([
      supabase.from('job_orders')
        .select('id, jo_number, status, payment_status, payment_note, payment_submitted_at, service_invoice_no, invoice_pad_no, xray_performed_at, rps_status, rps_payment_status, rps_payment_note, rps_payment_submitted_at, created_at, consignee:consignees(code, name), lines:job_order_lines(container_number, service_request), supplements:jo_supplements(id, suffix, label, amount, payment_status, payment_note, payment_submitted_at)')
        .eq('id', id).maybeSingle(),
      loadPricingConfig(),
      supabase.from('payment_info').select('key, value, label'),
      supabase.from('rps_moves').select('move_type, qty').eq('job_order_id', id),
    ])
    setOrder((jo as unknown as JobOrder) ?? null)
    setCfg(pricing)
    setMoves(new Map(((rm ?? []) as { move_type: string; qty: number }[]).map((x) => [x.move_type, x.qty])))
    setInfo(new Map(((pi ?? []) as PayInfo[]).map((r) => [r.key, r.value])))
    setLoading(false)
  }
  useEffect(() => { void load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const charges = useMemo(() => {
    if (!order || !cfg) return null
    const counts = new Map<string, number>()
    for (const l of order.lines ?? []) counts.set(l.service_request, (counts.get(l.service_request) ?? 0) + 1)
    return computeCharges(counts, cfg, moves)
  }, [order, cfg, moves])

  // Running balance: total = X-ray base + assessed RPS; paid = confirmed
  // components; balance = total − paid.
  const breakdown = useMemo(() => {
    if (!order || !cfg) return null
    const counts = new Map<string, number>()
    for (const l of order.lines ?? []) counts.set(l.service_request, (counts.get(l.service_request) ?? 0) + 1)
    const baseTotal = computeCharges(counts, cfg).total
    const total = computeCharges(counts, cfg, moves).total
    const rpsAmount = Math.max(0, total - baseTotal)
    const baseConfirmed = order.payment_status === 'confirmed' || !!order.service_invoice_no
    const rpsConfirmed = order.rps_payment_status === 'confirmed'
    const paid = (baseConfirmed ? baseTotal : 0) + (rpsConfirmed ? rpsAmount : 0)
    return { baseTotal, rpsAmount, total, paid, balance: total - paid }
  }, [order, cfg, moves])

  async function submitProof(kind: 'base' | 'rps', theFile: File | null) {
    if (!order || !theFile || !broker) return
    setBusy(true); setError(null)
    const prepared = await prepareUpload(theFile)
    if ('error' in prepared) { setBusy(false); setError(prepared.error); return }
    const ext = prepared.file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${broker.user_id}/jo-${order.id}${kind === 'rps' ? '-rps' : ''}.${ext}`
    const { error: upErr } = await supabase.storage.from('payment-slips').upload(path, prepared.file, { upsert: true })
    if (upErr) { setBusy(false); setError(upErr.message); return }
    const { error: rpcErr } = await supabase.rpc('submit_payment_proof', { p_id: order.id, p_path: path, p_kind: kind })
    setBusy(false)
    if (rpcErr) { setError(rpcErr.message); return }
    if (kind === 'rps') setRpsFile(null); else setFile(null)
    await load()
  }

  async function submitSuppProof(suppId: string) {
    const theFile = suppFiles[suppId]
    if (!order || !theFile || !broker) return
    setSuppBusy(suppId); setError(null)
    const prepared = await prepareUpload(theFile)
    if ('error' in prepared) { setSuppBusy(null); setError(prepared.error); return }
    const ext = prepared.file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${broker.user_id}/jo-${order.id}-supp-${suppId}.${ext}`
    const { error: upErr } = await supabase.storage.from('payment-slips').upload(path, prepared.file, { upsert: true })
    if (upErr) { setSuppBusy(null); setError(upErr.message); return }
    const { error: rpcErr } = await supabase.rpc('submit_supplement_proof', { p_supp: suppId, p_path: path })
    setSuppBusy(null)
    if (rpcErr) { setError(rpcErr.message); return }
    setSuppFiles((m) => ({ ...m, [suppId]: null }))
    await load()
  }

  if (loading) {
    return (
      <Shell>
        <div style={{ display: 'grid', gap: 14 }}>
          {[120, 220].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 20 }} />)}
        </div>
      </Shell>
    )
  }
  if (!order) {
    return (
      <Shell>
        <div className="ktc-glass" style={{ padding: 18 }}>
          <p className="ktc-label">{t('Job order not found.')} <Link to="/job-orders" className="ktc-link">{t('Back to My Job Orders')}</Link></p>
        </div>
      </Shell>
    )
  }

  const baseConfirmed = order.payment_status === 'confirmed' || !!order.service_invoice_no
  const rpsDue = order.rps_status === 'needed' && (breakdown?.rpsAmount ?? 0) > 0
  const rpsConfirmed = order.rps_payment_status === 'confirmed'
  const fullySettled = !!breakdown && breakdown.total > 0 && breakdown.balance <= 0.005
  const supplements = order.supplements ?? []
  const outstandingSupps = supplements.filter((s) => s.payment_status !== 'confirmed')
  const clearedForRelease = !!order.xray_performed_at && fullySettled && outstandingSupps.length === 0
  const anythingToPay = !fullySettled || outstandingSupps.length > 0
  const qrPath = info.get('qr_path')
  const qrUrl = qrPath ? supabase.storage.from('payment-qr').getPublicUrl(qrPath).data.publicUrl : null
  const qrFileName = (qrPath?.split('/').pop()) || 'ktc-payment-qr.png'

  return (
    <Shell>
      <div style={{ margin: '14px 4px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em' }}>
          {t('Payment')} · <span className="ktc-mono">{order.jo_number ?? t('Draft')}</span>
        </h1>
        <p className="ktc-sub">
          {order.consignee ? `${order.consignee.code} – ${order.consignee.name} · ` : ''}
          {t('Payment doesn’t block processing — the official Service Invoice is issued at the KTC office.')}
        </p>
      </div>

      {clearedForRelease && (
        <Notice tone="success" style={{ marginBottom: 16 }}>
          ✓ <b>{t('Cleared for release')}</b> — {t('X-ray done and balance fully paid. Collect your gate pass / official Service Invoice at the KTC office.')}
        </Notice>
      )}
      {outstandingSupps.length > 0 && (
        <Notice tone="warning" style={{ marginBottom: 16 }}>
          <span aria-hidden style={{ display: 'inline-flex', verticalAlign: '-3px' }}><ClockIcon size={15} /></span> <b>{t('Under review')}</b> — {t('KTC added an additional charge to this order. Please settle it below; the order can’t be completed until it’s paid.')}
        </Notice>
      )}
      {order.service_invoice_no && (
        <Notice tone="success" style={{ marginBottom: 16 }}>
          {order.service_invoice_no.toUpperCase().startsWith('BI')
            ? t('Billed on account — Billing Invoice No. {no}.', { no: order.invoice_pad_no ?? order.service_invoice_no })
            : t('Official Receipt No. {no} recorded at the KTC office.', { no: order.invoice_pad_no ?? order.service_invoice_no })}
        </Notice>
      )}

      {/* Charges */}
      <div className="ktc-glass" style={{ padding: 26, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 650 }}>{t('Charges')}</h2>
        {charges && (
          <>
            {(charges.hasMissingRates || charges.adminFee == null || charges.printFee == null) && (
              <p className="ktc-label" style={{ fontSize: 12.5, marginTop: 8, color: 'var(--c-h30-70-36)' }}>
                {t('Some rates aren’t set yet — please contact KTC. The total below may be incomplete; KTC will confirm the final amount.')}
              </p>
            )}
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 13.5 }}>
              <tbody>
                {charges.lines.map((l) => (
                  <tr key={l.service} style={{ borderBottom: '1px solid hsl(var(--line-soft))' }}>
                    <td style={{ padding: '8px 0' }}>{t(l.service)} <span className="ktc-label" style={{ fontSize: 12 }}>× {l.qty}</span></td>
                    <td className="ktc-mono" style={{ textAlign: 'right', padding: '8px 0' }}>{l.amount == null ? '—' : peso(l.amount)}</td>
                  </tr>
                ))}
                <tr><td style={{ padding: '8px 0' }} className="ktc-label">{t('VAT ({pct}% of vatable services)', { pct: (cfg!.vatRate * 100).toFixed(0) })}</td>
                  <td className="ktc-mono" style={{ textAlign: 'right' }}>{peso(charges.vat)}</td></tr>
                <tr><td style={{ padding: '8px 0' }} className="ktc-label">{t('Admin / service fee')}</td>
                  <td className="ktc-mono" style={{ textAlign: 'right' }}>{charges.adminFee == null ? '—' : peso(charges.adminFee)}</td></tr>
                <tr style={{ borderBottom: '1px solid hsl(var(--line-soft))' }}>
                  <td style={{ padding: '8px 0' }} className="ktc-label">{t('Print fee')}</td>
                  <td className="ktc-mono" style={{ textAlign: 'right' }}>{charges.printFee == null ? '—' : peso(charges.printFee)}</td></tr>
                <tr>
                  <td style={{ padding: '10px 0', fontWeight: 700, fontSize: 15 }}>{t('Total')}</td>
                  <td className="ktc-mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 16 }}>{peso(breakdown?.total ?? charges.total)}</td>
                </tr>
                {(breakdown?.paid ?? 0) > 0 && (
                  <tr><td style={{ padding: '6px 0' }} className="ktc-label">{t('Paid')}</td>
                    <td className="ktc-mono" style={{ textAlign: 'right', color: 'var(--c-h150-60-30)' }}>− {peso(breakdown!.paid)}</td></tr>
                )}
                <tr style={{ borderTop: '1px solid hsl(var(--line-soft))' }}>
                  <td style={{ padding: '12px 0', fontWeight: 700, fontSize: 15 }}>{fullySettled ? t('Balance') : t('Balance due')}</td>
                  <td className="ktc-mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 17, color: fullySettled ? 'var(--c-h150-60-30)' : 'var(--acc-2)' }}>
                    {fullySettled ? t('PAID') : peso(breakdown?.balance ?? charges.total)}
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
            {rpsDue && (
              <p className="ktc-label" style={{ fontSize: 12, marginTop: 10 }}>
                {t('Includes')} <b>{t('port-services (RPS)')}</b> {t('assessed by operations — payable separately below.')}
              </p>
            )}
          </>
        )}
      </div>

      {anythingToPay && (
        <>
          {/* How to pay (shared) */}
          <div className="ktc-glass" style={{ padding: 26, marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 650 }}>{t('How to pay')}</h2>
              <div style={{ display: 'grid', gap: 6, marginTop: 12, fontSize: 13.5 }}>
                {info.get('bank_name') && <div><span className="ktc-label">{t('Bank:')}</span> <b>{info.get('bank_name')}</b></div>}
                {info.get('account_name') && <div><span className="ktc-label">{t('Account name:')}</span> <b>{info.get('account_name')}</b></div>}
                {info.get('account_number') && <div><span className="ktc-label">{t('Account no.:')}</span> <b className="ktc-mono">{info.get('account_number')}</b></div>}
                {!info.get('bank_name') && !info.get('account_number') && !qrUrl && (
                  <span className="ktc-label">{t('Payment details will be posted here soon — or pay directly at the KTC cashier.')}</span>
                )}
              </div>
              {info.get('instructions') && (
                <p className="ktc-label" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.55 }}>{info.get('instructions')}</p>
              )}
            </div>
            {qrUrl && (
              <div style={{ flex: '0 0 auto', textAlign: 'center', maxWidth: '100%' }}>
                <button type="button" onClick={() => setQrOpen(true)} title={t('Tap to enlarge or download')}
                  style={{ display: 'block', margin: '0 auto', padding: 0, border: 0, background: 'none', cursor: 'pointer' }}>
                  <img src={qrUrl} alt={t('Payment QR code')}
                    style={{ width: 'min(240px, 64vw)', aspectRatio: '1 / 1', objectFit: 'contain', borderRadius: 14, background: '#fff', border: '1px solid var(--glass-brd)', boxShadow: 'var(--shadow-sm)' }} />
                </button>
                <div className="ktc-label" style={{ fontSize: 11.5, marginTop: 7, lineHeight: 1.45 }}>
                  {t('QRPH — scan with any bank or e-wallet app (GCash, Maya, etc.)')}<br />
                  <button type="button" className="ktc-link" style={{ fontSize: 11.5 }} onClick={() => setQrOpen(true)}>{t('Tap to enlarge or download')}</button>
                </div>
              </div>
            )}
          </div>

          {qrOpen && qrUrl && (
            <FileViewerModal title={t('KTC Payment QR (QRPH)')} fileName={qrFileName} url={qrUrl} onClose={() => setQrOpen(false)} />
          )}

          {error && <Notice tone="error" style={{ marginBottom: 16 }}>{error}</Notice>}

          {!fullySettled && (
            <PaySection
              title={t('X-ray charges')}
              amount={breakdown?.baseTotal ?? 0}
              status={baseConfirmed ? 'confirmed' : (order.payment_status ?? 'unpaid')}
              note={order.payment_note ?? null}
              submittedAt={order.payment_submitted_at ?? null}
              file={file}
              setFile={setFile}
              onSubmit={() => void submitProof('base', file)}
              busy={busy}
            />
          )}

          {!fullySettled && rpsDue && (
            <PaySection
              title={t('Port-services (RPS) charges')}
              amount={breakdown?.rpsAmount ?? 0}
              status={rpsConfirmed ? 'confirmed' : (order.rps_payment_status ?? 'unpaid')}
              note={order.rps_payment_note ?? null}
              submittedAt={order.rps_payment_submitted_at ?? null}
              file={rpsFile}
              setFile={setRpsFile}
              onSubmit={() => void submitProof('rps', rpsFile)}
              busy={busy}
            />
          )}

          {/* Additional charges (supplements) — each settled separately. */}
          {outstandingSupps.map((s) => (
            <PaySection
              key={s.id}
              title={`${t('Additional charge')} · ${order.jo_number ?? ''}-${s.suffix} — ${s.label}`}
              amount={s.amount}
              status={s.payment_status}
              note={s.payment_note ?? null}
              submittedAt={s.payment_submitted_at ?? null}
              file={suppFiles[s.id] ?? null}
              setFile={(f) => setSuppFiles((m) => ({ ...m, [s.id]: f }))}
              onSubmit={() => void submitSuppProof(s.id)}
              busy={suppBusy === s.id}
            />
          ))}
        </>
      )}

      <p style={{ marginTop: 18 }}>
        <Link to="/job-orders" className="ktc-link" style={{ fontSize: 13 }}>← {t('Back to My Job Orders')}</Link>
      </p>
    </Shell>
  )
}

function PaySection({ title, amount, status, note, submittedAt, file, setFile, onSubmit, busy }: {
  title: string
  amount: number
  status: string
  note: string | null
  submittedAt: string | null
  file: File | null
  setFile: (f: File | null) => void
  onSubmit: () => void
  busy: boolean
}) {
  const { t } = useT()
  return (
    <div className="ktc-glass" style={{ padding: 26, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 650 }}>{title}</h2>
        <span className="ktc-mono" style={{ fontWeight: 700, fontSize: 15 }}>{peso(amount)}</span>
      </div>
      {status === 'confirmed' ? (
        <Notice tone="success" style={{ marginTop: 12 }}>✓ {t('Confirmed by KTC.')}</Notice>
      ) : status === 'submitted' ? (
        <Notice tone="info" style={{ marginTop: 12 }}>
          {t('Your proof is with KTC for review')}{submittedAt ? ` ${t('(sent {when})', { when: new Date(submittedAt).toLocaleString() })}` : ''}. {t('You’ll see the result here.')}
        </Notice>
      ) : (
        <>
          {status === 'rejected' && (
            <Notice tone="error" style={{ marginTop: 12 }}>{t('Your proof wasn’t accepted')}{note ? <>: <b>{note}</b></> : ''}. {t('Please re-upload a corrected slip.')}</Notice>
          )}
          <p className="ktc-label" style={{ fontSize: 13, marginTop: 10 }}>
            {t('Upload a clear photo or PDF of the deposit / transfer receipt.')}
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            {!file ? (
              <input className="ktc-input" type="file" accept="image/*,application/pdf" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }} style={{ maxWidth: 340, width: '100%', padding: '10px 13px' }} />
            ) : (
              <>
                <span style={{ fontSize: 13, fontWeight: 500, padding: '9px 13px', borderRadius: 10, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 }}><PaperclipIcon size={14} /> {file.name}</span>
                <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={onSubmit}>{busy ? t('Sending…') : t('Submit to KTC')}</button>
                <button type="button" className="ktc-link" disabled={busy} onClick={() => setFile(null)}>{t('Remove')}</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
