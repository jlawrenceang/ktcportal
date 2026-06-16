// One-off: format the vessel-schedule Google Sheet — KTC logo + title + notes,
// a frozen styled header row, sample rows, sensible column widths. Preserves any
// existing data rows (rows below an existing vessel_visit header). The vessel-sync
// function reads whatever row carries the headers, so the branding above is fine.
//
// Reads .env.local: GOOGLE_SA_EMAIL, GOOGLE_SA_KEY, VESSEL_SHEET_ID.
// The service account must have EDITOR on the sheet to format it (Viewer is
// enough for the hourly read-only sync afterwards).
// Usage: node scripts/format-vessel-sheet.mjs
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SignJWT, importPKCS8 } from 'jose'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const raw = existsSync(path.join(root, '.env.local')) ? readFileSync(path.join(root, '.env.local'), 'utf8') : ''
const get = (k) => { const m = raw.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
const saEmail = get('GOOGLE_SA_EMAIL'), saKey = get('GOOGLE_SA_KEY'), sheetId = get('VESSEL_SHEET_ID')
if (!saEmail || !saKey || !sheetId) { console.error('Need GOOGLE_SA_EMAIL, GOOGLE_SA_KEY, VESSEL_SHEET_ID in .env.local'); process.exit(1) }

const HEADERS = ['vessel_visit', 'vessel_name', 'voyage_number', 'shipping_line', 'actual_arrival', 'finish_discharging', 'berth', 'remarks', 'cancelled']
const SAMPLE = [
  ['MV-EVERGREEN-001E', 'MV EVER GIVEN', '001E', 'Evergreen', '2026-06-18', '2026-06-19', 'Berth 1', '', ''],
  ['MV-MAERSK-204W', 'MAERSK SEMARANG', '204W', 'Maersk', '2026-06-20', '', 'Berth 2', 'ETA only — not yet discharged', ''],
]

async function token() {
  const key = await importPKCS8(saKey.replace(/\\n/g, '\n'), 'RS256')
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(saEmail)
    .setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(key)
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) })
  const t = await res.json(); if (!t.access_token) throw new Error('Google auth failed: ' + JSON.stringify(t)); return t.access_token
}

const tok = await token()
const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }
const api = (p, init = {}) => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${p}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } })

// 1) first sheet id + current values (to preserve any existing data rows)
const metaRes = await api('?fields=sheets.properties(sheetId,title)')
if (!metaRes.ok) { console.error(`metadata read failed: ${metaRes.status} ${await metaRes.text()}`); if (metaRes.status === 403) console.error('  → the service account needs EDITOR on this sheet (you shared it as Viewer). Add it as Editor and re-run.'); process.exit(1) }
const sheet0 = (await metaRes.json()).sheets[0].properties
const gid = sheet0.sheetId

const cur = await (await api(`/values/A1:Z100000`)).json()
const curRows = cur.values ?? []
const ehi = curRows.findIndex((r) => r.some((c) => String(c ?? '').trim().toLowerCase() === 'vessel_visit'))
const existingData = ehi >= 0 ? curRows.slice(ehi + 1).filter((r) => r.some((c) => String(c ?? '').trim())) : []
const dataRows = existingData.length ? existingData : SAMPLE
console.log(`preserving ${existingData.length} existing data row(s)` + (existingData.length ? '' : ' (none — adding 2 samples)'))

// 2) write content: row1 logo+title, row2 notes, row3 blank, row4 headers, row5+ data
const NOTE = "Operations-maintained — synced to the KTC Online Portal every hour. Edit rows below the header. Set cancelled = TRUE to retire a visit. Don't rename the headers."
const grid = [
  [`=IMAGE("https://portal.ktcterminal.com/ktc-logo.png",1)`, 'KTC VESSEL SCHEDULE', '', '', '', '', '', '', ''],
  [NOTE, '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', ''],
  HEADERS,
  ...dataRows.map((r) => HEADERS.map((_, i) => r[i] ?? '')),
]
await api(`/values/A1:Z100000:clear`, { method: 'POST' })
const wr = await api(`/values/A1?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ values: grid }) })
if (!wr.ok) { console.error(`write failed: ${wr.status} ${await wr.text()}`); process.exit(1) }

// 3) formatting
const teal = { red: 0.06, green: 0.36, blue: 0.36 }
const reqs = [
  { updateSheetProperties: { properties: { sheetId: gid, gridProperties: { frozenRowCount: 4 } }, fields: 'gridProperties.frozenRowCount' } },
  { mergeCells: { range: { sheetId: gid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } },
  { mergeCells: { range: { sheetId: gid, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 9 }, mergeType: 'MERGE_ALL' } },
  { updateDimensionProperties: { range: { sheetId: gid, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 64 }, fields: 'pixelSize' } },
  { updateDimensionProperties: { range: { sheetId: gid, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
  { updateDimensionProperties: { range: { sheetId: gid, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 190 }, fields: 'pixelSize' } },
  // title B1
  { repeatCell: { range: { sheetId: gid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 9 }, cell: { userEnteredFormat: { verticalAlignment: 'MIDDLE', textFormat: { bold: true, fontSize: 18 } } }, fields: 'userEnteredFormat(verticalAlignment,textFormat)' } },
  // note A2
  { repeatCell: { range: { sheetId: gid, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 9 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', textFormat: { italic: true, fontSize: 10, foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 } } } }, fields: 'userEnteredFormat(wrapStrategy,textFormat)' } },
  // header row 4 (index 3)
  { repeatCell: { range: { sheetId: gid, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 9 }, cell: { userEnteredFormat: { backgroundColor: teal, horizontalAlignment: 'CENTER', textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)' } },
]
const fr = await api(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: reqs }) })
if (!fr.ok) { console.error(`format failed: ${fr.status} ${await fr.text()}`); process.exit(1) }
console.log('✓ vessel sheet formatted — logo + title, frozen header row (row 4), data from row 5')
