// i18n COVERAGE guard (audit I18N-05): every user-facing string that flows
// through t() — including TourStep title/body literals, which Tour.tsx renders
// via t() — must have a Tagalog entry in src/lib/translations.ts, or it silently
// renders English under Filipino. This script extracts those strings and reports
// the ones with no `tl` entry, so new copy can't quietly drift back to English.
//
// Usage:
//   node scripts/check-i18n-coverage.mjs            # report missing (exit 0)
//   node scripts/check-i18n-coverage.mjs --strict   # exit 1 if any are missing (CI/precommit)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const strict = process.argv.includes('--strict')
const SRC = path.join(root, 'src')

// Unescape a JS string-literal body (\\, \", \', \n, \t) to its real text, so an
// extracted source literal compares equal to a translations.ts key.
const unescape = (s) => s.replace(/\\(["'\\nt])/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))

// ---- 1. the Tagalog key set (+ enSimple, the formal-English mirror) ----
function loadKeys(rel) {
  const keys = new Set()
  let text
  try { text = readFileSync(path.join(root, rel), 'utf8') } catch { return keys }
  const body = text.replace(/^\s*\/\/.*$/gm, '')
  const PAIR = /"((?:[^"\\]|\\.)*)"\s*:\s*"(?:[^"\\]|\\.)*"/g
  let m
  while ((m = PAIR.exec(body)) !== null) keys.add(unescape(m[1]))
  return keys
}
const tl = loadKeys('src/lib/translations.ts')
const enSimple = loadKeys('src/lib/translations-en.ts')
const has = (s) => tl.has(s) || enSimple.has(s)

// ---- 2. walk src for t('…') args + TourStep title/body literals ----
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

// t( '…' )  or t( "…" )  — first arg only; greedy-safe per quote char.
const T_CALL = /\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g
// title: '…' / body: '…' inside Tour step arrays (rendered via t()).
const TOUR_FIELD = /\b(?:title|body):\s*(['"])((?:\\.|(?!\1).)*)\1/g

const missing = new Map() // string -> Set(files)
function note(str, file) {
  const s = unescape(str).trim()
  if (!s || /^\{.*\}$/.test(s) || /^[\d\s.,:/–-]+$/.test(s)) return // skip pure-var / numeric
  if (has(s)) return
  if (!missing.has(s)) missing.set(s, new Set())
  missing.get(s).add(path.relative(root, file).replace(/\\/g, '/'))
}

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8')
  let m
  while ((m = T_CALL.exec(text)) !== null) note(m[2], file)
  if (/Tour/.test(path.basename(file))) {
    while ((m = TOUR_FIELD.exec(text)) !== null) note(m[2], file)
  }
}

// ---- 3. report ----
const items = [...missing.entries()].sort((a, b) => a[0].localeCompare(b[0]))
if (items.length === 0) {
  console.log('✓ i18n coverage — every t() / TourStep string has a Tagalog entry')
  process.exit(0)
}
// --emit: print paste-ready `"exact key": "TODO",` lines (escaped) so a translator
// fills in the Tagalog value with a guaranteed-matching key.
if (process.argv.includes('--emit')) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  for (const [s] of items) console.log(`  "${esc(s)}": "TODO",`)
  process.exit(0)
}
console.log(`✗ ${items.length} string(s) have no Tagalog (tl) entry — they render English under Filipino:\n`)
for (const [s, files] of items) {
  console.log(`  "${s.length > 90 ? s.slice(0, 90) + '…' : s.replace(/\n/g, ' ')}"`)
  console.log(`      ↳ ${[...files].join(', ')}`)
}
console.log(`\n${items.length} untranslated. Add each to the tl map in src/lib/translations.ts.`)
process.exit(strict ? 1 : 0)
