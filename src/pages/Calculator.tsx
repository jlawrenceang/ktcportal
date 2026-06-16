import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { peso } from '../lib/pricing'
import { usePageTour } from '../components/TourProvider'
import { calculatorSteps } from '../components/WelcomeTour'
import { useT } from '../lib/i18n'
import { SHIPPING_LINES, normLine, type Origin } from '../lib/shippingLines'

// Rate calculator — a guided estimate the customer builds step by step, then
// presses "Generate estimate" to see the charges. Flow (owner, 2026-06-16):
//   1. Shipping line + vessel & voyage  → trade route (foreign/domestic) + LFD
//   2. Trade route (derived from the line)
//   3. Import (withdrawal) or Export (deposit)  → which charges apply
//   4. 20ft / 40ft container counts
//   5. Generate → charges populate
// Basic terminal charges come from the admin tariff (terminal_rates, 0073/0078)
// keyed by service × trade × origin × size; ancillary (X-ray, electrical, storage)
// from service_rates / pricing_settings. All rates are set by KTC in Settings;
// the official amount is on the Service Invoice.

type TermRate = { service: string; trade: string; origin: string; size: string; rate: number }
type VesselOpt = { vessel_visit: string; vessel_name: string; voyage_number: string; last_free_day: string | null; shipping_line: string | null }
type Size = '20' | '40'
// A per-line charge rule (0080) layered on the base tariff.
type Rule = { shipping_line: string; service: string; trade: string | null; action: string; value: number }

export default function Calculator() {
  const { t } = useT()
  usePageTour('calculator', calculatorSteps)

  const [termRates, setTermRates] = useState<TermRate[]>([])
  const [xrayRate, setXrayRate] = useState(0)
  const [settings, setSettings] = useState({ vat: 0.12, admin: 0, print: 0, reefer: 0, reeferMin: 4, deposit: 10000 })
  const [vessels, setVessels] = useState<VesselOpt[]>([])
  const [rules, setRules] = useState<Rule[]>([])

  // Inputs
  const [line, setLine] = useState('')
  const [vesselVisit, setVesselVisit] = useState('')
  const [origin, setOrigin] = useState<Origin>('foreign')
  const [trade, setTrade] = useState<'import' | 'export'>('import')
  const [count20, setCount20] = useState(0)
  const [count40, setCount40] = useState(0)
  const [pickupDate, setPickupDate] = useState('')
  const [xrayVans, setXrayVans] = useState(0)
  const [reeferVans, setReeferVans] = useState(0)
  const [plugIn, setPlugIn] = useState('')
  const [plugOut, setPlugOut] = useState('')
  const [generated, setGenerated] = useState(false)
  const estimateRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => {
      const [{ data: tr }, { data: sr }, { data: ps }, { data: v }, { data: cr }] = await Promise.all([
        supabase.from('terminal_rates').select('service, trade, origin, size, rate'),
        supabase.from('service_rates').select('service, rate').ilike('service', '%x-ray%').limit(1),
        supabase.from('pricing_settings').select('key, value'),
        supabase.from('vessel_schedule_v').select('vessel_visit, vessel_name, voyage_number, last_free_day, shipping_line').eq('is_current', true).order('vessel_name'),
        supabase.from('shipping_line_charge_rules').select('shipping_line, service, trade, action, value').eq('active', true),
      ])
      setTermRates(((tr ?? []) as TermRate[]).map((x) => ({ ...x, rate: Number(x.rate) })))
      setXrayRate(Number((sr?.[0] as { rate?: number })?.rate ?? 0))
      const m = new Map(((ps ?? []) as { key: string; value: number }[]).map((x) => [x.key, Number(x.value)]))
      setSettings({
        vat: m.get('vat_rate') ?? 0.12, admin: m.get('admin_fee') ?? 0, print: m.get('print_fee') ?? 0,
        reefer: m.get('reefer_rate') ?? 0, reeferMin: m.get('reefer_min_hours') ?? 4, deposit: m.get('reefer_deposit') ?? 10000,
      })
      setVessels((v ?? []) as VesselOpt[])
      setRules(((cr ?? []) as Rule[]).map((x) => ({ ...x, value: Number(x.value) })))
    })()
  }, [])

  // Any change to the inputs invalidates a shown estimate (press Generate again).
  useEffect(() => { setGenerated(false) }, [line, vesselVisit, origin, trade, count20, count40, pickupDate, xrayVans, reeferVans, plugIn, plugOut])

  // Vessels for the chosen line (loose name match); all vessels when no line.
  const lineVessels = useMemo(
    () => (line ? vessels.filter((v) => normLine(v.shipping_line) === normLine(line)) : vessels),
    [vessels, line],
  )

  function chooseLine(code: string) {
    setLine(code)
    const o = SHIPPING_LINES.find((l) => l.code === code)?.origin
    if (o) setOrigin(o)
    setVesselVisit('') // re-pick a vessel under the new line
  }

  const rateOf = useMemo(() => {
    const map = new Map(termRates.map((r) => [`${r.service}|${r.trade}|${r.origin}|${r.size}`, r.rate]))
    return (service: string, size: Size) => map.get(`${service}|${trade}|${origin}|${size}`) ?? 0
  }, [termRates, trade, origin])

  const lfd = lineVessels.find((v) => v.vessel_visit === vesselVisit)?.last_free_day ?? null

  // Which basic terminal charges apply structurally (weighing is export-only).
  // Per-line rules (waive/discount/surcharge, 0080) are applied to the amounts
  // below — a waived charge shows as ₱0 with a "Waived" tag.
  const basicServices = useMemo(() => [
    { key: 'arrastre', label: 'Arrastre', show: true },
    { key: 'weighing', label: 'Weighing scale', show: trade === 'export' },
    { key: 'wharfage', label: 'Wharfage', show: true },
    { key: 'lolo', label: 'Lift on / Lift off (LoLo)', show: true },
  ].filter((s) => s.show), [trade])

  const calc = useMemo(() => {
    const sized = (service: string) => rateOf(service, '20') * count20 + rateOf(service, '40') * count40
    const counts = count20 + count40
    // Apply the chosen line's charge rules to a base amount.
    const applyRules = (service: string, base: number): { amount: number; tag: string } => {
      const rs = line
        ? rules.filter((r) => normLine(r.shipping_line) === normLine(line) && r.service === service && (r.trade == null || r.trade === trade))
        : []
      if (rs.length === 0) return { amount: base, tag: '' }
      if (rs.some((r) => r.action === 'waive')) return { amount: 0, tag: t('Waived') }
      let amt = base
      const tags: string[] = []
      for (const r of rs) {
        if (r.action === 'discount_pct') { amt = amt * (1 - r.value / 100); tags.push(`−${r.value}%`) }
        else if (r.action === 'discount_amt') { amt = Math.max(0, amt - r.value * counts); tags.push(`−${peso(r.value)}`) }
        else if (r.action === 'surcharge_amt') { amt = amt + r.value * counts; tags.push(`+${peso(r.value)}`) }
      }
      return { amount: amt, tag: tags.join(' ') }
    }
    const basic = basicServices.map((s) => {
      const r = applyRules(s.key, sized(s.key))
      return { key: s.key, label: s.label, amount: r.amount, tag: r.tag }
    })
    const basicTotal = basic.reduce((a, b) => a + b.amount, 0)

    // Storage days = calendar days from the Last Free Day to the planned pickup.
    let storageDays = 0
    if (lfd && pickupDate) {
      const ms = new Date(pickupDate).getTime() - new Date(lfd).getTime()
      storageDays = ms > 0 ? Math.round(ms / 86_400_000) : 0
    }
    const storageR = applyRules('storage', sized('storage') * storageDays)
    const storage = storageR.amount
    const storageTag = storageR.tag
    const xray = xrayRate * Math.max(0, xrayVans)

    // Electrical/reefer: per van per hour, plug-in → plug-out, with a minimum
    // billed-hours floor. A refundable cash bond applies per van.
    let reeferHours = 0
    if (plugIn && plugOut) {
      const ms = new Date(plugOut).getTime() - new Date(plugIn).getTime()
      const h = ms > 0 ? Math.ceil(ms / 3_600_000) : 0
      reeferHours = h > 0 ? Math.max(h, settings.reeferMin) : 0
    }
    const reefer = settings.reefer * Math.max(0, reeferVans) * reeferHours
    const deposit = Math.max(0, reeferVans) * settings.deposit

    const vatable = basicTotal + storage + xray + reefer
    const vat = vatable * settings.vat
    const charges = vatable + vat + settings.admin + settings.print
    return { basic, storage, storageTag, storageDays, xray, reefer, reeferHours, deposit, vatable, vat, charges, toPrepare: charges + deposit }
  }, [rateOf, basicServices, count20, count40, lfd, pickupDate, xrayRate, xrayVans, settings, reeferVans, plugIn, plugOut, rules, line, trade, t])

  const hasContainers = count20 > 0 || count40 > 0

  function generate() {
    if (!hasContainers) return
    setGenerated(true)
    // On a narrow screen the estimate is below the inputs — bring it into view.
    requestAnimationFrame(() => estimateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // ---- small UI helpers ----
  const StepHead = ({ n, title, sub }: { n: number; title: string; sub?: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span className="ktc-step-num">{n}</span>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 650 }}>{title}</h2>
        {sub && <p className="ktc-label" style={{ margin: '1px 0 0', fontSize: 12 }}>{sub}</p>}
      </div>
    </div>
  )
  const numInput = (val: number, set: (n: number) => void, label: string) => (
    <input className="ktc-input ktc-mono" type="number" min={0} step={1} inputMode="numeric"
      value={val || ''} placeholder="0" onChange={(e) => set(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
      style={{ width: 84, padding: '8px 10px', textAlign: 'center', fontSize: 15 }} aria-label={label} />
  )
  const seg = <T extends string>(value: T, set: (v: T) => void, opts: { v: T; label: string }[]) => (
    <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 999, border: '1px solid var(--glass-brd)', background: 'var(--c-w55)', flexWrap: 'wrap' }}>
      {opts.map((o) => (
        <button key={o.v} type="button" onClick={() => set(o.v)}
          style={{ border: 0, cursor: 'pointer', borderRadius: 999, padding: '5px 14px', fontSize: 12.5, fontWeight: 650,
            color: value === o.v ? '#fff' : 'hsl(var(--ink-2))', background: value === o.v ? 'linear-gradient(135deg, var(--acc), var(--acc-2))' : 'transparent' }}>
          {t(o.label)}
        </button>
      ))}
    </div>
  )
  const fieldRow = (labelEl: ReactNode, controlEl: ReactNode) => (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span className="ktc-label">{labelEl}</span>{controlEl}
    </label>
  )
  const Row = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
    <tr style={{ borderBottom: '1px solid hsl(var(--line-soft))' }}>
      <td style={{ padding: '7px 0' }}>{label}{hint ? <span className="ktc-label" style={{ fontSize: 12 }}> {hint}</span> : null}</td>
      <td className="ktc-mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{value}</td>
    </tr>
  )

  return (
    <Shell>
      <div style={{ margin: '14px 4px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em' }}>{t('Rate Calculator')}</h1>
        <p className="ktc-sub" style={{ maxWidth: 560 }}>
          {t('Build your estimate step by step, then tap Generate. This is a guide — the official amount is confirmed on the Service Invoice at the KTC office.')}
        </p>
      </div>

      <div className="ktc-calc-layout">
        {/* ---- Inputs: one compact card, sections divided by a hairline ---- */}
        <div className="ktc-glass" style={{ padding: 0 }} data-tour="calc-inputs">
          {/* 1 — Shipping line + vessel */}
          <div className="ktc-calc-section">
            <StepHead n={1} title={t('Shipping line & vessel')} sub={t('Sets your trade route and the Last Free Day for storage.')} />
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <span className="ktc-label">{t('Shipping line')}</span>
                <select className="ktc-input" value={line} onChange={(e) => chooseLine(e.target.value)}>
                  <option value="">{t('Select a shipping line…')}</option>
                  {SHIPPING_LINES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <span className="ktc-label">{t('Vessel & voyage')} <span style={{ opacity: 0.7 }}>({t('for storage / Last Free Day')})</span></span>
                <select className="ktc-input" value={vesselVisit} onChange={(e) => setVesselVisit(e.target.value)}>
                  <option value="">{line && lineVessels.length === 0 ? t('No current vessels for this line') : t('Select a vessel… (optional)')}</option>
                  {lineVessels.map((v) => <option key={v.vessel_visit} value={v.vessel_visit}>{v.vessel_name.toUpperCase()} — {v.voyage_number.toUpperCase()}</option>)}
                </select>
                {lfd && <span className="ktc-label" style={{ fontSize: 12 }}>{t('Last Free Day:')} <b>{new Date(lfd).toLocaleDateString()}</b> — {t('storage applies after this date.')}</span>}
              </div>
            </div>
          </div>

          {/* 2 — Trade route (derived) + 3 — Shipment type */}
          <div className="ktc-calc-section">
            <StepHead n={2} title={t('Trade route & shipment')} sub={t('The route is set by your shipping line; choose the shipment type.')} />
            <div style={{ display: 'grid', gap: 14 }}>
              {fieldRow(
                t('Trade route'),
                line
                  ? <span className="ktc-chip ktc-chip--accent" style={{ fontWeight: 650 }}>{origin === 'domestic' ? t('Domestic') : t('Foreign')}</span>
                  : seg(origin, setOrigin, [{ v: 'domestic', label: 'Domestic' }, { v: 'foreign', label: 'Foreign' }]),
              )}
              {fieldRow(
                t('Shipment'),
                seg(trade, setTrade, [{ v: 'import', label: 'Import (Withdrawal)' }, { v: 'export', label: 'Export (Deposit)' }]),
              )}
            </div>
          </div>

          {/* 4 — Container counts */}
          <div className="ktc-calc-section">
            <StepHead n={3} title={t('Containers')} sub={t('How many vans of each size?')} />
            <div style={{ display: 'grid', gap: 14 }}>
              {fieldRow(t('20ft containers'), numInput(count20, setCount20, t('20ft containers')))}
              {fieldRow(t('40ft containers'), numInput(count40, setCount40, t('40ft containers')))}
            </div>
          </div>

          {/* Ancillary services (optional) */}
          <div className="ktc-calc-section">
            <StepHead n={4} title={t('Ancillary services')} sub={t('Optional — added depending on your order.')} />
            <div style={{ display: 'grid', gap: 14 }}>
              {fieldRow(t('X-ray — number of vans'), numInput(xrayVans, setXrayVans, t('X-ray vans')))}
              {lfd && fieldRow(t('Planned pickup date (storage)'),
                <input className="ktc-input" type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} style={{ maxWidth: 180 }} />)}
              {!lfd && (
                <p className="ktc-label" style={{ fontSize: 12, opacity: 0.8, margin: 0 }}>{t('Pick a vessel above to estimate storage from the Last Free Day.')}</p>
              )}
              <div style={{ display: 'grid', gap: 8, paddingTop: 6, borderTop: '1px solid hsl(var(--line-soft))' }}>
                <span className="ktc-label" style={{ fontWeight: 600 }}>{t('Electrical / reefer')}</span>
                {fieldRow(t('Reefer vans'), numInput(reeferVans, setReeferVans, t('Reefer vans')))}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 8 }}>
                  <label style={{ display: 'grid', gap: 4 }}><span className="ktc-label" style={{ fontSize: 12 }}>{t('Plug-in')}</span>
                    <input className="ktc-input" type="datetime-local" value={plugIn} onChange={(e) => setPlugIn(e.target.value)} style={{ fontSize: 13, minWidth: 0 }} /></label>
                  <label style={{ display: 'grid', gap: 4 }}><span className="ktc-label" style={{ fontSize: 12 }}>{t('Plug-out (est.)')}</span>
                    <input className="ktc-input" type="datetime-local" value={plugOut} onChange={(e) => setPlugOut(e.target.value)} style={{ fontSize: 13, minWidth: 0 }} /></label>
                </div>
                {reeferVans > 0 && (
                  <p className="ktc-label" style={{ fontSize: 12, margin: '2px 0 0', lineHeight: 1.5 }}>
                    {t('Billed per hour (minimum {h} hours). A refundable cash bond of {amt} per van is required — the balance is returned 7–10 working days after withdrawal, once computed.', { h: settings.reeferMin, amt: peso(settings.deposit) })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ---- Estimate column ---- */}
        <div ref={estimateRef} className="ktc-glass" style={{ padding: 22, position: 'sticky', top: 86 }} data-tour="calc-estimate">
          <StepHead n={5} title={t('Estimate')} />
          <button type="button" className="ktc-btn" disabled={!hasContainers} onClick={generate}
            style={{ width: '100%', marginBottom: 14, opacity: hasContainers ? 1 : 0.55 }}>
            {t('Generate estimate')}
          </button>

          {!hasContainers ? (
            <p className="ktc-label" style={{ fontSize: 13 }}>{t('Enter your 20ft / 40ft container counts, then tap Generate estimate.')}</p>
          ) : !generated ? (
            <p className="ktc-label" style={{ fontSize: 13 }}>{t('Tap Generate estimate to see the charges.')}</p>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <tbody>
                  {calc.basic.map((b) => <Row key={b.key} label={t(b.label)} value={peso(b.amount)} hint={b.tag} />)}
                  {calc.storageDays > 0 && <Row label={t('Storage')} value={peso(calc.storage)} hint={`× ${calc.storageDays} ${t('day(s)')}${calc.storageTag ? ' ' + calc.storageTag : ''}`} />}
                  {calc.xray > 0 && <Row label={t('X-ray')} value={peso(calc.xray)} hint={`× ${xrayVans}`} />}
                  {calc.reefer > 0 && <Row label={t('Electrical / reefer')} value={peso(calc.reefer)} hint={`${reeferVans} × ${calc.reeferHours}h`} />}
                  <Row label={t('VAT ({pct}%)', { pct: (settings.vat * 100).toFixed(0) })} value={peso(calc.vat)} />
                  <Row label={t('Admin / service fee')} value={peso(settings.admin)} />
                  <Row label={t('Print fee')} value={peso(settings.print)} />
                  <tr>
                    <td style={{ padding: '11px 0', fontWeight: 700, fontSize: 15 }}>{t('Estimated charges')}</td>
                    <td className="ktc-mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 17, color: 'var(--acc-2)', whiteSpace: 'nowrap' }}>{peso(calc.charges)}</td>
                  </tr>
                </tbody>
              </table>

              {calc.deposit > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--glass-brd)', display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5 }}>
                    <span>{t('Refundable cash bond')} <span className="ktc-label" style={{ fontSize: 12 }}>({reeferVans} × {peso(settings.deposit)})</span></span>
                    <span className="ktc-mono" style={{ whiteSpace: 'nowrap' }}>{peso(calc.deposit)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 700, fontSize: 14.5 }}>
                    <span>{t('Total to prepare')}</span>
                    <span className="ktc-mono" style={{ whiteSpace: 'nowrap' }}>{peso(calc.toPrepare)}</span>
                  </div>
                  <p className="ktc-label" style={{ fontSize: 11.5, margin: 0 }}>{t('The cash bond is refundable — balance returned 7–10 working days after withdrawal.')}</p>
                </div>
              )}

              {calc.vatable === 0 && (
                <p className="ktc-label" style={{ fontSize: 12, marginTop: 10, color: 'var(--c-h30-70-36)' }}>
                  {t('Rates aren’t configured yet — ask KTC, or check Settings if you’re staff.')}
                </p>
              )}
              <p className="ktc-label" style={{ fontSize: 11.5, marginTop: 12 }}>
                {t('Other services (RPS, equipment rental, stripping) are quoted per request — ask KTC.')}
              </p>
            </>
          )}
        </div>
      </div>
    </Shell>
  )
}
