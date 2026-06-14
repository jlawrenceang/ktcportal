// Export src/lib/translations.ts as a reviewable EN↔FIL table.
//   node scripts/export-translations.mjs        → writes docs/translations-review.md
//   node scripts/export-translations.mjs --csv  → also writes docs/translations-review.csv
//
// The dictionary is keyed by the English source string; missing keys fall back
// to English at runtime, and entries where Filipino === English are industry
// terms intentionally kept in English. Regenerate after editing translations.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(path.join(root, 'src/lib/translations.ts'), 'utf8')
// eslint-disable-next-line no-eval
const tl = eval('(' + src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1) + ')')

const rows = Object.keys(tl).sort((a, b) => a.localeCompare(b)).map((en) => ({ en, fil: tl[en], kept: tl[en] === en }))
const translated = rows.filter((r) => !r.kept)
const kept = rows.filter((r) => r.kept)

const mdCell = (s) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' <br> ')

let md = `# KTC Online Portal — Translation review (English ↔ Filipino)

> Generated from \`src/lib/translations.ts\` — **${rows.length}** strings total
> (${translated.length} translated · ${kept.length} kept in English as industry terms).
> English is the source/key; anything missing falls back to English. To change a
> line, edit \`src/lib/translations.ts\` (or tell me) — then \`node scripts/export-translations.mjs\` regenerates this.
> \`{name}\` etc. are runtime placeholders — keep them in both languages.

## Translated strings (${translated.length})

| # | English | Filipino (Tagalog) |
|---|---|---|
`
translated.forEach((r, i) => { md += `| ${i + 1} | ${mdCell(r.en)} | ${mdCell(r.fil)} |\n` })

md += `
## Kept in English on purpose (${kept.length})

Industry / technical terms shown the same in both languages.

| # | Term |
|---|---|
`
kept.forEach((r, i) => { md += `| ${i + 1} | ${mdCell(r.en)} |\n` })

writeFileSync(path.join(root, 'docs/translations-review.md'), md, 'utf8')
console.log(`Wrote docs/translations-review.md — ${rows.length} rows (${translated.length} translated, ${kept.length} kept English)`)

if (process.argv.includes('--csv')) {
  const csvCell = (s) => `"${String(s).replace(/"/g, '""').replace(/\r?\n/g, '\\n')}"`
  let csv = 'english,filipino,kept_english\n'
  for (const r of rows) csv += `${csvCell(r.en)},${csvCell(r.fil)},${r.kept}\n`
  writeFileSync(path.join(root, 'docs/translations-review.csv'), csv, 'utf8')
  console.log('Wrote docs/translations-review.csv')
}
