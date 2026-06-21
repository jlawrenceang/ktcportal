// "Batch" = the day a job order was filed (Asia/Manila). This replaces the
// per-order priority / serving number: orders are grouped by filing day, and
// AGING (time since filing) is what ops watches to keep turnaround down. No DB
// change — both are derived from job_orders.created_at.
const TZ = 'Asia/Manila'

function manilaYmd(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
}

/** Friendly batch label: "Today" / "Yesterday" / "Jun 19, 2026" (Manila day). */
export function batchLabel(iso: string, t: (s: string) => string = (s) => s): string {
  const ms = new Date(iso).getTime()
  const day = manilaYmd(ms)
  const now = Date.now()
  if (day === manilaYmd(now)) return t('Today')
  if (day === manilaYmd(now - 86_400_000)) return t('Yesterday')
  return new Date(ms).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' })
}

// Aging counts ONLY X-ray operating hours (09:00–19:00 Manila, daily), so an
// order filed at 6pm doesn't read "15h old" by 9am — the clock freezes overnight
// and resumes when the division opens. One operating day = 10 hours.
const OPEN_MIN = 9 * 60      // 09:00
const CLOSE_MIN = 19 * 60    // 19:00
const MANILA_OFFSET = 8 * 60 * 60 * 1000 // UTC+8, no DST
export const OPERATING_DAY_HOURS = (CLOSE_MIN - OPEN_MIN) / 60 // = 10

function opMinutes(fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0
  const a = Math.floor((fromMs + MANILA_OFFSET) / 60_000) // minutes since epoch, Manila wall-clock
  const b = Math.floor((toMs + MANILA_OFFSET) / 60_000)
  let total = 0
  const firstDay = Math.floor(a / 1440)
  const lastDay = Math.floor(b / 1440)
  for (let d = firstDay; d <= lastDay && d - firstDay <= 400; d++) {
    const open = d * 1440 + OPEN_MIN
    const close = d * 1440 + CLOSE_MIN
    const s = Math.max(a, open)
    const e = Math.min(b, close)
    if (e > s) total += e - s
  }
  return total
}

/** Operational age since filing, e.g. "26h 10m", "5h 12m", "37m" (operating hours only). */
export function formatAge(fromIso: string, toIso?: string | null): string {
  const mins = opMinutes(new Date(fromIso).getTime(), toIso ? new Date(toIso).getTime() : Date.now())
  const h = Math.floor(mins / 60); const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** Operating hours elapsed since filing (for threshold coloring). */
export function ageHours(fromIso: string, toIso?: string | null): number {
  return opMinutes(new Date(fromIso).getTime(), toIso ? new Date(toIso).getTime() : Date.now()) / 60
}
