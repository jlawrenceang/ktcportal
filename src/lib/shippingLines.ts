// Shipping lines KTC carries + the terminal charges per-line rules can target.
// Shared by the Rate Calculator and the admin Settings rules editor so the two
// never drift. MCC is Maersk's domestic feeder arm, so the trade route is
// derived from the line (only MCC is domestic).

export type Origin = 'domestic' | 'foreign'
export type Trade = 'import' | 'export' | 'transhipment'

// Trade-direction label depends on origin: FOREIGN cargo is Import / Export /
// Transhipment; DOMESTIC cargo is Inbound / Outbound. The stored value stays
// 'import'/'export'/'transhipment' — only the display label changes. Returns a raw
// English string; callers wrap with t() (English-keyed fallback).
export function tradeLabel(trade: Trade, origin: Origin): string {
  if (trade === 'transhipment') return 'Transhipment'
  if (origin === 'domestic') return trade === 'import' ? 'Inbound' : 'Outbound'
  return trade === 'import' ? 'Import' : 'Export'
}
// The yard action behind each direction (same regardless of origin).
export const tradeAction = (trade: Trade): string =>
  trade === 'import' ? 'Withdrawal' : trade === 'export' ? 'Deposit' : 'Transit'

export const SHIPPING_LINES: { code: string; label: string; origin: Origin }[] = [
  { code: 'MAERSK', label: 'Maersk', origin: 'foreign' },
  { code: 'MCC', label: 'MCC', origin: 'domestic' },
  { code: 'EVERGREEN', label: 'Evergreen', origin: 'foreign' },
  { code: 'SITC', label: 'SITC', origin: 'foreign' },
  { code: 'MSC', label: 'MSC', origin: 'foreign' },
  { code: 'CMA-CGM', label: 'CMA-CGM', origin: 'foreign' },
]

// Terminal charges a per-line rule can waive / discount / surcharge.
export const TERMINAL_CHARGE_SERVICES: { key: string; label: string }[] = [
  { key: 'arrastre', label: 'Arrastre' },
  { key: 'wharfage', label: 'Wharfage' },
  { key: 'lolo', label: 'LoLo' },
  { key: 'weighing', label: 'Weighing scale' },
  { key: 'storage', label: 'Storage' },
]

export const CHARGE_RULE_ACTIONS: { key: string; label: string; needsValue: boolean }[] = [
  { key: 'waive', label: 'Waive (exclude)', needsValue: false },
  { key: 'discount_pct', label: 'Discount %', needsValue: true },
  { key: 'discount_amt', label: 'Discount ₱ / container', needsValue: true },
  { key: 'surcharge_amt', label: 'Surcharge ₱ / container', needsValue: true },
]

// Normalise a line name/code for loose matching (schedule stores display names
// like "Maersk"/"CMA CGM"; rules + the calculator key on the CODE).
export const normLine = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
