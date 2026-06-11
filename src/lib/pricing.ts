import { supabase } from './supabase'

// Fee computation per the decided model (2026-06-11):
//   subtotal = Σ rate × containers per service (rates are VAT-EXCLUSIVE)
//   VAT      = vat_rate × the VATABLE portion of the subtotal
//   + flat admin/service fee and print fee (NOT VATable — added after VAT)
// This is the operational "what to pay" amount — the official Service Invoice
// still comes from the ERP at the cashier.

export interface RateRow { service: string; rate: number; unit: string; vatable: boolean; active: boolean }
export interface PricingConfig { rates: RateRow[]; vatRate: number; adminFee: number; printFee: number }

export interface ChargeLine { service: string; qty: number; rate: number; amount: number; vatable: boolean; missingRate: boolean }
export interface Charges {
  lines: ChargeLine[]
  subtotal: number
  vatableBase: number
  vat: number
  adminFee: number
  printFee: number
  total: number
  hasMissingRates: boolean
}

export async function loadPricingConfig(): Promise<PricingConfig> {
  const [{ data: r }, { data: s }] = await Promise.all([
    supabase.from('service_rates').select('service, rate, unit, vatable, active'),
    supabase.from('pricing_settings').select('key, value'),
  ])
  const settings = new Map(((s ?? []) as { key: string; value: number }[]).map((x) => [x.key, Number(x.value)]))
  return {
    rates: ((r ?? []) as RateRow[]).map((x) => ({ ...x, rate: Number(x.rate) })),
    vatRate: settings.get('vat_rate') ?? 0.12,
    adminFee: settings.get('admin_fee') ?? 0,
    printFee: settings.get('print_fee') ?? 0,
  }
}

/** counts: service label → number of containers requesting it. */
export function computeCharges(counts: Map<string, number>, cfg: PricingConfig): Charges {
  const lines: ChargeLine[] = []
  let subtotal = 0
  let vatableBase = 0
  for (const [service, qty] of counts) {
    if (qty <= 0) continue
    const rate = cfg.rates.find((r) => r.service === service)
    const unit = rate?.rate ?? 0
    const amount = unit * qty
    lines.push({ service, qty, rate: unit, amount, vatable: rate?.vatable ?? true, missingRate: !rate || rate.rate <= 0 })
    subtotal += amount
    if (rate?.vatable ?? true) vatableBase += amount
  }
  const vat = vatableBase * cfg.vatRate
  const total = subtotal + vat + cfg.adminFee + cfg.printFee
  return {
    lines,
    subtotal,
    vatableBase,
    vat,
    adminFee: cfg.adminFee,
    printFee: cfg.printFee,
    total,
    hasMissingRates: lines.some((l) => l.missingRate),
  }
}

export function peso(n: number): string {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
