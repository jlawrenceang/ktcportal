import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Shell from '../components/Shell'
import AdminShell from '../admin/AdminShell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { hasAdminAccess } from '../lib/types'
import { peso } from '../lib/pricing'
import { usePageTour } from '../components/TourProvider'
import { calculatorSteps } from '../components/WelcomeTour'
import { useT } from '../lib/i18n'
import { SHIPPING_LINES, normLine, tradeLabel, tradeAction, type Origin, type Trade } from '../lib/shippingLines'
import OriginPill from '../components/OriginPill'
import Modal from '../components/Modal'

// Rate calculator — a guided estimate. Flow (redesigned 2026-06-22):
//   1. Shipment details — shipping line, vessel & voyage, trade route (derived),
//      import/export, and (optional) planned pickup date for storage.
//   2. Containers — one row per container type: size × empty/full × dry/reefer × qty.
//   3. Ancillary services — add from a dropdown (X-ray, DEA, electrical/reefer…).
//   4. Generate → charges.
// Terminal charges come from the admin tariff (terminal_rates) keyed by
// service × trade × origin × size × fill × kind (0141); ancillary from
// service_rates / pricing_settings. rate = null → "not configured" (≠ ₱0).

type TermRate = { service: string; trade: string; origin: string; size: string; fill: string; kind: string; rate: number | null }
type VesselOpt = { vessel_visit: string; vessel_name: string; voyage_number: string; last_free_day: string | null; shipping_line: string | null }
type Size = '20' | '40'
type Fill = 'empty' | 'full'
type Kind = 'dry' | 'reefer'
type Cell = { size: Size; fill: Fill; kind: Kind; qty: number }
type Rule = { shipping_line: string; service: string; trade: string | null; action: string; value: number }
type Svc = { service: string; rate: number | null; unit: string; vatable: boolean }
type StorageTier = { trade: string; size: string; day_from: number; day_to: number | null; rate: number | null }
type TariffImage = { name: string; url: string }

const REEFER_KEY = '__reefer__'
const emptyCell = (): Cell => ({ size: '20', fill: 'full', kind: 'dry', qty: 1 })

// Print / Save: reuse the A6 job-slip print approach (JobOrderPrint.tsx) — a
// print-only slip that's hidden on screen and the only thing visible when the
// browser prints, so "Print / Save as PDF" captures a clean estimate.
const PRINT_LINE = '#2b4a6b'
const PRINT_HEADFILL = '#eef2f7'
const CALC_PRINT_CSS = `
.ktc-estimate-print { display: none; }
@media print {
  html, body { height: auto !important; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body * { visibility: hidden !important; }
  /* Collapse the on-screen layout so only the slip occupies the printed page. */
  .ktc-calc-layout { display: none !important; }
  .ktc-estimate-print, .ktc-estimate-print * { visibility: visible !important; }
  .ktc-estimate-print { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
  @page { size: A5 portrait; margin: 10mm; }
}
`
function SlipInfo({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: '2px 0', color: '#5a6678', width: '34%', verticalAlign: 'top' }}>{label}</td>
      <td style={{ padding: '2px 0', fontWeight: 600 }}>{value}</td>
    </tr>
  )
}
function SlipCharge({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: '4px 8px', borderTop: '1px solid #e2e8f0' }}>{label}</td>
      <td className="ktc-mono" style={{ padding: '4px 8px', textAlign: 'right', borderTop: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{value}</td>
    </tr>
  )
}

function printEstimate() {
  window.print()
}

export default function Calculator() {
  const { t } = useT()
  usePageTour('calculator', calculatorSteps)
  const { broker, loading: brokerLoading } = useBroker()
  const Wrap = hasAdminAccess(broker) ? AdminShell : Shell

  const [termRates, setTermRates] = useState<TermRate[]>([])
  const [services, setServices] = useState<Svc[]>([])
  const [settings, setSettings] = useState<{ vat: number; admin: number | null; reefer: number | null; reeferMin: number; deposit: number }>(
    { vat: 0.12, admin: null, reefer: null, reeferMin: 4, deposit: 10000 })
  const [vessels, setVessels] = useState<VesselOpt[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [storageTiers, setStorageTiers] = useState<StorageTier[]>([])
  const [tariffOpen, setTariffOpen] = useState(false)
  const [tariffLoading, setTariffLoading] = useState(false)
  const [tariffError, setTariffError] = useState<string | null>(null)
  const [tariffImages, setTariffImages] = useState<TariffImage[]>([])

  // Inputs
  const [line, setLine] = useState('')
  const [vesselVisit, setVesselVisit] = useState('')
  const [origin, setOrigin] = useState<Origin>('foreign')
  const [trade, setTrade] = useState<Trade>('import')
  const [pickupDate, setPickupDate] = useState('')
  const [cells, setCells] = useState<Cell[]>([emptyCell()])
  const [addedSvcs, setAddedSvcs] = useState<string[]>([])
  const [svcCounts, setSvcCounts] = useState<Record<string, number>>({})
  const [reeferVans, setReeferVans] = useState(0)
  const [plugIn, setPlugIn] = useState('')
  const [plugOut, setPlugOut] = useState('')
  const [generated, setGenerated] = useState(false)
  const estimateRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => {
      const [{ data: tr }, { data: sr }, { data: ps }, { data: v }, { data: cr }, { data: st }] = await Promise.all([
        supabase.from('terminal_rates').select('service, trade, origin, size, fill, kind, rate'),
        supabase.from('service_rates').select('service, rate, unit, vatable').eq('active', true).order('sort_order').order('service'),
        supabase.from('pricing_settings').select('key, value'),
        supabase.from('vessel_schedule_v').select('vessel_visit, vessel_name, voyage_number, last_free_day, shipping_line').eq('is_current', true).order('vessel_name'),
        supabase.from('shipping_line_charge_rules').select('shipping_line, service, trade, action, value').eq('active', true),
        supabase.from('storage_tiers').select('trade, size, day_from, day_to, rate'),
      ])
      setTermRates(((tr ?? []) as TermRate[]).map((x) => ({ ...x, rate: x.rate == null ? null : Number(x.rate) })))
      setServices(((sr ?? []) as { service: string; rate: number | string | null; unit: string; vatable: boolean }[])
        .map((x) => ({ service: x.service, rate: x.rate == null ? null : Number(x.rate), unit: x.unit, vatable: x.vatable })))
      const m = new Map(((ps ?? []) as { key: string; value: number | null }[]).map((x) => [x.key, x.value == null ? null : Number(x.value)]))
      setSettings({
        vat: m.get('vat_rate') ?? 0.12, admin: m.get('admin_fee') ?? null,
        reefer: m.get('reefer_rate') ?? null, reeferMin: m.get('reefer_min_hours') ?? 4, deposit: m.get('reefer_deposit') ?? 10000,
      })
      setVessels((v ?? []) as VesselOpt[])
      setRules(((cr ?? []) as Rule[]).map((x) => ({ ...x, value: Number(x.value) })))
      setStorageTiers(((st ?? []) as StorageTier[]).map((x) => ({ ...x, rate: x.rate == null ? null : Number(x.rate) })))
    })()
  }, [])

  useEffect(() => { setGenerated(false) }, [line, vesselVisit, origin, trade, pickupDate, cells, addedSvcs, svcCounts, reeferVans, plugIn, plugOut])
  useEffect(() => {
    if (trade === 'transhipment') setTrade('import')
  }, [trade])

  const lineVessels = useMemo(
    () => (line ? vessels.filter((v) => normLine(v.shipping_line) === normLine(line)) : vessels),
    [vessels, line],
  )

  function chooseLine(code: string) {
    setLine(code)
    const o = SHIPPING_LINES.find((l) => l.code === code)?.origin
    if (o) { setOrigin(o); if (o === 'domestic' && trade === 'transhipment') setTrade('import') }
    setVesselVisit('')
  }

  const rateOf = useMemo(() => {
    const map = new Map(termRates.map((r) => [`${r.service}|${r.trade}|${r.origin}|${r.size}|${r.fill}|${r.kind}`, r.rate]))
    return (service: string, size: string, fill: string, kind: string): number | null =>
      map.get(`${service}|${trade}|${origin}|${size}|${fill}|${kind}`) ?? null
  }, [termRates, trade, origin])

  const lfd = lineVessels.find((v) => v.vessel_visit === vesselVisit)?.last_free_day ?? null

  const basicServices = useMemo(() => [
    { key: 'arrastre', label: 'Arrastre', show: true },
    { key: 'weighing', label: 'Weighing scale', show: trade === 'export' },
    { key: 'wharfage', label: 'Wharfage', show: true },
    { key: 'lolo', label: 'Lift on / Lift off (LoLo)', show: true },
  ].filter((s) => s.show), [trade])

  const totalQty = useMemo(() => cells.reduce((a, c) => a + Math.max(0, c.qty), 0), [cells])

  const calc = useMemo(() => {
    // Sum a service across every container row. If any row with a qty has no
    // configured rate for its exact size×fill×kind, the line can't be priced.
    const sized = (service: string): number | null => {
      let sum = 0, anyNull = false
      for (const c of cells) {
        if (c.qty <= 0) continue
        const r = rateOf(service, c.size, c.fill, c.kind)
        if (r == null) { anyNull = true; continue }
        sum += r * c.qty
      }
      return anyNull ? null : sum
    }
    const counts = totalQty
    const applyRules = (service: string, base: number | null): { amount: number | null; tag: string } => {
      if (base == null) return { amount: null, tag: '' }
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
    const basicTotal = basic.reduce((a, b) => a + (b.amount ?? 0), 0)

    let storageDays = 0
    if (lfd && pickupDate) {
      const ms = new Date(pickupDate).getTime() - new Date(lfd).getTime()
      storageDays = ms > 0 ? Math.round(ms / 86_400_000) : 0
    }
    // FOREIGN storage is a progressive tiered per-day tariff: the chargeable days
    // (past the line's last-free-day) walk through the bands in sequence (each
    // band's width = its day range), escalating — cumulative. DOMESTIC storage is
    // a flat per-day rate by size. Empty containers use the same (laden) rates.
    let storageBase: number | null
    if (origin === 'foreign') {
      const tieredPerContainer = (size: string): number | null => {
        const bands = storageTiers.filter((b) => b.trade === trade && b.size === size).sort((a, b) => a.day_from - b.day_from)
        if (!bands.length) return null
        let remaining = storageDays, total = 0
        for (const b of bands) {
          if (remaining <= 0) break
          const width = b.day_to == null ? Infinity : b.day_to - b.day_from + 1
          const d = Math.min(remaining, width)
          if (b.rate == null) return null // band rate not configured
          total += b.rate * d
          remaining -= d
        }
        return total
      }
      if (storageDays <= 0) storageBase = 0
      else {
        let sum = 0, anyNull = false
        for (const c of cells) {
          if (c.qty <= 0) continue
          const per = tieredPerContainer(c.size)
          if (per == null) { anyNull = true; continue }
          sum += per * c.qty
        }
        storageBase = anyNull ? null : sum
      }
    } else {
      const sizedStorage = sized('storage')
      storageBase = sizedStorage == null ? null : sizedStorage * storageDays
    }
    const storageR = applyRules('storage', storageBase)
    const storage = storageR.amount
    const storageTag = storageR.tag

    // Ancillary = the services the customer ADDED from the dropdown (reefer handled below).
    const ancillary = addedSvcs
      .filter((k) => k !== REEFER_KEY)
      .map((k) => {
        const s = services.find((x) => x.service === k)
        const count = Math.max(0, svcCounts[k] || 0)
        return { service: k, vatable: s?.vatable ?? true, count, amount: s?.rate == null ? null : s.rate * count }
      })
    const ancillaryVatable = ancillary.filter((a) => a.vatable).reduce((sum, a) => sum + (a.amount ?? 0), 0)
    const ancillaryFlat = ancillary.filter((a) => !a.vatable).reduce((sum, a) => sum + (a.amount ?? 0), 0)

    const reeferOn = addedSvcs.includes(REEFER_KEY)
    let reeferHours = 0
    if (reeferOn && plugIn && plugOut) {
      const ms = new Date(plugOut).getTime() - new Date(plugIn).getTime()
      const h = ms > 0 ? Math.ceil(ms / 3_600_000) : 0
      reeferHours = h > 0 ? Math.max(h, settings.reeferMin) : 0
    }
    const reefer = !reeferOn ? 0 : settings.reefer == null ? null : settings.reefer * Math.max(0, reeferVans) * reeferHours
    const deposit = reeferOn ? Math.max(0, reeferVans) * settings.deposit : 0

    const hasUnconfigured =
      basic.some((b) => b.amount == null) ||
      (storageDays > 0 && storage == null) ||
      ancillary.some((a) => a.amount == null) ||
      (reeferOn && reeferVans > 0 && reeferHours > 0 && reefer == null)

    const vatable = basicTotal + (storage ?? 0) + (reefer ?? 0) + ancillaryVatable
    const vat = vatable * settings.vat
    const charges = vatable + vat + (settings.admin ?? 0) + ancillaryFlat
    return { basic, storage, storageTag, storageDays, ancillary, reeferOn, reefer, reeferHours, deposit, vatable, vat, charges, toPrepare: charges + deposit, hasUnconfigured }
  }, [rateOf, basicServices, cells, totalQty, lfd, pickupDate, services, addedSvcs, svcCounts, settings, reeferVans, plugIn, plugOut, rules, line, trade, origin, storageTiers, t])

  const hasVessel = !!vesselVisit
  // Only STORAGE needs a vessel (it counts from the vessel's Last Free Day); terminal
  // + service charges don't. So gate Generate on quantity alone — a missing vessel just
  // means "no storage estimate", not a full lockout (T2-31).
  const canGenerate = totalQty > 0

  // Display values for the printable estimate slip.
  const selVessel = lineVessels.find((v) => v.vessel_visit === vesselVisit) ?? null
  const lineLabel = SHIPPING_LINES.find((l) => l.code === line)?.label ?? line
  const vesselText = selVessel ? `${selVessel.vessel_name.toUpperCase()} — ${selVessel.voyage_number.toUpperCase()}` : '—'
  const containerSummary = cells.filter((c) => c.qty > 0)
    .map((c) => `${c.qty}× ${c.size}ft ${t(c.fill === 'full' ? 'Full' : 'Empty')} ${t(c.kind === 'reefer' ? 'Reefer' : 'Dry')}`)

  function generate() {
    if (!canGenerate) return
    setGenerated(true)
    requestAnimationFrame(() => estimateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function openTariff() {
    setTariffOpen(true)
    setTariffLoading(true)
    setTariffError(null)
    const { data, error } = await supabase.storage.from('tariff-images').list('', {
      limit: 5,
      sortBy: { column: 'created_at', order: 'desc' },
    })
    if (error) { setTariffImages([]); setTariffError(error.message); setTariffLoading(false); return }
    const files = ((data ?? []) as { name: string }[]).filter((f) => !f.name.startsWith('.')).slice(0, 5)
    const signed: TariffImage[] = []
    for (const file of files) {
      const { data: sig, error: signErr } = await supabase.storage.from('tariff-images').createSignedUrl(file.name, 300)
      if (signErr || !sig?.signedUrl) { setTariffError(signErr?.message ?? t('Could not open one of the tariff images.')); continue }
      signed.push({ name: file.name, url: sig.signedUrl })
    }
    setTariffImages(signed)
    setTariffLoading(false)
  }

  // ---- cell + ancillary editing ----
  function setCell(i: number, patch: Partial<Cell>) { setCells((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c))) }
  function addCell() { setCells((cs) => [...cs, { size: '20', fill: 'full', kind: 'dry', qty: 1 }]) }
  function removeCell(i: number) { setCells((cs) => (cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs)) }

  const [pickSvc, setPickSvc] = useState('')
  const availableSvcs = useMemo(() => {
    const opts = services.map((s) => ({ key: s.service, label: s.service })).filter((o) => !addedSvcs.includes(o.key))
    if (settings.reefer != null && !addedSvcs.includes(REEFER_KEY)) opts.push({ key: REEFER_KEY, label: t('Electrical / reefer') })
    return opts
  }, [services, addedSvcs, settings.reefer, t])
  function addSvc() {
    if (!pickSvc) return
    setAddedSvcs((a) => [...a, pickSvc])
    setPickSvc('')
  }
  function removeSvc(k: string) {
    setAddedSvcs((a) => a.filter((x) => x !== k))
    if (k === REEFER_KEY) { setReeferVans(0); setPlugIn(''); setPlugOut('') }
  }

  // ---- small UI helpers ----
  const StepHead = ({ n, title, sub }: { n: number; title: string; sub?: string }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
      <span className="ktc-step-num">{n}</span>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 650, lineHeight: 1.3 }}>{title}</h2>
        {sub && <p className="ktc-label" style={{ margin: '2px 0 0', fontSize: 11.5, lineHeight: 1.4 }}>{sub}</p>}
      </div>
    </div>
  )
  const numInput = (val: number, set: (n: number) => void, label: string) => (
    <input className="ktc-input ktc-mono" type="number" min={0} step={1} inputMode="numeric"
      value={val || ''} placeholder="0" onChange={(e) => set(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
      style={{ width: 70, padding: '6px 8px', textAlign: 'center', fontSize: 14 }} aria-label={label} />
  )
  const seg = <T extends string>(value: T, set: (v: T) => void, opts: { v: T; label: string }[]) => (
    <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 999, border: '1px solid var(--glass-brd)', background: 'var(--c-w55)', flexWrap: 'wrap' }}>
      {opts.map((o) => (
        <button key={o.v} type="button" onClick={() => set(o.v)}
          style={{ border: 0, cursor: 'pointer', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 650,
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
      <td style={{ padding: '5px 0' }}>{label}{hint ? <span className="ktc-label" style={{ fontSize: 11 }}> {hint}</span> : null}</td>
      <td className="ktc-mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{value}</td>
    </tr>
  )

  if (brokerLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="ktc-label">{t('Loading…')}</span>
      </div>
    )
  }

  return (
    <Wrap>
      <div style={{ margin: '10px 4px 14px' }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{t('Rate Calculator')}</h1>
        <p className="ktc-sub" style={{ maxWidth: 560, fontSize: 12.5 }}>
          {t('Build your estimate, then tap Generate. This is a guide — the official amount is confirmed on the Service Invoice at the KTC office.')}
        </p>
        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void openTariff()} style={{ marginTop: 10 }}>
          {t('View Published Tariff')}
        </button>
      </div>

      <div
        className="ktc-calc-layout"
        onContextMenu={(e) => e.preventDefault()}
        onCopy={(e) => e.preventDefault()}
      >
        <div className="ktc-confidential-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, gridColumn: '1 / -1', marginBottom: -2 }}>
          {t('Confidential — rate details are for viewing only. Export only the final estimate when needed.')}
        </div>
        <div className="ktc-glass" style={{ padding: 0 }} data-tour="calc-inputs">
          {/* 1 — Shipment details (line + vessel + route + shipment + pickup) */}
          <div className="ktc-calc-section">
            <StepHead n={1} title={t('Shipment details')} sub={t('Sets your trade route, charges and the storage Last Free Day.')} />
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 5 }}>
                <span className="ktc-label">{t('Shipping line')} *</span>
                <select className="ktc-input ktc-input--compact" value={line} onChange={(e) => chooseLine(e.target.value)}>
                  <option value="">{t('Select a shipping line…')}</option>
                  {SHIPPING_LINES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gap: 5 }}>
                <span className="ktc-label">{t('Vessel & voyage')} *</span>
                <select className="ktc-input ktc-input--compact" value={vesselVisit} onChange={(e) => setVesselVisit(e.target.value)}>
                  <option value="">{line && lineVessels.length === 0 ? t('No current vessels for this line') : t('Select a vessel & voyage…')}</option>
                  {lineVessels.map((v) => <option key={v.vessel_visit} value={v.vessel_visit}>{v.vessel_name.toUpperCase()} — {v.voyage_number.toUpperCase()}</option>)}
                </select>
              </div>
              {fieldRow(
                <>{t('Trade route')} *</>,
                line
                  ? <OriginPill origin={origin} />
                  : <span className="ktc-label" style={{ fontSize: 12 }}>{t('Pick a shipping line')}</span>,
              )}
              {fieldRow(
                <>{t('Shipment')} *</>,
                seg(trade, setTrade, [
                  { v: 'import' as Trade, label: `${tradeLabel('import', origin)} (${tradeAction('import')})` },
                  { v: 'export' as Trade, label: `${tradeLabel('export', origin)} (${tradeAction('export')})` },
                ]),
              )}
              {fieldRow(
                t('Planned pickup date'),
                <input className="ktc-input" type="date" value={pickupDate} disabled={!lfd}
                  onChange={(e) => setPickupDate(e.target.value)} style={{ maxWidth: 180 }} />,
              )}
              <span className="ktc-label" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
                {lfd
                  ? t('Last Free Day: {d} — storage is estimated from this date to your pickup.', { d: new Date(lfd).toLocaleDateString() })
                  : t('Pick a vessel to enable storage (counts from its Last Free Day).')}
              </span>
            </div>
          </div>

          {/* 2 — Containers (per type: size × fill × kind × qty) */}
          <div className="ktc-calc-section">
            <StepHead n={2} title={t('Containers')} sub={t('Add a row per container type — rates differ by size, empty/full and dry/reefer.')} />
            <div style={{ display: 'grid', gap: 8 }}>
              {cells.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select className="ktc-input ktc-input--compact" style={{ flex: '1 1 74px' }} value={c.size} onChange={(e) => setCell(i, { size: e.target.value as Size })}>
                    <option value="20">20ft</option><option value="40">40ft</option>
                  </select>
                  <select className="ktc-input ktc-input--compact" style={{ flex: '1 1 86px' }} value={c.fill} onChange={(e) => setCell(i, { fill: e.target.value as Fill })}>
                    <option value="full">{t('Full')}</option><option value="empty">{t('Empty')}</option>
                  </select>
                  <select className="ktc-input ktc-input--compact" style={{ flex: '1 1 90px' }} value={c.kind} onChange={(e) => setCell(i, { kind: e.target.value as Kind })}>
                    <option value="dry">{t('Dry')}</option><option value="reefer">{t('Reefer')}</option>
                  </select>
                  {numInput(c.qty, (n) => setCell(i, { qty: n }), t('Quantity'))}
                  <button type="button" className="ktc-link" onClick={() => removeCell(i)} style={{ opacity: cells.length === 1 ? 0.3 : 1 }} aria-label={t('Remove row')}>✕</button>
                </div>
              ))}
              <button type="button" className="ktc-link" onClick={addCell} style={{ justifySelf: 'start' }}>{t('+ Add container type')}</button>
            </div>
          </div>

          {/* 3 — Ancillary services (add from dropdown) */}
          <div className="ktc-calc-section">
            <StepHead n={3} title={t('Ancillary services')} sub={t('Optional — add the ones your order needs.')} />
            <div style={{ display: 'grid', gap: 10 }}>
              {addedSvcs.length === 0 && <p className="ktc-label" style={{ fontSize: 12, opacity: 0.8, margin: 0 }}>{t('None added.')}</p>}
              {addedSvcs.map((k) => {
                if (k === REEFER_KEY) {
                  return (
                    <div key={k} style={{ display: 'grid', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t('Electrical / reefer')}</span>
                        <button type="button" className="ktc-link" onClick={() => removeSvc(k)} style={{ fontSize: 12 }}>{t('Remove')}</button>
                      </div>
                      {fieldRow(t('Reefer vans'), numInput(reeferVans, setReeferVans, t('Reefer vans')))}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 8 }}>
                        <label style={{ display: 'grid', gap: 4 }}><span className="ktc-label" style={{ fontSize: 12 }}>{t('Plug-in')}</span>
                          <input className="ktc-input" type="datetime-local" value={plugIn} onChange={(e) => setPlugIn(e.target.value)} style={{ fontSize: 13, minWidth: 0 }} /></label>
                        <label style={{ display: 'grid', gap: 4 }}><span className="ktc-label" style={{ fontSize: 12 }}>{t('Plug-out (est.)')}</span>
                          <input className="ktc-input" type="datetime-local" value={plugOut} onChange={(e) => setPlugOut(e.target.value)} style={{ fontSize: 13, minWidth: 0 }} /></label>
                      </div>
                      {reeferVans > 0 && (
                        <p className="ktc-label" style={{ fontSize: 11.5, margin: '2px 0 0', lineHeight: 1.5 }}>
                          {t('Billed per hour (minimum {h} hours). A refundable cash bond of {amt} per van is required — returned 7–10 working days after withdrawal.', { h: settings.reeferMin, amt: peso(settings.deposit) })}
                        </p>
                      )}
                    </div>
                  )
                }
                const s = services.find((x) => x.service === k)
                return (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className="ktc-label" style={{ flex: '1 1 150px', minWidth: 0 }}>
                      {k}{s?.rate != null && s.rate > 0 && <span style={{ opacity: 0.6, fontSize: 11 }}> · {peso(s.rate)}/{t('container')}</span>}
                    </span>
                    {numInput(svcCounts[k] || 0, (n) => setSvcCounts((p) => ({ ...p, [k]: Math.max(0, n) })), k)}
                    <button type="button" className="ktc-link" onClick={() => removeSvc(k)} style={{ fontSize: 12 }}>{t('Remove')}</button>
                  </div>
                )
              })}
              {availableSvcs.length > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: addedSvcs.length ? 6 : 0, borderTop: addedSvcs.length ? '1px solid hsl(var(--line-soft))' : 'none' }}>
                  <select className="ktc-input ktc-input--compact" style={{ flex: '1 1 160px' }} value={pickSvc} onChange={(e) => setPickSvc(e.target.value)}>
                    <option value="">{t('Add an ancillary service…')}</option>
                    {availableSvcs.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  <button type="button" className="ktc-btn ktc-btn--sm" disabled={!pickSvc} onClick={addSvc} style={{ width: 'auto', padding: '7px 14px', fontSize: 12.5, opacity: pickSvc ? 1 : 0.55 }}>{t('Add')}</button>
                </div>
              )}
              {services.length === 0 && <p className="ktc-label" style={{ fontSize: 12, opacity: 0.8, margin: 0 }}>{t('No ancillary services configured yet.')}</p>}
            </div>
          </div>
        </div>

        {/* ---- Estimate column ---- */}
        <div ref={estimateRef} className="ktc-glass" style={{ padding: 16, position: 'sticky', top: 86 }} data-tour="calc-estimate">
          <StepHead n={4} title={t('Estimate')} />
          <button type="button" className="ktc-btn" disabled={!canGenerate} onClick={generate}
            style={{ width: '100%', marginBottom: 14, opacity: canGenerate ? 1 : 0.55 }}>
            {t('Generate estimate')}
          </button>

          {totalQty === 0 ? (
            <p className="ktc-label" style={{ fontSize: 12.5 }}>{t('Add at least one container (set a quantity), then tap Generate estimate.')}</p>
          ) : !generated ? (
            <p className="ktc-label" style={{ fontSize: 12.5 }}>{hasVessel
              ? t('Tap Generate estimate to see the charges.')
              : t('No vessel selected — the estimate covers terminal & service charges only. Pick a vessel & voyage to include storage (it counts from the vessel’s Last Free Day).')}</p>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <tbody>
                  {calc.basic.map((b) => <Row key={b.key} label={t(b.label)} value={b.amount == null ? '—' : peso(b.amount)} hint={b.amount == null ? t('not configured') : b.tag} />)}
                  {calc.storageDays > 0 && <Row label={t('Storage')} value={calc.storage == null ? '—' : peso(calc.storage)} hint={calc.storage == null ? t('not configured') : `× ${calc.storageDays} ${t('day(s)')}${calc.storageTag ? ' ' + calc.storageTag : ''}`} />}
                  {calc.ancillary.map((a) => <Row key={a.service} label={a.service} value={a.amount == null ? '—' : peso(a.amount)} hint={a.amount == null ? t('not configured') : `× ${a.count}`} />)}
                  {calc.reeferOn && reeferVans > 0 && calc.reeferHours > 0 && <Row label={t('Electrical / reefer')} value={calc.reefer == null ? '—' : peso(calc.reefer)} hint={calc.reefer == null ? t('not configured') : `${reeferVans} × ${calc.reeferHours}h`} />}
                  <Row label={t('VAT ({pct}%)', { pct: (settings.vat * 100).toFixed(0) })} value={peso(calc.vat)} />
                  <Row label={t('Admin & print fee')} value={settings.admin == null ? '—' : peso(settings.admin)} />
                  <tr>
                    <td style={{ padding: '9px 0', fontWeight: 700, fontSize: 14 }}>{t('Estimated charges')}</td>
                    <td className="ktc-mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 16, color: 'var(--acc-2)', whiteSpace: 'nowrap' }}>{peso(calc.charges)}</td>
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

              {(calc.vatable === 0 || calc.hasUnconfigured || settings.admin == null) && (
                <p className="ktc-label" style={{ fontSize: 12, marginTop: 10, color: 'var(--c-h30-70-36)' }}>
                  {t('Some rates aren’t set yet — ask KTC, or check Settings if you’re staff. Lines marked “—” aren’t in this estimate.')}
                </p>
              )}
              <p className="ktc-label" style={{ fontSize: 11.5, marginTop: 12 }}>
                {t('Other services (RPS, equipment rental, stripping) are quoted per request — ask KTC.')}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={printEstimate} disabled={!generated}>
                  {t('Print')}
                </button>
                <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={printEstimate} disabled={!generated}>
                  {t('Save as PDF')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal open={tariffOpen} onClose={() => setTariffOpen(false)} title={t('Published Tariff')} maxWidth={760}>
        {tariffLoading ? (
          <div style={{ display: 'grid', gap: 10 }} aria-label={t('Loading tariff images')}>
            {[160, 220].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 10 }} />)}
          </div>
        ) : tariffError ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <p className="ktc-error" style={{ margin: 0 }}>{tariffError}</p>
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void openTariff()}>{t('Retry')}</button>
          </div>
        ) : tariffImages.length === 0 ? (
          <p className="ktc-label" style={{ margin: 0 }}>{t('No published tariff images are available yet.')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {tariffImages.map((img, i) => (
              <figure key={img.name} style={{ margin: 0, display: 'grid', gap: 6 }}>
                <img
                  src={img.url}
                  alt={t('Published tariff image {n}', { n: i + 1 })}
                  style={{ width: '100%', maxHeight: '72vh', objectFit: 'contain', background: '#fff', borderRadius: 10, border: '1px solid var(--glass-brd)' }}
                />
                <figcaption className="ktc-label" style={{ fontSize: 11.5 }}>{t('Image {n} of {total}', { n: i + 1, total: tariffImages.length })}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </Modal>

      {/* Print-only estimate slip (hidden on screen) — captured by Print / Save as PDF. */}
      <style>{CALC_PRINT_CSS}</style>
      {generated && (
        <div className="ktc-estimate-print" style={{ fontFamily: '-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', color: '#15233a', maxWidth: 520, margin: '0 auto', background: '#fff', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, borderBottom: `1.5px solid ${PRINT_LINE}`, paddingBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <img src="/ktc-logo.png" alt="KTC" style={{ height: 30 }} />
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>KTC CONTAINER TERMINAL CORP.</div>
                <div style={{ fontSize: 8.5, color: '#5a6678', maxWidth: 250 }}>Purok 16, Buhisan, Tibungco, Bunawan District, 8000 Davao City</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', lineHeight: 1.15 }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em' }}>{t('RATE ESTIMATE')}</div>
              <div style={{ fontSize: 8.5, color: '#5a6678' }}>{new Date().toLocaleString()}</div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginTop: 10 }}>
            <tbody>
              <SlipInfo label={t('Shipping line')} value={lineLabel || '—'} />
              <SlipInfo label={t('Vessel & voyage')} value={vesselText} />
              <SlipInfo label={t('Trade route')} value={`${t(tradeLabel(trade, origin))} · ${origin === 'foreign' ? t('Foreign') : t('Domestic')}`} />
              {lfd && <SlipInfo label={t('Last Free Day')} value={new Date(lfd).toLocaleDateString()} />}
              {pickupDate && <SlipInfo label={t('Planned pickup date')} value={new Date(pickupDate).toLocaleDateString()} />}
              <SlipInfo label={t('Containers')} value={containerSummary.join(', ') || '—'} />
            </tbody>
          </table>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5, marginTop: 10, border: `1px solid ${PRINT_LINE}` }}>
            <thead>
              <tr style={{ background: PRINT_HEADFILL }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 9, fontWeight: 800, borderBottom: `1px solid ${PRINT_LINE}` }}>{t('Charge')}</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontSize: 9, fontWeight: 800, borderBottom: `1px solid ${PRINT_LINE}` }}>{t('Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {calc.basic.map((b) => <SlipCharge key={b.key} label={t(b.label)} value={b.amount == null ? '—' : peso(b.amount)} />)}
              {calc.storageDays > 0 && <SlipCharge label={`${t('Storage')} (× ${calc.storageDays} ${t('day(s)')})`} value={calc.storage == null ? '—' : peso(calc.storage)} />}
              {calc.ancillary.map((a) => <SlipCharge key={a.service} label={a.service} value={a.amount == null ? '—' : peso(a.amount)} />)}
              {calc.reeferOn && reeferVans > 0 && calc.reeferHours > 0 && <SlipCharge label={t('Electrical / reefer')} value={calc.reefer == null ? '—' : peso(calc.reefer)} />}
              <SlipCharge label={t('VAT ({pct}%)', { pct: (settings.vat * 100).toFixed(0) })} value={peso(calc.vat)} />
              <SlipCharge label={t('Admin & print fee')} value={settings.admin == null ? '—' : peso(settings.admin)} />
              <tr style={{ background: PRINT_HEADFILL }}>
                <td style={{ padding: '6px 8px', fontWeight: 800, borderTop: `1px solid ${PRINT_LINE}` }}>{t('Estimated charges')}</td>
                <td className="ktc-mono" style={{ padding: '6px 8px', fontWeight: 800, textAlign: 'right', borderTop: `1px solid ${PRINT_LINE}`, whiteSpace: 'nowrap' }}>{peso(calc.charges)}</td>
              </tr>
              {calc.deposit > 0 && (
                <>
                  <SlipCharge label={`${t('Refundable cash bond')} (${reeferVans} × ${peso(settings.deposit)})`} value={peso(calc.deposit)} />
                  <tr>
                    <td style={{ padding: '6px 8px', fontWeight: 800 }}>{t('Total to prepare')}</td>
                    <td className="ktc-mono" style={{ padding: '6px 8px', fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap' }}>{peso(calc.toPrepare)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          <p style={{ fontSize: 8.5, color: '#5a6678', marginTop: 10, lineHeight: 1.5 }}>
            {t('This is an estimate only — the official amount is confirmed on the Service Invoice at the KTC office. Lines marked “—” are not yet priced and are excluded.')}
          </p>
          <div style={{ marginTop: 6, fontSize: 8, color: '#8893a4', textAlign: 'center', borderTop: `1px solid ${PRINT_LINE}`, paddingTop: 5 }}>
            {t('KTC Online Portal · portal.ktcterminal.com — system-generated rate estimate')}
          </div>
        </div>
      )}
    </Wrap>
  )
}
