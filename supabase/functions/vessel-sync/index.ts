// Vessel-schedule sync — Google Sheet <-> app. Hourly it (1) READS the vessel
// monitoring Sheet and upserts public.vessel_schedule, then (2) writes the
// app-COMPUTED "Last Free Day of Storage" back into the sheet so operations +
// cashiers see it there.
//
// The sheet is one running list with these headers (hidden schema row): the three
// events each carry a date + a military clock-time (e.g. 1653H):
//   shipping_line, vessel_name, voyage_number,
//   arrival_date, arrival_time, last_discharge_date, last_discharge_time,
//   last_free_day (mirror — written, never read), departure_date, departure_time,
//   berth, week, remarks, cancelled
// vessel_visit is NOT in the sheet — it's DERIVED from vessel_name + voyage_number
// (the stable DB key Job Orders link on). Only ADDS/UPDATES, never deletes — set
// cancelled=TRUE to retire a visit. App stays source of truth (last_free_day is
// computed in vessel_schedule_v); the sheet column is a read-only mirror.
//
// Trigger: pg_cron hourly (0107) or the in-app "Sync sheet" button
// (trigger_vessel_sync, 0109), both POST with the x-cron-secret header.
//
// Required function secrets (scripts/setup-vessel-sync.mjs sets them):
//   CRON_SECRET / GOOGLE_SA_EMAIL / GOOGLE_SA_KEY / VESSEL_SHEET_ID
// The vessel Sheet must be shared with GOOGLE_SA_EMAIL as EDITOR (the LFD mirror
// writes back).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignJWT, importPKCS8 } from 'npm:jose@5'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function googleToken(saEmail: string, saKeyPem: string): Promise<string> {
  const key = await importPKCS8(saKeyPem.replace(/\\n/g, '\n'), 'RS256')
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(saEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const tok = await res.json()
  if (!tok.access_token) throw new Error('Google auth failed: ' + JSON.stringify(tok))
  return tok.access_token
}

const clean = (v: unknown): string | null => { const s = String(v ?? '').trim(); return s === '' ? null : s }

// Parse a sheet date cell -> 'YYYY-MM-DD'. Accepts MM/DD/YY, MM/DD/YYYY,
// YYYY-MM-DD, or anything Date can read; returns null if blank/unparseable.
const asDate = (v: unknown): string | null => {
  const s = clean(v)
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/) // MM/DD/YY or MM/DD/YYYY
  if (m) { const yr = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${yr}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

// Clock time as ops type it, normalized: keep digits + an H suffix → "1653H".
const asTime = (v: unknown): string | null => {
  const s = clean(v)
  if (!s) return null
  const digits = s.replace(/[^0-9]/g, '')
  if (!digits) return s.toUpperCase()
  return digits.padStart(4, '0').slice(0, 4) + 'H'
}

const asInt = (v: unknown): number | null => { const s = clean(v); if (!s) return null; const n = parseInt(s.replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? n : null }
const truthy = (v: unknown): boolean => /^(1|true|yes|y|cancelled|cancel)$/i.test(String(v ?? '').trim())

// Stable internal key from vessel name + voyage (vessel_visit is no longer entered).
const deriveVisit = (name: string, voy: string): string => `${name} ${voy}`.trim().toUpperCase().replace(/\s+/g, ' ')

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ ok: false, error: 'forbidden' }, 403)
  const saEmail = Deno.env.get('GOOGLE_SA_EMAIL')
  const saKey = Deno.env.get('GOOGLE_SA_KEY')
  const sheetId = Deno.env.get('VESSEL_SHEET_ID')
  if (!saEmail || !saKey || !sheetId) {
    return json({ ok: false, error: 'vessel-sync not configured — set GOOGLE_SA_EMAIL / GOOGLE_SA_KEY / VESSEL_SHEET_ID secrets' })
  }

  try {
    const token = await googleToken(saEmail, saKey)
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:Z100000`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) throw new Error('Sheets read failed: ' + (await r.text()))
    const rows: string[][] = (await r.json()).values ?? []
    // Header row = first row carrying a "vessel_name" cell (so the sheet can have
    // a logo / title / friendly labels above the hidden canonical schema row).
    const norm = (c: unknown) => String(c ?? '').trim().toLowerCase().replace(/\s+/g, '_')
    // Key on voyage_number — the visible friendly labels ("Vessel Name", "Berth"…)
    // normalize to several canonical names, but "Voyage" -> "voyage" never matches
    // "voyage_number", so this reliably lands on the HIDDEN canonical schema row.
    const hi = rows.findIndex((row) => row.some((c) => norm(c) === 'voyage_number'))
    if (hi < 0) return json({ ok: false, error: 'no header row found — add the canonical headers (voyage_number, vessel_name, …)' }, 400)
    const header = rows[hi].map(norm)
    const col = (n: string) => header.indexOf(n)
    const ci = {
      line: col('shipping_line'), name: col('vessel_name'), voy: col('voyage_number'),
      arrD: col('arrival_date'), arrT: col('arrival_time'),
      finD: col('last_discharge_date'), finT: col('last_discharge_time'),
      lfd: col('last_free_day'),
      depD: col('departure_date'), depT: col('departure_time'),
      berth: col('berth'), week: col('week'), rem: col('remarks'), cancelled: col('cancelled'),
    }
    if (ci.name < 0 || ci.voy < 0) {
      return json({ ok: false, error: `missing required header(s); need vessel_name, voyage_number. got: ${header.join(', ')}` }, 400)
    }

    const upserts: Record<string, unknown>[] = []
    const seen = new Set<string>()
    let skipped = 0
    for (const row of rows.slice(hi + 1)) {
      const name = clean(row[ci.name]), voy = clean(row[ci.voy])
      if (!name || !voy) { skipped++; continue }
      if (norm(name) === 'vessel_name' || norm(voy) === 'voyage_number') { skipped++; continue } // header echo
      const visit = deriveVisit(name, voy)
      if (seen.has(visit)) { skipped++; continue }
      seen.add(visit)
      upserts.push({
        vessel_visit: visit, vessel_name: name, voyage_number: voy,
        shipping_line: ci.line >= 0 ? clean(row[ci.line]) : null,
        actual_arrival: ci.arrD >= 0 ? asDate(row[ci.arrD]) : null,
        arrival_time: ci.arrT >= 0 ? asTime(row[ci.arrT]) : null,
        finish_discharging: ci.finD >= 0 ? asDate(row[ci.finD]) : null,
        discharge_time: ci.finT >= 0 ? asTime(row[ci.finT]) : null,
        departure: ci.depD >= 0 ? asDate(row[ci.depD]) : null,
        departure_time: ci.depT >= 0 ? asTime(row[ci.depT]) : null,
        berth: ci.berth >= 0 ? clean(row[ci.berth]) : null,
        week: ci.week >= 0 ? asInt(row[ci.week]) : null,
        remarks: ci.rem >= 0 ? clean(row[ci.rem]) : null,
        cancelled: ci.cancelled >= 0 ? truthy(row[ci.cancelled]) : false,
        updated_at: new Date().toISOString(),
      })
    }

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    let upserted = 0
    if (upserts.length) {
      const { error } = await db.from('vessel_schedule').upsert(upserts, { onConflict: 'vessel_visit' })
      if (error) throw new Error('upsert failed: ' + error.message)
      upserted = upserts.length
    }

    // Mirror the app-COMPUTED Last Free Day back into the sheet's last_free_day
    // column (read-only mirror) so ops + cashiers see it without opening the
    // portal. We only WRITE this column from vessel_schedule_v.last_free_day,
    // never read it back in.
    let mirrored = 0
    if (ci.lfd >= 0 && ci.lfd < 26 && upserts.length) {
      const visits = upserts.map((u) => u.vessel_visit as string)
      const { data: comp } = await db.from('vessel_schedule_v').select('vessel_visit, last_free_day').in('vessel_visit', visits)
      const byVisit = new Map((comp ?? []).map((c) => [String(c.vessel_visit), (c.last_free_day as string | null) ?? '']))
      const colLetter = String.fromCharCode(65 + ci.lfd)
      const firstDataRow = hi + 2 // 1-indexed sheet row of the first data row
      const cells = rows.slice(hi + 1).map((row) => {
        const name = clean(row[ci.name]), voy = clean(row[ci.voy])
        const v = name && voy ? deriveVisit(name, voy) : null
        return [v && byVisit.has(v) ? byVisit.get(v)! : '']
      })
      if (cells.length) {
        const range = `${colLetter}${firstDataRow}:${colLetter}${firstDataRow + cells.length - 1}`
        const wr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=RAW`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: cells }),
        })
        if (wr.ok) mirrored = cells.filter((c) => c[0]).length
        else console.error('LFD mirror write failed: ' + (await wr.text()))
      }
    }

    return json({ ok: true, sheet_rows: rows.length - hi - 1, upserted, skipped, mirrored })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
