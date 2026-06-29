import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { prepareUpload } from '../lib/validation'
import { loadPricingConfig, peso } from '../lib/pricing'
import { useT } from '../lib/i18n'
import Notice from './Notice'
import { PaperclipIcon } from './icons'

// Customer-facing, fully transparent charge breakdown for ONE Job Order — the
// direct fix for the "questionable / surprise charges" complaint (ADR-0037
// Phase A). Every billable on the order is its own `charges` row: shown,
// labelled, attributable, with its own invoice + payment state. Nothing is
// hidden — what KTC bills here is the whole bill. Each amount is VAT-EXCLUSIVE;
// VAT (vatable lines only) + total are derived below, never assumed.
//
// Owner-review flagged: kept de-glassed (hairline borders, data-as-hero) so it
// reads as calm and trustworthy rather than a busy app panel.

type Charge = {
  id: string
  charge_type: 'xray' | 'rps' | 'addon'
  label: string
  qty: number
  unit_rate: number | null
  amount: number | null
  vatable: boolean
  bill_status: 'proposed' | 'billed' | 'cancelled'
  erp_invoice_no: string | null
  bir_invoice_no: string | null
  invoice_state: 'draft' | 'final'
  payment_status: 'unpaid' | 'submitted' | 'confirmed' | 'rejected' | 'reversed'
  payment_note: string | null
  payment_submitted_at: string | null
  created_at: string
}

// Per-status semantic tone, rendered with the shared .ktc-chip classes.
const PAY_TONE: Record<string, string> = {
  unpaid: 'warning', submitted: 'info', confirmed: 'success', rejected: 'danger', reversed: 'danger',
}
const PAY_LABEL: Record<string, string> = {
  unpaid: 'Unpaid', submitted: 'Submitted', confirmed: 'Confirmed', rejected: 'Rejected', reversed: 'Reversed',
}

const money = (n: number | null) => (n == null ? '—' : peso(n))

export default function JobOrderCharges({ jobOrderId }: { jobOrderId: string }) {
  const { t } = useT()
  const { broker } = useBroker()
  const [charges, setCharges] = useState<Charge[]>([])
  const [vatRate, setVatRate] = useState(0.12)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  async function load() {
    setLoadError(null)
    const [{ data, error }, cfg] = await Promise.all([
      supabase.from('charges')
        .select('id, charge_type, label, qty, unit_rate, amount, vatable, bill_status, erp_invoice_no, bir_invoice_no, invoice_state, payment_status, payment_note, payment_submitted_at, created_at')
        .eq('job_order_id', jobOrderId)
        .order('created_at', { ascending: true }),
      loadPricingConfig(),
    ])
    if (error) { setLoadError(error.message); setLoading(false); return }
    // numeric columns arrive as strings — coerce (preserving null = "rate not set").
    setCharges(((data ?? []) as Record<string, unknown>[]).map((r) => ({
      ...(r as unknown as Charge),
      qty: r.qty == null ? 0 : Number(r.qty),
      unit_rate: r.unit_rate == null ? null : Number(r.unit_rate),
      amount: r.amount == null ? null : Number(r.amount),
    })))
    setVatRate(cfg.vatRate)
    setLoading(false)
  }
  useEffect(() => { void load() }, [jobOrderId]) // eslint-disable-line react-hooks/exhaustive-deps

  // The payable bill = billed (approved), non-reversed charges. Proposed add-ons
  // are shown for transparency but aren't yet billable; reversed = credited back.
  const counted = charges.filter((c) => c.bill_status === 'billed' && c.payment_status !== 'reversed')
  const subtotal = counted.reduce((s, c) => s + (c.amount ?? 0), 0)
  const vatableBase = counted.filter((c) => c.vatable).reduce((s, c) => s + (c.amount ?? 0), 0)
  const vat = vatableBase * vatRate
  const total = subtotal + vat
  const hasMissingRates = counted.some((c) => c.amount == null)

  return (
    <section style={{ border: '1px solid var(--glass-brd)', borderRadius: 14, padding: '16px 18px' }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650 }}>{t('Charges')}</h2>
      <p className="ktc-label" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
        {t('Every charge on this order — itemized and verifiable. No hidden fees.')}
      </p>

      {loading ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 14 }} aria-label={t('Loading charges')}>
          {[52, 52].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 10 }} />)}
        </div>
      ) : loadError ? (
        <div style={{ marginTop: 14 }}>
          <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => { setLoading(true); void load() }}>{t('Retry')}</button>}>{loadError}</Notice>
        </div>
      ) : charges.length === 0 ? (
        <p className="ktc-label" style={{ fontSize: 13, marginTop: 14, marginBottom: 0 }}>
          {t('No charges have been added to this order yet.')}
        </p>
      ) : (
        <>
          <div style={{ marginTop: 12 }}>
            {charges.map((c) => {
              const tone = PAY_TONE[c.payment_status] ?? ''
              const payable = c.bill_status === 'billed' && (c.payment_status === 'unpaid' || c.payment_status === 'rejected')
              return (
                <div key={c.id} style={{ borderTop: '1px solid hsl(var(--line-soft))', padding: '12px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, wordBreak: 'break-word' }}>{c.label}</div>
                      <div className="ktc-label" style={{ fontSize: 12, marginTop: 2 }}>
                        {c.qty} × {money(c.unit_rate)} · {c.vatable ? t('VAT') : t('VAT-exempt')}
                      </div>
                    </div>
                    <div className="ktc-mono" style={{ fontWeight: 700, fontSize: 15, flex: '0 0 auto' }}>{money(c.amount)}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {c.bill_status === 'proposed' && <span className="ktc-chip ktc-chip--warning">{t('Awaiting approval')}</span>}
                    {c.bill_status === 'cancelled' && <span className="ktc-chip">{t('Cancelled')}</span>}
                    <span className={c.invoice_state === 'final' ? 'ktc-chip ktc-chip--info' : 'ktc-chip'}>
                      {c.invoice_state === 'final' ? t('Final invoice') : t('Draft invoice')}
                    </span>
                    <span className={tone ? `ktc-chip ktc-chip--${tone}` : 'ktc-chip'}>
                      {t(PAY_LABEL[c.payment_status] ?? c.payment_status)}
                    </span>
                  </div>

                  {c.invoice_state === 'final' && (c.erp_invoice_no || c.bir_invoice_no) && (
                    <div className="ktc-label" style={{ fontSize: 11.5, marginTop: 7 }}>
                      {t('Invoice on file:')}{' '}
                      {c.erp_invoice_no && <span className="ktc-mono">{c.erp_invoice_no}</span>}
                      {c.erp_invoice_no && c.bir_invoice_no ? ' · ' : ''}
                      {c.bir_invoice_no && <span className="ktc-mono">{c.bir_invoice_no}</span>}
                    </div>
                  )}

                  {c.bill_status === 'proposed' && (
                    <p className="ktc-label" style={{ fontSize: 11.5, marginTop: 7, marginBottom: 0, fontStyle: 'italic' }}>
                      {t('Pending KTC approval — not yet billable.')}
                    </p>
                  )}

                  {payable && broker && (
                    <ChargePay
                      chargeId={c.id}
                      userId={broker.user_id}
                      status={c.payment_status}
                      note={c.payment_note}
                      onDone={() => { setLoading(true); void load() }}
                    />
                  )}
                  {c.payment_status === 'submitted' && (
                    <Notice tone="info" style={{ marginTop: 10 }}>
                      {t('Your proof is with KTC for review')}{c.payment_submitted_at ? ` ${t('(sent {when})', { when: new Date(c.payment_submitted_at).toLocaleString() })}` : ''}. {t('You’ll see the result here.')}
                    </Notice>
                  )}
                </div>
              )
            })}
          </div>

          {/* Totals — each line above is VAT-exclusive; VAT applies to vatable lines only. */}
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <tbody>
                <tr style={{ borderTop: '1px solid hsl(var(--line-soft))' }}>
                  <td style={{ padding: '8px 0' }} className="ktc-label">{t('Subtotal')}</td>
                  <td className="ktc-mono" style={{ textAlign: 'right', padding: '8px 0' }}>{peso(subtotal)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0' }} className="ktc-label">{t('VAT ({pct}% of vatable charges)', { pct: (vatRate * 100).toFixed(0) })}</td>
                  <td className="ktc-mono" style={{ textAlign: 'right', padding: '8px 0' }}>{peso(vat)}</td>
                </tr>
                <tr style={{ borderTop: '1px solid hsl(var(--line-soft))' }}>
                  <td style={{ padding: '10px 0', fontWeight: 700, fontSize: 15 }}>{t('Total')}</td>
                  <td className="ktc-mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 16 }}>{peso(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {hasMissingRates && (
            <p className="ktc-label" style={{ fontSize: 12, marginTop: 8, marginBottom: 0, color: 'var(--c-h30-70-36)' }}>
              {t('Some rates aren’t set yet — KTC will confirm the final amount.')}
            </p>
          )}
        </>
      )}
    </section>
  )
}

// Compact per-charge slip uploader — mirrors the Payment page proof flow
// (validate → upload to payment-slips → submit_charge_payment). Owns its own
// file/busy state so each charge settles independently.
function ChargePay({ chargeId, userId, status, note, onDone }: {
  chargeId: string
  userId: string
  status: string
  note: string | null
  onDone: () => void
}) {
  const { t } = useT()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!file) return
    setBusy(true); setError(null)
    const prepared = await prepareUpload(file)
    if ('error' in prepared) { setBusy(false); setError(prepared.error); return }
    const ext = prepared.file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${userId}/charge-${chargeId}.${ext}`
    const { error: upErr } = await supabase.storage.from('payment-slips').upload(path, prepared.file, { upsert: true })
    if (upErr) { setBusy(false); setError(upErr.message); return }
    const { error: rpcErr } = await supabase.rpc('submit_charge_payment', { p_charge: chargeId, p_proof: path })
    setBusy(false)
    if (rpcErr) { setError(rpcErr.message); return }
    setFile(null)
    onDone()
  }

  return (
    <div style={{ marginTop: 10 }}>
      {status === 'rejected' && (
        <Notice tone="error" style={{ marginBottom: 10 }}>
          {t('Your proof wasn’t accepted')}{note ? <>: <b>{note}</b></> : ''}. {t('Please re-upload a corrected slip.')}
        </Notice>
      )}
      <div className="ktc-label" style={{ fontSize: 12.5, fontWeight: 600 }}>{t('Pay this charge')}</div>
      <p className="ktc-label" style={{ fontSize: 12.5, marginTop: 4 }}>
        {t('Upload a clear photo or PDF of the deposit / transfer receipt.')}
      </p>
      {error && <Notice tone="error" style={{ marginBottom: 10 }}>{error}</Notice>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        {!file ? (
          <input className="ktc-input" type="file" accept="image/*,application/pdf" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }} style={{ maxWidth: 340, width: '100%', padding: '10px 13px' }} />
        ) : (
          <>
            <span style={{ fontSize: 13, fontWeight: 500, padding: '9px 13px', borderRadius: 10, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 }}><PaperclipIcon size={14} /> {file.name}</span>
            <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void submit()}>{busy ? t('Sending…') : t('Submit to KTC')}</button>
            <button type="button" className="ktc-link" disabled={busy} onClick={() => setFile(null)}>{t('Remove')}</button>
          </>
        )}
      </div>
    </div>
  )
}
