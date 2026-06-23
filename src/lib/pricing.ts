import { supabase } from './supabase'

// Fee computation per the decided model (2026-06-11):
//   subtotal = Σ rate × containers per service (rates are VAT-EXCLUSIVE)
//   VAT      = vat_rate × the VATABLE portion of the subtotal
//   + one flat admin & print fee (NOT VATable — added after VAT)
// This is the operational "what to pay" amount — the official Service Invoice
// still comes from the ERP at the cashier.

// A rate of null (or ≤ 0) means "not configured yet" — distinct from a real ₱0.
// Never coerce a null rate to a number for display; show "—" instead.
export interface RateRow { service: string; rate: number | null; unit: string; vatable: boolean; active: boolean }
export interface MoveRate { move_type: string; rate: number | null }
export interface PricingConfig { rates: RateRow[]; moveRates: MoveRate[]; vatRate: number; adminFee: number | null }

// amount is null when the line's rate isn't configured (so it can render "—"
// rather than a misleading ₱0). missingRate flags that case for callers.
export interface ChargeLine { service: string; qty: number; rate: number | null; amount: number | null; vatable: boolean; missingRate: boolean }
export interface Charges {
  lines: ChargeLine[]
  subtotal: number
  vatableBase: number
  vat: number
  adminFee: number | null
  total: number
  hasMissingRates: boolean
}

export async function loadPricingConfig(): Promise<PricingConfig> {
  const [{ data: r }, { data: s }, { data: m }] = await Promise.all([
    supabase.from('service_rates').select('service, rate, unit, vatable, active'),
    supabase.from('pricing_settings').select('key, value'),
    supabase.from('move_rates').select('move_type, rate'),
  ])
  // Preserve null: a null value means "not set", NOT 0 — and Number(null) is 0,
  // Number(undefined)/Number('') edge-cases aside, so coerce only real values.
  const settings = new Map(((s ?? []) as { key: string; value: number | null }[])
    .map((x) => [x.key, x.value == null ? null : Number(x.value)]))
  return {
    rates: ((r ?? []) as RateRow[]).map((x) => ({ ...x, rate: x.rate == null ? null : Number(x.rate) })),
    moveRates: ((m ?? []) as MoveRate[]).map((x) => ({ ...x, rate: x.rate == null ? null : Number(x.rate) })),
    vatRate: settings.get('vat_rate') ?? 0.12,
    adminFee: settings.get('admin_fee') ?? null,
  }
}

/**
 * counts: service label → number of containers requesting it.
 * moves (optional): RPS move type → number of moves (per-move charges, VATable).
 */
export function computeCharges(counts: Map<string, number>, cfg: PricingConfig, moves?: Map<string, number>): Charges {
  const lines: ChargeLine[] = []
  let subtotal = 0
  let vatableBase = 0
  for (const [service, qty] of counts) {
    if (qty <= 0) continue
    const rate = cfg.rates.find((r) => r.service === service)
    const unit = rate?.rate ?? null
    // "not configured" = no row, null rate, or a non-positive rate.
    const missingRate = unit == null || unit <= 0
    const amount = missingRate ? null : unit * qty
    lines.push({ service, qty, rate: unit, amount, vatable: rate?.vatable ?? true, missingRate })
    if (amount != null) {
      subtotal += amount
      if (rate?.vatable ?? true) vatableBase += amount
    }
  }
  if (moves) for (const [moveType, qty] of moves) {
    if (qty <= 0) continue
    const mr = cfg.moveRates.find((m) => m.move_type === moveType)
    const unit = mr?.rate ?? null
    const missingRate = unit == null || unit <= 0
    const amount = missingRate ? null : unit * qty
    lines.push({ service: `${moveType} (RPS move)`, qty, rate: unit, amount, vatable: true, missingRate })
    if (amount != null) {
      subtotal += amount
      vatableBase += amount // RPS moves are VATable
    }
  }
  const vat = vatableBase * cfg.vatRate
  // The unconfigured (null/≤0) fee doesn't add to the total — but stays nullable so
  // the UI can render "—" instead of ₱0.
  const adminFee = cfg.adminFee != null && cfg.adminFee > 0 ? cfg.adminFee : null
  const total = subtotal + vat + (adminFee ?? 0)
  return {
    lines,
    subtotal,
    vatableBase,
    vat,
    adminFee,
    total,
    hasMissingRates: lines.some((l) => l.missingRate),
  }
}

export function peso(n: number): string {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
