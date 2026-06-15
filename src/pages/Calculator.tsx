import { useEffect, useMemo, useState } from 'react'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { peso } from '../lib/pricing'
import { usePageTour } from '../components/TourProvider'
import { calculatorSteps } from '../components/WelcomeTour'
import { useT } from '../lib/i18n'

// Rate calculator — estimate before filing. Basic terminal charges (arrastre /
// LoLo / storage) come from the admin tariff (terminal_rates, 0073), keyed by
// trade × origin × size; plus an ancillary section (X-ray, reefer/electrical).
// All rates are set by KTC in Settings; this is a guide, the official amount is
// on the Service Invoice.

type TermRate = { service: string; trade: string; origin: string; size: string; rate: number }
type VesselOpt = { vessel_visit: string; vessel_name: string; voyage_number: string; last_free_day: string | null }
type Size = '20' | '40'

export default function Calculator() {
  const { t } = useT()
  usePageTour('calculator', calculatorSteps)

  const [termRates, setTermRates] = useState<TermRate[]>([])
  const [xrayRate, setXrayRate] = useState(0)
  const [settings, setSettings] = useState<{ vat: number; admin: number; print: number; reefer: number }>({ vat: 0.12, admin: 0, print: 0, reefer: 0 })
  const [vessels, setVessels] = useState<VesselOpt[]>([])

  // Inputs
  const [trade, setTrade] = useState<'import' | 'export'>('import')
  const [origin, setOrigin] = useState<'domestic' | 'foreign'>('foreign')
  const [count20, setCount20] = useState(0)
  const [count40, setCount40] = useState(0)
  const [vesselVisit, setVesselVisit] = useState('')
  const [storageDays, setStorageDays] = useState(0)
  const [xrayVans, setXrayVans] = useState(0)
  const [reeferVans, setReeferVans] = useState(0)
  const [plugIn, setPlugIn] = useState('')
  const [plugOut, setPlugOut] = useState('')

  useEffect(() => {
    void (async () => {
      const [{ data: tr }, { data: sr }, { data: ps }, { data: v }] = await Promise.all([
        supabase.from('terminal_rates').select('service, trade, origin, size, rate'),
        supabase.from('service_rates').select('service, rate').ilike('service', '%x-ray%').limit(1),
        supabase.from('pricing_settings').select('key, value'),
        supabase.from('vessel_schedule_v').select('vessel_visit, vessel_name, voyage_number, last_free_day').eq('is_current', true).order('vessel_name'),
      ])
      setTermRates(((tr ?? []) as TermRate[]).map((x) => ({ ...x, rate: Number(x.rate) })))
      setXrayRate(Number((sr?.[0] as { rate?: number })?.rate ?? 0))
      const m = new Map(((ps ?? []) as { key: string; value: number }[]).map((x) => [x.key, Number(x.value)]))
      setSettings({ vat: m.get('vat_rate') ?? 0.12, admin: m.get('admin_fee') ?? 0, print: m.get('print_fee') ?? 0, reefer: m.get('reefer_rate') ?? 0 })
      setVessels((v ?? []) as VesselOpt[])
    })()
  }, [])

  const rateOf = useMemo(() => {
    const map = new Map(termRates.map((r) => [`${r.service}|${r.trade}|${r.origin}|${r.size}`, r.rate]))
    return (service: string, size: Size) => map.get(`${service}|${trade}|${origin}|${size}`) ?? 0
  }, [termRates, trade, origin])

  const lfd = vessels.find((v) => v.vessel_visit === vesselVisit)?.last_free_day ?? null

  const calc = useMemo(() => {
    const sized = (service: string) => rateOf(service, '20') * count20 + rateOf(service, '40') * count40
    const arrastre = sized('arrastre')
    const lolo = sized('lolo')
    const storage = sized('storage') * Math.max(0, storageDays)
    const xray = xrayRate * Math.max(0, xrayVans)
    // Reefer: per van per hour, plug-in → plug-out (rounded up to whole hours).
    let reeferHours = 0
    if (plugIn && plugOut) {
      const ms = new Date(plugOut).getTime() - new Date(plugIn).getTime()
      reeferHours = ms > 0 ? Math.ceil(ms / 3_600_000) : 0
    }
    const reefer = settings.reefer * Math.max(0, reeferVans) * reeferHours
    const vatable = arrastre + lolo + storage + xray + reefer
    const vat = vatable * settings.vat
    const total = vatable + vat + settings.admin + settings.print
    return { arrastre, lolo, storage, xray, reefer, reeferHours, vatable, vat, total }
  }, [rateOf, count20, count40, storageDays, xrayRate, xrayVans, settings, reeferVans, plugIn, plugOut])

  const anyInput = count20 > 0 || count40 > 0 || xrayVans > 0 || reeferVans > 0

  const numInput = (val: number, set: (n: number) => void, label: string) => (
    <input className="ktc-input ktc-mono" type="number" min={0} step={1} inputMode="numeric"
      value={val || ''} placeholder="0" onChange={(e) => set(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
      style={{ width: 84, padding: '8px 10px', textAlign: 'center', fontSize: 15 }} aria-label={label} />
  )
  const seg = <T extends string>(value: T, set: (v: T) => void, opts: { v: T; label: string }[]) => (
    <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 999, border: '1px solid var(--glass-brd)', background: 'var(--c-w55)' }}>
      {opts.map((o) => (
        <button key={o.v} type="button" onClick={() => set(o.v)}
          style={{ border: 0, cursor: 'pointer', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 650,
            color: value === o.v ? '#fff' : 'hsl(var(--ink-2))', background: value === o.v ? 'linear-gradient(135deg, var(--acc), var(--acc-2))' : 'transparent' }}>
          {t(o.label)}
        </button>
      ))}
    </div>
  )
  const Row = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
    <tr style={{ borderBottom: '1px solid hsl(var(--line-soft))' }}>
      <td style={{ padding: '7px 0' }}>{label}{hint ? <span className="ktc-label" style={{ fontSize: 12 }}> {hint}</span> : null}</td>
      <td className="ktc-mono" style={{ textAlign: 'right' }}>{value}</td>
    </tr>
  )

  return (
    <Shell>
      <div style={{ margin: '14px 4px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em' }}>{t('Rate Calculator')}</h1>
        <p className="ktc-sub" style={{ maxWidth: 540 }}>
          {t('Estimate your charges before filing. This is a guide — the official amount is confirmed on the Service Invoice at the KTC office.')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Basic terminal charges */}
          <div className="ktc-glass" style={{ padding: 24 }} data-tour="calc-inputs">
            <h2 style={{ margin: '0 0 14px', fontSize: 15.5, fontWeight: 650 }}>{t('Terminal charges')}</h2>
            <div style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span className="ktc-label">{t('Shipment')}</span>{seg(trade, setTrade, [{ v: 'import', label: 'Import' }, { v: 'export', label: 'Export' }])}
              </label>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span className="ktc-label">{t('Origin')}</span>{seg(origin, setOrigin, [{ v: 'domestic', label: 'Domestic' }, { v: 'foreign', label: 'Foreign' }])}
              </label>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span className="ktc-label">{t('20ft containers')}</span>{numInput(count20, setCount20, t('20ft containers'))}
              </label>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span className="ktc-label">{t('40ft containers')}</span>{numInput(count40, setCount40, t('40ft containers'))}
              </label>
              <div style={{ display: 'grid', gap: 6 }}>
                <span className="ktc-label">{t('Vessel & Voyage')} <span style={{ opacity: 0.7 }}>({t('for storage / Last Free Day')})</span></span>
                <select className="ktc-input" value={vesselVisit} onChange={(e) => setVesselVisit(e.target.value)}>
                  <option value="">{t('Select a vessel… (optional)')}</option>
                  {vessels.map((v) => <option key={v.vessel_visit} value={v.vessel_visit}>{v.vessel_name.toUpperCase()} — {v.voyage_number.toUpperCase()}</option>)}
                </select>
                {lfd && <span className="ktc-label" style={{ fontSize: 12 }}>{t('Last Free Day:')} <b>{new Date(lfd).toLocaleDateString()}</b> — {t('storage applies after this date.')}</span>}
              </div>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span className="ktc-label">{t('Storage days (beyond free)')}</span>{numInput(storageDays, setStorageDays, t('Storage days'))}
              </label>
            </div>
          </div>

          {/* Ancillary services */}
          <div className="ktc-glass" style={{ padding: 24 }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 15.5, fontWeight: 650 }}>{t('Ancillary services')}</h2>
            <div style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span className="ktc-label">{t('X-ray — number of vans')}</span>{numInput(xrayVans, setXrayVans, t('X-ray vans'))}
              </label>
              <div style={{ display: 'grid', gap: 8, paddingTop: 6, borderTop: '1px solid hsl(var(--line-soft))' }}>
                <span className="ktc-label" style={{ fontWeight: 600 }}>{t('Electrical / reefer')}</span>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span className="ktc-label">{t('Reefer vans')}</span>{numInput(reeferVans, setReeferVans, t('Reefer vans'))}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label style={{ display: 'grid', gap: 4 }}><span className="ktc-label" style={{ fontSize: 12 }}>{t('Plug-in')}</span>
                    <input className="ktc-input" type="datetime-local" value={plugIn} onChange={(e) => setPlugIn(e.target.value)} style={{ fontSize: 13 }} /></label>
                  <label style={{ display: 'grid', gap: 4 }}><span className="ktc-label" style={{ fontSize: 12 }}>{t('Plug-out (est.)')}</span>
                    <input className="ktc-input" type="datetime-local" value={plugOut} onChange={(e) => setPlugOut(e.target.value)} style={{ fontSize: 13 }} /></label>
                </div>
                {calc.reeferHours > 0 && <span className="ktc-label" style={{ fontSize: 12 }}>{t('Estimated {h} hour(s) of power.', { h: calc.reeferHours })}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Estimate */}
        <div className="ktc-glass" style={{ padding: 24, position: 'sticky', top: 86 }} data-tour="calc-estimate">
          <h2 style={{ margin: '0 0 12px', fontSize: 15.5, fontWeight: 650 }}>{t('Estimate')}</h2>
          {!anyInput ? (
            <p className="ktc-label" style={{ fontSize: 13.5 }}>{t('Enter container counts to see the breakdown.')}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <tbody>
                <Row label={t('Arrastre')} value={peso(calc.arrastre)} />
                <Row label={t('LoLo')} value={peso(calc.lolo)} />
                <Row label={t('Storage')} value={peso(calc.storage)} hint={storageDays > 0 ? `× ${storageDays} ${t('day(s)')}` : ''} />
                {calc.xray > 0 && <Row label={t('X-ray')} value={peso(calc.xray)} hint={`× ${xrayVans}`} />}
                {calc.reefer > 0 && <Row label={t('Reefer / electrical')} value={peso(calc.reefer)} hint={`${reeferVans} × ${calc.reeferHours}h`} />}
                <Row label={t('VAT ({pct}%)', { pct: (settings.vat * 100).toFixed(0) })} value={peso(calc.vat)} />
                <Row label={t('Admin / service fee')} value={peso(settings.admin)} />
                <Row label={t('Print fee')} value={peso(settings.print)} />
                <tr>
                  <td style={{ padding: '11px 0', fontWeight: 700, fontSize: 15 }}>{t('Estimated total')}</td>
                  <td className="ktc-mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 17, color: 'var(--acc-2)' }}>{peso(calc.total)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {anyInput && calc.vatable === 0 && (
            <p className="ktc-label" style={{ fontSize: 12, marginTop: 10, color: 'var(--c-h30-70-36)' }}>
              {t('Rates aren’t configured yet — ask KTC, or check Settings if you’re staff.')}
            </p>
          )}
        </div>
      </div>
    </Shell>
  )
}
