import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadPricingConfig, peso } from '../lib/pricing'
import { useT } from '../lib/i18n'

// Public, read-only, anti-forgery charge view for the slip QR (/verify/:id).
// The printed paper is cosmetic — THIS scan is the proof. It shows the
// AUTHORITATIVE charges, amounts and true paid/unpaid state straight from the
// KTC database, so a forged or copied invoice is exposed: the real total
// differs, or the charge isn't actually paid. No login, no actions.
//
// Mounted INSIDE the standalone Verify card, so it matches that card's plain
// hex / system-font styling (NOT the themed app's glass) — which is exactly the
// calm, de-glassed, data-as-hero treatment this owner-review surface wants.
//
// Data source: the anon `verify_job_order_charges(p_id)` definer RPC (mirrors
// the existing `verify_job_order`) — returns only the non-sensitive billing
// facts and is granted to anon so it resolves without a portal session.

type VRow = {
  label: string
  qty: number
  unit_rate: number | null
  amount: number | null
  vatable: boolean
  invoice_state: string
  payment_status: string
  charge_type: string
}

const INK = '#15233a'
const MUTED = '#5a6678'
const LINE = '#eef1f5'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const PAID = { bg: '#e9f7ee', ink: '#13682f' }
const UNPAID = { bg: '#fff6e6', ink: '#a35a16' }

const money = (n: number | null) => (n == null ? '—' : peso(n))

export default function VerifyCharges({ jobOrderId }: { jobOrderId: string }) {
  const { t } = useT()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [rows, setRows] = useState<VRow[]>([])
  const [vatRate, setVatRate] = useState(0.12)

  useEffect(() => {
    let active = true
    void Promise.all([
      supabase.rpc('verify_job_order_charges', { p_id: jobOrderId }),
      loadPricingConfig(),
    ]).then(([{ data, error }, cfg]) => {
      if (!active) return
      if (error) { setPhase('error'); return }
      setRows(((data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...(r as unknown as VRow),
        qty: r.qty == null ? 0 : Number(r.qty),
        unit_rate: r.unit_rate == null ? null : Number(r.unit_rate),
        amount: r.amount == null ? null : Number(r.amount),
      })))
      setVatRate(cfg.vatRate)
      setPhase('ready')
    })
    return () => { active = false }
  }, [jobOrderId])

  if (phase === 'loading') {
    return <p style={{ textAlign: 'center', color: MUTED, fontSize: 13, marginTop: 16 }}>{t('Loading charges…')}</p>
  }
  if (phase === 'error') {
    return <p style={{ textAlign: 'center', color: MUTED, fontSize: 13, marginTop: 16 }}>{t('Couldn’t load the charges right now.')}</p>
  }
  if (rows.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: MUTED, fontSize: 13, marginTop: 16 }}>
        {t('No charges are recorded for this order.')}
      </p>
    )
  }

  const subtotal = rows.reduce((s, c) => s + (c.amount ?? 0), 0)
  const vatableBase = rows.filter((c) => c.vatable).reduce((s, c) => s + (c.amount ?? 0), 0)
  const vat = vatableBase * vatRate
  const total = subtotal + vat
  const allPaid = rows.every((c) => c.payment_status === 'confirmed')

  return (
    <div style={{ marginTop: 18, fontFamily: '-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', color: INK }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', color: MUTED }}>
          {t('Charges on record')}
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, letterSpacing: '0.04em', background: allPaid ? PAID.bg : UNPAID.bg, color: allPaid ? PAID.ink : UNPAID.ink }}>
          {allPaid ? t('ALL PAID') : t('BALANCE DUE')}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 10 }}>
        <tbody>
          {rows.map((c, i) => {
            const paid = c.payment_status === 'confirmed'
            const tone = paid ? PAID : UNPAID
            return (
              <tr key={i} style={{ borderBottom: `1px solid ${LINE}` }}>
                <td style={{ padding: '8px 0', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 600 }}>{c.label}</div>
                  <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
                    {c.qty} × {money(c.unit_rate)}
                    <span style={{ marginLeft: 8, fontWeight: 700, fontSize: 10.5, color: tone.ink }}>
                      {paid ? t('PAID') : c.payment_status === 'reversed' ? t('REVERSED') : t('UNPAID')}
                    </span>
                  </div>
                </td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: MONO, fontWeight: 600, verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  {money(c.amount)}
                </td>
              </tr>
            )
          })}
          <tr>
            <td style={{ padding: '8px 0', color: MUTED }}>{t('Subtotal')}</td>
            <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: MONO }}>{peso(subtotal)}</td>
          </tr>
          <tr style={{ borderBottom: `1px solid ${LINE}` }}>
            <td style={{ padding: '8px 0', color: MUTED }}>{t('VAT ({pct}% of vatable charges)', { pct: (vatRate * 100).toFixed(0) })}</td>
            <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: MONO }}>{peso(vat)}</td>
          </tr>
          <tr>
            <td style={{ padding: '10px 0', fontWeight: 800, fontSize: 14.5 }}>{t('Total')}</td>
            <td style={{ padding: '10px 0', textAlign: 'right', fontFamily: MONO, fontWeight: 800, fontSize: 15 }}>{peso(total)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#f3f6fb', border: '1px solid #dde6f1', fontSize: 11.5, color: '#46566c', lineHeight: 1.5 }}>
        <b>{t('These are the official charges on record.')}</b>{' '}
        {t('Match the total and the paid status against the paper slip — a copied or edited invoice will not match.')}
      </div>
    </div>
  )
}
