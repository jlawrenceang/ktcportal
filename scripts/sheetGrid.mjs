// Shared spreadsheet reader for the seed importers — reads .xlsx/.xls (via
// exceljs) OR .csv into a 2D array of strings (the importers detect the header
// row by column name, so column order doesn't matter).
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'

export function parseCsv(text) {
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

// Normalize an exceljs cell value (string, number, Date, rich text, formula,
// hyperlink) to a plain string. Dates -> YYYY-MM-DD.
function cellStr(v) {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return String(v.text)
    if ('result' in v) return String(v.result ?? '')
    if ('hyperlink' in v) return String(v.text ?? v.hyperlink)
    return ''
  }
  return String(v)
}

/** Read a spreadsheet (.xlsx/.xls) or .csv into a 2D array (rows of cell strings). */
export async function readGrid(file) {
  if (/\.xlsx?$/i.test(file)) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(file)
    const ws = wb.worksheets[0]
    if (!ws) return []
    const grid = []
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values // 1-indexed: [<unused>, c1, c2, ...]
      const arr = []
      for (let i = 1; i < vals.length; i++) arr.push(cellStr(vals[i]))
      grid.push(arr)
    })
    return grid
  }
  return parseCsv(readFileSync(file, 'utf8')).filter((r) => r.length > 1)
}
