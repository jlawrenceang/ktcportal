// Vessel-schedule sync — ONE-WAY Google Sheet -> app import. Reads the vessel
// monitoring Sheet hourly and upserts public.vessel_schedule (idempotent on
// vessel_visit). Only touches vessel_schedule and only ADDS/UPDATES (never
// deletes) so a sheet typo can't wipe live rows — set cancelled=TRUE in the
// sheet to retire a vessel. Supabase stays source of truth for everything else.
//
// Trigger: pg_cron (hourly) POSTs here with the x-cron-secret header
// (migration 0107); can also be invoked manually with the same header.
//
// Required function secrets (scripts/setup-vessel-sync.mjs sets them):
//   CRON_SECRET      — shared secret for the trigger
//   GOOGLE_SA_EMAIL  — Google service-account email (vessel Sheet shared with it, Viewer)
//   GOOGLE_SA_KEY    — the service account's PKCS8 private key (PEM, \n-escaped ok)
//   VESSEL_SHEET_ID  — the vessel monitoring spreadsheet id (the long id in its URL)
// GOOGLE_SA_EMAIL/KEY are the SAME service account as boc-mirror — just share
// the vessel Sheet with it as Viewer.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignJWT, importPKCS8 } from 'npm:jose@5'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function googleToken(saEmail: string, saKeyPem: string): Promise<string> {
  const key = await importPKCS8(saKeyPem.replace(/\\n/g, '\n'), 'RS256')
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets.readonly' })
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
const asDate = (v: unknown): string | null => { const s = clean(v); if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) }
const truthy = (v: unknown): boolean => /^(1|true|yes|y|cancelled|cancel)$/i.test(String(v ?? '').trim())

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
    // Find the header row (the first row containing a "vessel_visit" cell) so the
    // sheet can carry a logo / title / notes above the headers — data is every
    // row below it.
    const hi = rows.findIndex((row) => row.some((c) => String(c ?? '').trim().toLowerCase().replace(/\s+/g, '_') === 'vessel_visit'))
    if (hi < 0) return json({ ok: false, error: 'no header row found — add a row with the column headers (vessel_visit, vessel_name, voyage_number, …)' }, 400)
    const header = rows[hi].map((h) => String(h ?? '').trim().toLowerCase().replace(/\s+/g, '_'))
    const col = (n: string) => header.indexOf(n)
    const ci = { visit: col('vessel_visit'), name: col('vessel_name'), voy: col('voyage_number'), line: col('shipping_line'), arr: col('actual_arrival'), fin: col('finish_discharging'), berth: col('berth'), rem: col('remarks'), cancelled: col('cancelled') }
    if (ci.visit < 0 || ci.name < 0 || ci.voy < 0) {
      return json({ ok: false, error: `missing required header(s); need vessel_visit, vessel_name, voyage_number. got: ${header.join(', ')}` }, 400)
    }

    const upserts: Record<string, unknown>[] = []
    const seen = new Set<string>()
    let skipped = 0
    for (const row of rows.slice(hi + 1)) {
      const visit = clean(row[ci.visit]), name = clean(row[ci.name]), voy = clean(row[ci.voy])
      if (!visit || !name || !voy) { skipped++; continue }
      if (seen.has(visit.toLowerCase())) { skipped++; continue }
      seen.add(visit.toLowerCase())
      upserts.push({
        vessel_visit: visit, vessel_name: name, voyage_number: voy,
        shipping_line: ci.line >= 0 ? clean(row[ci.line]) : null,
        actual_arrival: ci.arr >= 0 ? asDate(row[ci.arr]) : null,
        finish_discharging: ci.fin >= 0 ? asDate(row[ci.fin]) : null,
        berth: ci.berth >= 0 ? clean(row[ci.berth]) : null,
        remarks: ci.rem >= 0 ? clean(row[ci.rem]) : null,
        cancelled: ci.cancelled >= 0 ? truthy(row[ci.cancelled]) : false,
        updated_at: new Date().toISOString(),
      })
    }

    let upserted = 0
    if (upserts.length) {
      const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const { error } = await db.from('vessel_schedule').upsert(upserts, { onConflict: 'vessel_visit' })
      if (error) throw new Error('upsert failed: ' + error.message)
      upserted = upserts.length
    }
    return json({ ok: true, sheet_rows: rows.length - hi - 1, upserted, skipped })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
