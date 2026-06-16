// Import consignees from a CSV into public.consignees (auto-generating codes).
// Detects a name column ("name"/"customer name"/"consignee"...) and an optional
// "code" column. Dedups by name (case-insensitive) within the file AND against
// existing rows, so it's safe to re-run.
//
// Usage: DATABASE_URL="postgresql://...:5432/postgres" node scripts/import-consignees.mjs "C:/path/Customer.csv"
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

const file = process.argv[2]
if (!file) { console.error('Pass a CSV path'); process.exit(1) }
const url = process.env.DATABASE_URL
if (!url) { console.error('Set DATABASE_URL'); process.exit(1) }

const grid = await readGrid(file)
const header = grid[0].map((h) => h.trim().toLowerCase())
const nameIdx = header.findIndex((h) => h === 'name' || h === 'consignee' || h.includes('customer name') || h.includes('consignee name'))
const codeIdx = header.findIndex((h) => h === 'code')
if (nameIdx < 0) { console.error('Could not find a name column. Headers:', header.join(', ')); process.exit(1) }

// build deduped rows (case-insensitive by name)
const seen = new Set()
const rows = []
for (const r of grid.slice(1)) {
  const name = (r[nameIdx] ?? '').trim()
  if (!name) continue
  const key = name.toLowerCase()
  if (seen.has(key)) continue
  seen.add(key)
  rows.push({ name, code: codeIdx >= 0 ? (r[codeIdx] ?? '').trim() : '' })
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  const existing = await c.query('select lower(name) as n from public.consignees')
  const have = new Set(existing.rows.map((x) => x.n))
  const fresh = rows.filter((r) => !have.has(r.name.toLowerCase()))
  console.log(`file unique: ${rows.length} · already present: ${rows.length - fresh.length} · to insert: ${fresh.length}`)

  let inserted = 0
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500)
    const withCode = chunk.filter((r) => r.code)
    const noCode = chunk.filter((r) => !r.code)
    if (noCode.length) {
      const vals = noCode.map((_, k) => `($${k + 1})`).join(',')
      const res = await c.query(`insert into public.consignees (name) values ${vals} on conflict do nothing`, noCode.map((r) => r.name))
      inserted += res.rowCount
    }
    if (withCode.length) {
      const vals = withCode.map((_, k) => `($${k * 2 + 1}, $${k * 2 + 2})`).join(',')
      const params = withCode.flatMap((r) => [r.code, r.name])
      const res = await c.query(`insert into public.consignees (code, name) values ${vals} on conflict (code) do update set name = excluded.name`, params)
      inserted += res.rowCount
    }
  }
  const total = await c.query('select count(*)::int n from public.consignees')
  console.log(`inserted: ${inserted} · total consignees now: ${total.rows[0].n}`)
} finally {
  await c.end()
}
