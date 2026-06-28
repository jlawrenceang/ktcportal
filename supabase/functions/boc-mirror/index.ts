// BOC Sheets mirror — ONE-WAY app → Google Sheet export (read-only for the
// Bureau of Customs, who don't get portal access). Never reads the Sheet back:
// Supabase stays the source of truth.
//
// Scope (owner, 2026-06-29): an X-RAY INSPECTION view — one row per X-ray
// container (BOC's X-ray division cares about inspection, not KTC billing), so
// only X-ray service lines are exported and the billing columns (customer/broker,
// service invoice) are dropped. Vessel/voyage + per-container X-ray-done added.
//
// Trigger: pg_cron (hourly) POSTs here with the x-cron-secret header
// (migration 0037); can also be invoked manually with the same header.
//
// Required function secrets (scripts/setup-boc-mirror.mjs sets them):
//   BOC_CRON_SECRET  — per-function trigger secret (legacy CRON_SECRET still honored)
//   GOOGLE_SA_EMAIL  — Google service-account email (Sheet shared with it, Editor)
//   GOOGLE_SA_KEY    — the service account's PKCS8 private key (PEM, \n-escaped ok)
//   BOC_SHEET_ID     — target spreadsheet id (the long id in the Sheet URL)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignJWT, importPKCS8 } from 'npm:jose@5'

const MANILA: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
const ph = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-PH', MANILA) : '')

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

Deno.serve(async (req) => {
  // Per-function secret. Falls back to the legacy shared CRON_SECRET during the
  // transition so this function is never collateral-403'd when the OTHER cron's
  // setup script runs (the project-wide-CRON_SECRET gotcha).
  const secret = Deno.env.get('BOC_CRON_SECRET') ?? Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ ok: false, error: 'forbidden' }, 403)
  }
  const saEmail = Deno.env.get('GOOGLE_SA_EMAIL')
  const saKey = Deno.env.get('GOOGLE_SA_KEY')
  const sheetId = Deno.env.get('BOC_SHEET_ID')
  if (!saEmail || !saKey || !sheetId) {
    return json({ ok: false, error: 'mirror not configured — set GOOGLE_SA_EMAIL / GOOGLE_SA_KEY / BOC_SHEET_ID secrets' })
  }

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const since = new Date(Date.now() - 60 * 86400_000).toISOString() // rolling 60 days
    const { data, error } = await db
      .from('job_orders')
      .select('jo_number, status, entry_number, created_at, vessel_name, voyage_number, consignee:consignees(code, name), lines:job_order_lines(container_number, service_request, xray_done_at)')
      .neq('status', 'held') // account-gated drafts never leave the app
      .gte('created_at', since)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)

    type Row = {
      jo_number: string | null; status: string; entry_number: string | null; created_at: string
      vessel_name: string | null; voyage_number: string | null
      consignee: { code: string; name: string } | { code: string; name: string }[] | null
      lines: { container_number: string; service_request: string; xray_done_at: string | null }[] | null
    }
    const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
    const isXray = (s: string) => s.toLowerCase().includes('x-ray')

    const values: string[][] = [
      [`KTC Online Portal — X-ray inspection mirror (read-only). Updated ${ph(new Date().toISOString())} PH time. Last 60 days.`],
      ['Container No.', 'JO Number', 'Entry No.', 'Consignee', 'Vessel / Voyage', 'Filed', 'Status', 'X-ray Done'],
    ]
    for (const o of (data ?? []) as Row[]) {
      const cons = one(o.consignee)
      const consignee = cons ? `${cons.code} – ${cons.name}` : ''
      const vessel = [o.vessel_name, o.voyage_number].filter(Boolean).join(' / ')
      // One row per X-RAY container only — the BOC X-ray division view (no billing).
      for (const l of (o.lines ?? []).filter((l) => isXray(l.service_request))) {
        values.push([
          l.container_number, o.jo_number ?? '', o.entry_number ?? '', consignee, vessel,
          ph(o.created_at), o.status, ph(l.xray_done_at),
        ])
      }
    }

    const token = await googleToken(saEmail, saKey)
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    // Clear then rewrite the first sheet — a full snapshot every run (no
    // incremental state to corrupt; the Sheet is purely a viewport).
    const clear = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:Z100000:clear`, { method: 'POST', headers: auth })
    if (!clear.ok) throw new Error('Sheets clear failed: ' + (await clear.text()))
    const write = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1?valueInputOption=RAW`,
      { method: 'PUT', headers: auth, body: JSON.stringify({ values }) },
    )
    if (!write.ok) throw new Error('Sheets write failed: ' + (await write.text()))

    return json({ ok: true, rows: values.length - 2 })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
