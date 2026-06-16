// Import vessel-schedule rows from a CSV into public.vessel_schedule.
// Keyed on vessel_visit (UNIQUE) — re-runnable: existing visits are UPDATED.
// Headers (case-insensitive): vessel_visit, vessel_name, voyage_number are
// REQUIRED; shipping_line, actual_arrival (YYYY-MM-DD), finish_discharging
// (YYYY-MM-DD), berth, remarks are optional.
//
// Usage: DATABASE_URL="postgresql://...:5432/postgres" node scripts/import-vessels.mjs "C:/path/vessels.csv"
import pg from 'pg'
import { readGrid } from './sheetGrid.mjs'

function parseCsv(text) {
  const rows = []; let f = '', rec = [], q = false, i = 0
  while (i < text.length) {
    const ch = text[i]
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue } q = false; i++; continue } f += ch; i++; continue }
    if (ch === '"') { q = true; i++; continue }
    if (ch === ',') { rec.push(f); f = ''; i++; continue }
    if (ch === '\r') { i++; continue }
    if (ch === '\n') { rec.push(f); rows.push(rec); rec = []; f = ''; i++; continue }
    f += ch; i++
  }
  if (f.length || rec.length) { rec.push(f); rows.push(rec) }
  return rows
}
const clean = (v) => { const s = (v ?? '').trim(); return s === '' ? null : s }

const file = process.argv[2]
if (!file) { console.error('Pass a CSV path'); process.exit(1) }
const url = process.env.DATABASE_URL
if (!url) { console.error('Set DATABASE_URL'); process.exit(1) }

const grid = await readGrid(file)
const header = grid[0].map((h) => h.trim().toLowerCase())
const col = (name) => header.indexOf(name)
const need = ['vessel_visit', 'vessel_name', 'voyage_number']
for (const n of need) if (col(n) < 0) { console.error(`Missing required column "${n}". Headers: ${header.join(', ')}`); process.exit(1) }
const idx = Object.fromEntries(['vessel_visit','vessel_name','voyage_number','shipping_line','actual_arrival','finish_discharging','berth','remarks'].map((k) => [k, col(k)]))

const rows = []
for (const r of grid.slice(1)) {
  const visit = clean(r[idx.vessel_visit]); const vn = clean(r[idx.vessel_name]); const voy = clean(r[idx.voyage_number])
  if (!visit || !vn || !voy) continue
  rows.push({ visit, vn, voy,
    line: idx.shipping_line >= 0 ? clean(r[idx.shipping_line]) : null,
    arr: idx.actual_arrival >= 0 ? clean(r[idx.actual_arrival]) : null,
    fin: idx.finish_discharging >= 0 ? clean(r[idx.finish_discharging]) : null,
    berth: idx.berth >= 0 ? clean(r[idx.berth]) : null,
    rem: idx.remarks >= 0 ? clean(r[idx.remarks]) : null })
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  let n = 0
  for (const r of rows) {
    await c.query(
      `insert into public.vessel_schedule (vessel_visit, vessel_name, voyage_number, shipping_line, actual_arrival, finish_discharging, berth, remarks)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (vessel_visit) do update set
         vessel_name=excluded.vessel_name, voyage_number=excluded.voyage_number, shipping_line=excluded.shipping_line,
         actual_arrival=excluded.actual_arrival, finish_discharging=excluded.finish_discharging, berth=excluded.berth,
         remarks=excluded.remarks, updated_at=now()`,
      [r.visit, r.vn, r.voy, r.line, r.arr, r.fin, r.berth, r.rem])
    n++
  }
  const total = (await c.query('select count(*)::int n from public.vessel_schedule')).rows[0].n
  console.log(`upserted: ${n} · total vessel_schedule rows now: ${total}`)
} finally { await c.end() }
