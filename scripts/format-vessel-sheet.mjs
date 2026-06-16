// One-off: format the vessel-schedule Google Sheet to KTC's "VESSEL MONITORING"
// layout — logo banner + title + note, a VISIBLE friendly header row over a
// HIDDEN canonical schema row (the sync matches the hidden names), each event
// (arrival / last discharge / departure) as a date + a military time cell, a
// Shipping Line dropdown, a Cancelled TRUE/FALSE dropdown, the auto-filled Last
// Free Day mirror, and a Week column. Header block + LFD column are locked.
// vessel_visit is NOT a column — the sync derives it from vessel name + voyage.
// Preserves & realigns existing data rows (by header name). The sync reads hidden
// rows too, so hiding the schema row changes nothing on the sync side.
//
// Reads .env.local: GOOGLE_SA_EMAIL, GOOGLE_SA_KEY, VESSEL_SHEET_ID.
// The service account must have EDITOR on the sheet — it formats here AND the
// hourly sync writes the "Last Free Day" mirror column, so Editor is permanent
// (Viewer is not enough).
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

// Canonical schema names (HIDDEN row 5 — the sync matches these) and the plain
// labels staff see (VISIBLE row 4). Each event is a date + a military clock-time.
// "last_free_day" is an app-computed mirror the sync writes back; ops never type
// it. vessel_visit is NOT a column — the sync derives it from vessel_name+voyage.
const HEADERS  = ['shipping_line', 'vessel_name', 'voyage_number', 'arrival_date', 'arrival_time', 'last_discharge_date', 'last_discharge_time', 'last_free_day', 'departure_date', 'departure_time', 'berth', 'week', 'remarks', 'cancelled']
const FRIENDLY = ['Shipping Line', 'Vessel Name', 'Voyage', 'Arrival Date', 'Arrival Time', 'Last Discharge Date', 'Last Discharge Time', 'Last Free Day (auto)', 'Departure Date', 'Departure Time', 'Berth', 'Week', 'Remarks', 'Cancelled?']
const LFD = HEADERS.indexOf('last_free_day') // 0-based column index of the mirror
const LINE = HEADERS.indexOf('shipping_line')
const CANCEL = HEADERS.indexOf('cancelled')
// Date + time (and the LFD mirror) columns kept as PLAIN TEXT so "06/15/26" /
// "1653H" stay literal (no locale auto-conversion) and the sync parses them
// deterministically.
const TEXT_FROM = HEADERS.indexOf('arrival_date')
const TEXT_TO = HEADERS.indexOf('departure_time') + 1
// Shipping-line dropdown. For Last Free Day to compute, these names must match
// the shipping_lines rows (with free-days) configured in admin Settings.
const LINES = ['Maersk', 'Evergreen', 'SITC', 'MSC', 'CMA', 'MCC', 'Gothong', 'Philcement', 'New Asia']
// Old->new header aliases so a re-format preserves data across the rename.
const ALIAS = { actual_arrival: 'arrival_date', finish_discharging: 'last_discharge_date' }
const SAMPLE = [
  ['MCC', 'MARSA PRIDE', '618S-621N', '05/29/26', '1653H', '05/30/26', '1800H', '', '06/01/26', '0823H', '4', '23', 'IA8', 'FALSE'],
  ['Evergreen', 'EVER CROWN', '0419-082N', '06/02/26', '1154H', '06/02/26', '1330H', '', '06/03/26', '2154H', '2', '23', '', 'FALSE'],
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
const metaRes = await api('?fields=sheets(properties(sheetId,title),protectedRanges(protectedRangeId))')
if (!metaRes.ok) { console.error(`metadata read failed: ${metaRes.status} ${await metaRes.text()}`); if (metaRes.status === 403) console.error('  → the service account needs EDITOR on this sheet (you shared it as Viewer). Add it as Editor and re-run.'); process.exit(1) }
const sheet0meta = (await metaRes.json()).sheets[0]
const sheet0 = sheet0meta.properties
const gid = sheet0.sheetId
const existingProtections = (sheet0meta.protectedRanges ?? []).map((p) => p.protectedRangeId)

const norm = (c) => String(c ?? '').trim().toLowerCase().replace(/\s+/g, '_')
const cur = await (await api(`/values/A1:Z100000`)).json()
const curRows = cur.values ?? []
// Key on voyage_number — the visible friendly labels normalize to several
// canonical names, but "Voyage" never matches "voyage_number", so this lands on
// the HIDDEN canonical schema row, not the friendly row above it.
const HDR_TOKENS = ['shipping_line', 'vessel_name', 'voyage_number', 'vessel_visit']
const ehi = curRows.findIndex((r) => r.some((c) => norm(c) === 'voyage_number'))
const oldHeader = ehi >= 0 ? curRows[ehi].map(norm) : []
const oldIdx = (h) => { let j = oldHeader.indexOf(h); if (j < 0) { const a = Object.keys(ALIAS).find((k) => ALIAS[k] === h); if (a) j = oldHeader.indexOf(a) } return j }
// Keep only real data rows: non-empty AND not a stray header/echo row.
const existingData = ehi >= 0
  ? curRows.slice(ehi + 1).filter((r) => r.some((c) => String(c ?? '').trim()) && !r.some((c) => HDR_TOKENS.includes(norm(c))))
  : []
// Realign preserved rows to the NEW column order BY NAME (+ old->new aliases), so
// a re-format never shifts values when columns are inserted/renamed. Pass --fresh
// to discard existing rows and write the clean sample set instead.
const FRESH = process.argv.includes('--fresh')
const dataRows = (!FRESH && existingData.length)
  ? existingData.map((r) => HEADERS.map((h) => { const j = oldIdx(h); return j >= 0 ? (r[j] ?? '') : '' }))
  : SAMPLE
console.log(FRESH ? `--fresh: wrote ${SAMPLE.length} clean sample row(s)` : `preserving ${existingData.length} existing data row(s)` + (existingData.length ? '' : ' (none — adding 2 samples)'))

// 2) layout: row1 logo banner · row2 title (under the logo) · row3 note ·
//    row4 friendly header (visible) · row5 schema header (hidden) · row6+ data
const blank = Array(HEADERS.length).fill('')
const NOTE = "Operations-maintained — synced to the KTC Online Portal hourly (or hit “Sync sheet” in the portal). Type vessel rows below the blue header (dates like 06/15/26, times like 1653H). Pick the Shipping Line and Cancelled values from their dropdowns. “Last Free Day” is filled automatically by the system — leave it blank. The header block is locked; don't insert rows above it."
const grid = [
  blank.slice(),                                   // row1 — logo banner (paste logo over A1)
  ['KTC VESSEL SCHEDULE', ...blank.slice(1)],       // row2 — title, under the logo
  [NOTE, ...blank.slice(1)],                        // row3 — note
  FRIENDLY,                                         // row4 — friendly header (visible)
  HEADERS,                                          // row5 — schema header (hidden; sync reads this)
  ...dataRows.map((r) => HEADERS.map((_, i) => r[i] ?? '')), // row6+ — data
]
await api(`/values/A1:Z100000:clear`, { method: 'POST' })
// RAW (not USER_ENTERED): keep dates/voyages as literal text so Sheets doesn't
// convert "06/15/26" to a date serial before the TEXT format lands.
const wr = await api(`/values/A1?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: grid }) })
if (!wr.ok) { console.error(`write failed: ${wr.status} ${await wr.text()}`); process.exit(1) }

// 3) formatting
const teal = { red: 0.06, green: 0.36, blue: 0.36 }
const gray = { red: 0.95, green: 0.95, blue: 0.95 }
const NC = HEADERS.length // 14 columns (A..N)
const reqs = [
  // freeze the header block (rows 1-5; the hidden schema row collapses)
  { updateSheetProperties: { properties: { sheetId: gid, gridProperties: { frozenRowCount: 5 } }, fields: 'gridProperties.frozenRowCount' } },
  // merge logo banner (row1), title (row2), note (row3) across all columns
  { mergeCells: { range: { sheetId: gid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: NC }, mergeType: 'MERGE_ALL' } },
  { mergeCells: { range: { sheetId: gid, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: NC }, mergeType: 'MERGE_ALL' } },
  { mergeCells: { range: { sheetId: gid, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: NC }, mergeType: 'MERGE_ALL' } },
  // logo row tall; note row tall enough to wrap; name columns a touch wider
  { updateDimensionProperties: { range: { sheetId: gid, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },
  { updateDimensionProperties: { range: { sheetId: gid, dimension: 'ROWS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 44 }, fields: 'pixelSize' } },
  { updateDimensionProperties: { range: { sheetId: gid, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 160 }, fields: 'pixelSize' } },
  { updateDimensionProperties: { range: { sheetId: gid, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 190 }, fields: 'pixelSize' } },
  // title (row2): centered, bold, large
  { repeatCell: { range: { sheetId: gid, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: NC }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', textFormat: { bold: true, fontSize: 18 } } }, fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)' } },
  // note (row3): italic gray, wrapped
  { repeatCell: { range: { sheetId: gid, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: NC }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', textFormat: { italic: true, fontSize: 10, foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 } } } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment,textFormat)' } },
  // friendly header (row4, idx3): teal bg, white bold, centered, wrapped
  { repeatCell: { range: { sheetId: gid, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: NC }, cell: { userEnteredFormat: { backgroundColor: teal, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP', textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)' } },
  // schema header (row5, idx4): faint gray label, then HIDE it (sync still reads hidden rows)
  { repeatCell: { range: { sheetId: gid, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: NC }, cell: { userEnteredFormat: { backgroundColor: gray, textFormat: { italic: true, fontSize: 8, foregroundColor: { red: 0.6, green: 0.6, blue: 0.6 } } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
  { updateDimensionProperties: { range: { sheetId: gid, dimension: 'ROWS', startIndex: 4, endIndex: 5 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } },
  // Last Free Day column (auto-filled mirror): gray italic so it reads as read-only
  { repeatCell: { range: { sheetId: gid, startRowIndex: 5, endRowIndex: 1000, startColumnIndex: LFD, endColumnIndex: LFD + 1 }, cell: { userEnteredFormat: { backgroundColor: gray, textFormat: { italic: true, foregroundColor: { red: 0.45, green: 0.45, blue: 0.45 } } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
  // keep date/time (+ the LFD mirror) columns as plain text so values stay literal
  { repeatCell: { range: { sheetId: gid, startRowIndex: 5, endRowIndex: 1000, startColumnIndex: TEXT_FROM, endColumnIndex: TEXT_TO }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.numberFormat' } },
  // data-row dropdowns: Shipping Line (known lines) + Cancelled (TRUE/FALSE only)
  { setDataValidation: { range: { sheetId: gid, startRowIndex: 5, endRowIndex: 1000, startColumnIndex: LINE, endColumnIndex: LINE + 1 }, rule: { condition: { type: 'ONE_OF_LIST', values: LINES.map((l) => ({ userEnteredValue: l })) }, strict: true, showCustomUi: true } } },
  { setDataValidation: { range: { sheetId: gid, startRowIndex: 5, endRowIndex: 1000, startColumnIndex: CANCEL, endColumnIndex: CANCEL + 1 }, rule: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'TRUE' }, { userEnteredValue: 'FALSE' }] }, strict: true, showCustomUi: true } } },
  // drop any prior protections (idempotent), then lock (a) the header block rows
  // 1-5 and (b) the auto-filled Last Free Day column. No editors list => only the
  // sheet OWNER + this service account can edit; operations staff are blocked, so
  // neither the canonical headers nor the computed mirror can be overwritten.
  ...existingProtections.map((id) => ({ deleteProtectedRange: { protectedRangeId: id } })),
  { addProtectedRange: { protectedRange: {
    range: { sheetId: gid, startRowIndex: 0, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: NC },
    description: 'KTC header block — do not edit (sync depends on the hidden schema row)',
    warningOnly: false,
  } } },
  { addProtectedRange: { protectedRange: {
    range: { sheetId: gid, startRowIndex: 5, startColumnIndex: LFD, endColumnIndex: LFD + 1 },
    description: 'Last Free Day — auto-filled by the portal; do not edit',
    warningOnly: false,
  } } },
]
const fr = await api(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: reqs }) })
if (!fr.ok) { console.error(`format failed: ${fr.status} ${await fr.text()}`); process.exit(1) }
console.log(`✓ vessel sheet formatted (${NC} cols) — logo (row 1) · title (row 2) · friendly header (row 4) · hidden schema (row 5) · data from row 6. Shipping Line + Cancelled dropdowns; Last Free Day locked + auto-filled. Paste your logo over row 1.`)
