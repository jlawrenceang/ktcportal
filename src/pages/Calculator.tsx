import { useEffect, useMemo, useState } from 'react'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { computeCharges, peso, type PricingConfig } from '../lib/pricing'

// Rate calculator — estimate charges before filing: pick container counts per
// service and see the same breakdown the payment page uses (rates are
// admin-configured; VAT on vatable services + flat fees).

export default function Calculator() {
  const [cfg, setCfg] = useState<PricingConfig | null>(null)
  const [counts, setCounts] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    void (async () => {
      const [{ data: r }, { data: s }] = await Promise.all([
        supabase.from('service_rates').select('service, rate, unit, vatable, active').eq('active', true).order('sort_order').order('service'),
        supabase.from('pricing_settings').select('key, value'),
      ])
      const settings = new Map(((s ?? []) as { key: string; value: number }[]).map((x) => [x.key, Number(x.value)]))
      setCfg({
        rates: ((r ?? []) as PricingConfig['rates']).map((x) => ({ ...x, rate: Number(x.rate) })),
        vatRate: settings.get('vat_rate') ?? 0.12,
        adminFee: settings.get('admin_fee') ?? 0,
        printFee: settings.get('print_fee') ?? 0,
      })
    })()
  }, [])

  const charges = useMemo(() => (cfg ? computeCharges(counts, cfg) : null), [counts, cfg])
  const anyQty = Array.from(counts.values()).some((n) => n > 0)

  function setQty(service: string, qty: number) {
    setCounts((prev) => {
      const next = new Map(prev)
      next.set(service, Math.max(0, Math.floor(qty) || 0))
      return next
    })
  }

  return (
    <Shell>
      <div style={{ margin: '14px 4px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em' }}>Rate Calculator</h1>
        <p className="ktc-sub" style={{ maxWidth: 520 }}>
          Estimate your charges before filing — enter how many containers need each service. The official amount is confirmed on the Service Invoice at the KTC office.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div className="ktc-glass" style={{ padding: 24 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15.5, fontWeight: 650 }}>Containers per service</h2>
          {!cfg ? (
            <div className="ktc-skeleton" style={{ height: 180 }} />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {cfg.rates.map((r) => (
                <div key={r.service} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.service}</div>
                    <div className="ktc-label" style={{ fontSize: 11.5 }}>
                      {r.rate > 0 ? `${peso(r.rate)} / container${r.vatable ? ' + VAT' : ''}` : 'rate to be confirmed by KTC'}
                    </div>
                  </div>
                  <input
                    className="ktc-input ktc-mono"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={counts.get(r.service) || ''}
                    placeholder="0"
                    onChange={(e) => setQty(r.service, Number(e.target.value))}
                    style={{ width: 84, padding: '8px 10px', textAlign: 'center', fontSize: 15 }}
                    aria-label={`${r.service} containers`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ktc-glass" style={{ padding: 24, position: 'sticky', top: 86 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15.5, fontWeight: 650 }}>Estimate</h2>
          {!charges || !anyQty ? (
            <p className="ktc-label" style={{ fontSize: 13.5 }}>Enter container counts to see the breakdown.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <tbody>
                {charges.lines.filter((l) => l.qty > 0).map((l) => (
                  <tr key={l.service} style={{ borderBottom: '1px solid hsl(var(--line-soft))' }}>
                    <td style={{ padding: '7px 0' }}>{l.service} <span className="ktc-label" style={{ fontSize: 12 }}>× {l.qty}</span></td>
                    <td className="ktc-mono" style={{ textAlign: 'right' }}>{l.missingRate ? '—' : peso(l.amount)}</td>
                  </tr>
                ))}
                <tr><td style={{ padding: '7px 0' }} className="ktc-label">VAT ({((cfg?.vatRate ?? 0) * 100).toFixed(0)}%)</td>
                  <td className="ktc-mono" style={{ textAlign: 'right' }}>{peso(charges.vat)}</td></tr>
                <tr><td style={{ padding: '7px 0' }} className="ktc-label">Admin / service fee</td>
                  <td className="ktc-mono" style={{ textAlign: 'right' }}>{peso(charges.adminFee)}</td></tr>
                <tr style={{ borderBottom: '1px solid hsl(var(--line-soft))' }}>
                  <td style={{ padding: '7px 0' }} className="ktc-label">Print fee</td>
                  <td className="ktc-mono" style={{ textAlign: 'right' }}>{peso(charges.printFee)}</td></tr>
                <tr>
                  <td style={{ padding: '11px 0', fontWeight: 700, fontSize: 15 }}>Estimated total</td>
                  <td className="ktc-mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 17, color: 'var(--acc-2)' }}>{peso(charges.total)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {charges?.hasMissingRates && anyQty && (
            <p className="ktc-label" style={{ fontSize: 12, marginTop: 10, color: 'hsl(30 70% 36%)' }}>
              Some rates aren’t configured yet — “—” lines aren’t included in the total.
            </p>
          )}
        </div>
      </div>
    </Shell>
  )
}
