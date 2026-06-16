// Generate the .xlsx seed templates (consignees + vessel schedule) into
// docs/import/. Run after changing the columns. Usage: node scripts/gen-import-templates.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'docs/import')

async function make(file, headers, sample) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Template')
  ws.addRow(headers)
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  for (const r of sample) ws.addRow(r)
  headers.forEach((h, i) => { ws.getColumn(i + 1).width = Math.max(14, h.length + 4) })
  await wb.xlsx.writeFile(path.join(out, file))
  console.log('wrote', file)
}

await make('consignees-template.xlsx',
  ['name', 'code'],
  [
    ['ACME TRADING CORPORATION', ''],
    ['GLOBAL IMPORTS INC.', ''],
    ['PACIFIC LOGISTICS SOLUTIONS', 'CN-90001'],
    ['SAMPLE CONSIGNEE — delete this row', ''],
  ])

await make('vessel-schedule-template.xlsx',
  ['vessel_visit', 'vessel_name', 'voyage_number', 'shipping_line', 'actual_arrival', 'finish_discharging', 'berth', 'remarks', 'cancelled'],
  [
    ['MV-EVERGREEN-001E', 'MV EVER GIVEN', '001E', 'Evergreen', '2026-06-18', '2026-06-19', 'Berth 1', '', ''],
    ['MV-MAERSK-204W', 'MAERSK SEMARANG', '204W', 'Maersk', '2026-06-20', '', 'Berth 2', 'ETA only — not yet discharged', ''],
    ['SAMPLE-VISIT-DELETE', 'SAMPLE VESSEL — delete this row', '000X', '', '', '', '', '', 'TRUE'],
  ])
