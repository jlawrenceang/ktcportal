import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Shell from '../components/Shell'
import Notice from '../components/Notice'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { prepareUpload } from '../lib/validation'
import { loadPricingConfig, computeCharges, peso, type PricingConfig } from '../lib/pricing'
import type { JobOrder } from '../lib/types'

// Per-JO payment page: fee computation + KTC bank/GCash details + QR +
// deposit-slip upload → admin review. NON-GATED: the order is processed
// regardless; the official Service Invoice still comes from the ERP cashier.

interface PayInfo { key: string; value: string; label: string | null }

export default function Payment() {
  const { id } = useParams()
  const { broker } = useBroker()
  const [order, setOrder] = useState<JobOrder | null>(null)
  const [cfg, setCfg] = useState<PricingConfig | null>(null)
  const [info, setInfo] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function load() {
    if (!id) return
    const [{ data: jo }, pricing, { data: pi }] = await Promise.all([
      supabase.from('job_orders')
        .select('id, jo_number, status, payment_status, payment_note, payment_submitted_at, service_invoice_no, created_at, consignee:consignees(code, name), lines:job_order_lines(container_number, service_request)')
        .eq('id', id).maybeSingle(),
      loadPricingConfig(),
      supabase.from('payment_info').select('key, value, label'),
    ])
    setOrder((jo as unknown as JobOrder) ?? null)
    setCfg(pricing)
    setInfo(new Map(((pi ?? []) as PayInfo[]).map((r) => [r.key, r.value])))
    setLoading(false)
  }
  useEffect(() => { void load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const charges = useMemo(() => {
    if (!order || !cfg) return null
    const counts = new Map<string, number>()
    for (const l of order.lines ?? []) counts.set(l.service_request, (counts.get(l.service_request) ?? 0) + 1)
    return computeCharges(counts, cfg)
  }, [order, cfg])

  async function submitProof() {
    if (!order || !file || !broker) return
    setBusy(true); setError(null)
    const prepared = await prepareUpload(file)
    if ('error' in prepared) { setBusy(false); setError(prepared.error); return }
    const ext = prepared.file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${broker.user_id}/jo-${order.id}.${ext}`
    const { error: upErr } = await supabase.storage.from('payment-slips').upload(path, prepared.file, { upsert: true })
    if (upErr) { setBusy(false); setError(upErr.message); return }
    const { error: rpcErr } = await supabase.rpc('submit_payment_proof', { p_id: order.id, p_path: path })
    setBusy(false)
    if (rpcErr) { setError(rpcErr.message); return }
    setFile(null); setDone(true)
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
        <div className="ktc-glass" style={{ padding: 28 }}>
          <p className="ktc-label">Job order not found. <Link to="/job-orders" className="ktc-link">Back to My Job Orders</Link></p>
        </div>
      </Shell>
    )
  }

  const paid = order.payment_status === 'confirmed' || !!order.service_invoice_no
  const qrPath = info.get('qr_path')
  const qrUrl = qrPath ? supabase.storage.from('payment-qr').getPublicUrl(qrPath).data.publicUrl : null

  return (
    <Shell>
      <div style={{ margin: '14px 4px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em' }}>
          Payment · <span className="ktc-mono">{order.jo_number ?? 'Draft'}</span>
        </h1>
        <p className="ktc-sub">
          {order.consignee ? `${order.consignee.code} – ${order.consignee.name} · ` : ''}
          Payment doesn’t block processing — the official Service Invoice is issued at the KTC office.
        </p>
      </div>

      {paid && (
        <Notice tone="success" style={{ marginBottom: 16 }}>
          {order.service_invoice_no?.toUpperCase().startsWith('BI')
            ? `✓ Billed on account — Billing Invoice ${order.service_invoice_no}.`
            : order.service_invoice_no
              ? `✓ Payment recorded — Service Invoice ${order.service_invoice_no}.`
              : '✓ Payment confirmed by KTC. Collect the official Service Invoice at the KTC office.'}
        </Notice>
      )}
      {order.payment_status === 'submitted' && (
        <Notice tone="info" style={{ marginBottom: 16 }}>
          Your payment proof is with KTC for review (sent {order.payment_submitted_at ? new Date(order.payment_submitted_at).toLocaleString() : ''}). You’ll see the result here.
        </Notice>
      )}
      {order.payment_status === 'rejected' && (
        <Notice tone="error" style={{ marginBottom: 16 }}>
          Your payment proof was not accepted{order.payment_note ? <>: <b>{order.payment_note}</b></> : ''}. Please re-upload a corrected slip below.
        </Notice>
      )}

      {/* Charges */}
      <div className="ktc-glass" style={{ padding: 26, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 650 }}>Charges</h2>
        {charges && (
          <>
            {charges.hasMissingRates && (
              <p className="ktc-label" style={{ fontSize: 12.5, marginTop: 8, color: 'hsl(30 70% 36%)' }}>
                Some rates aren’t configured yet — the total below may be incomplete. KTC will confirm the final amount.
              </p>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 13.5 }}>
              <tbody>
                {charges.lines.map((l) => (
                  <tr key={l.service} style={{ borderBottom: '1px solid hsl(var(--line-soft))' }}>
                    <td style={{ padding: '8px 0' }}>{l.service} <span className="ktc-label" style={{ fontSize: 12 }}>× {l.qty}</span></td>
                    <td className="ktc-mono" style={{ textAlign: 'right', padding: '8px 0' }}>{l.missingRate ? '—' : peso(l.amount)}</td>
                  </tr>
                ))}
                <tr><td style={{ padding: '8px 0' }} className="ktc-label">VAT ({(cfg!.vatRate * 100).toFixed(0)}% of vatable services)</td>
                  <td className="ktc-mono" style={{ textAlign: 'right' }}>{peso(charges.vat)}</td></tr>
                <tr><td style={{ padding: '8px 0' }} className="ktc-label">Admin / service fee</td>
                  <td className="ktc-mono" style={{ textAlign: 'right' }}>{peso(charges.adminFee)}</td></tr>
                <tr style={{ borderBottom: '1px solid hsl(var(--line-soft))' }}>
                  <td style={{ padding: '8px 0' }} className="ktc-label">Print fee</td>
                  <td className="ktc-mono" style={{ textAlign: 'right' }}>{peso(charges.printFee)}</td></tr>
                <tr>
                  <td style={{ padding: '12px 0', fontWeight: 700, fontSize: 15 }}>Total</td>
                  <td className="ktc-mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 17, color: 'var(--acc-2)' }}>{peso(charges.total)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>

      {!paid && (
        <>
          {/* How to pay */}
          <div className="ktc-glass" style={{ padding: 26, marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 650 }}>How to pay</h2>
              <div style={{ display: 'grid', gap: 6, marginTop: 12, fontSize: 13.5 }}>
                {info.get('bank_name') && <div><span className="ktc-label">Bank:</span> <b>{info.get('bank_name')}</b></div>}
                {info.get('account_name') && <div><span className="ktc-label">Account name:</span> <b>{info.get('account_name')}</b></div>}
                {info.get('account_number') && <div><span className="ktc-label">Account no.:</span> <b className="ktc-mono">{info.get('account_number')}</b></div>}
                {info.get('gcash_number') && <div><span className="ktc-label">GCash:</span> <b className="ktc-mono">{info.get('gcash_number')}</b></div>}
                {!info.get('bank_name') && !info.get('gcash_number') && (
                  <span className="ktc-label">Payment details will be posted here soon — or pay directly at the KTC cashier.</span>
                )}
              </div>
              {info.get('instructions') && (
                <p className="ktc-label" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.55 }}>{info.get('instructions')}</p>
              )}
            </div>
            {qrUrl && (
              <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
                <img src={qrUrl} alt="Payment QR code" style={{ width: 168, height: 168, objectFit: 'contain', borderRadius: 14, background: '#fff', border: '1px solid var(--glass-brd)', boxShadow: 'var(--shadow-sm)' }} />
                <div className="ktc-label" style={{ fontSize: 11.5, marginTop: 6 }}>Scan to pay</div>
              </div>
            )}
          </div>

          {/* Upload proof */}
          <div className="ktc-glass" style={{ padding: 26 }}>
            <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 650 }}>
              {order.payment_status === 'rejected' ? 'Re-upload your payment slip' : 'Upload your payment slip'}
            </h2>
            <p className="ktc-label" style={{ fontSize: 13, marginTop: 6 }}>
              A clear photo or PDF of the deposit / transfer / GCash receipt. KTC reviews it and confirms here.
            </p>
            {error && <Notice tone="error" style={{ marginTop: 12 }}>{error}</Notice>}
            {done && order.payment_status === 'submitted' ? null : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
                {!file ? (
                  <input
                    className="ktc-input"
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={busy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(null) } }}
                    style={{ maxWidth: 340, padding: '10px 13px' }}
                  />
                ) : (
                  <>
                    <span style={{ fontSize: 13, fontWeight: 500, padding: '9px 13px', borderRadius: 10, background: 'rgba(255,255,255,0.6)', border: '1px solid var(--glass-brd)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📎 {file.name}
                    </span>
                    <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void submitProof()}>
                      {busy ? 'Sending…' : 'Submit to KTC'}
                    </button>
                    <button type="button" className="ktc-link" disabled={busy} onClick={() => setFile(null)}>Remove</button>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <p style={{ marginTop: 18 }}>
        <Link to="/job-orders" className="ktc-link" style={{ fontSize: 13 }}>← Back to My Job Orders</Link>
      </p>
    </Shell>
  )
}
