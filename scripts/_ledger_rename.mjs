// Rename an ALREADY-APPLIED migration in the _migrations ledger WITHOUT re-running it.
// Use after `mv`-ing the .sql file, to resolve concurrent-work number collisions.
// Usage: node scripts/_ledger_rename.mjs <old_filename.sql> <new_filename.sql>
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const [oldName, newName] = process.argv.slice(2)
if (!oldName || !newName) { console.error('usage: _ledger_rename.mjs <old.sql> <new.sql>'); process.exit(1) }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env.migrate', '.env']) {
  const p = path.join(root, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || process.env[m[1]] !== undefined) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}
const url = process.env.DATABASE_URL
const client = new pg.Client({ connectionString: url, ssl: /supabase\.(co|com)/.test(url) ? { rejectUnauthorized: false } : undefined })
await client.connect()
try {
  const res = await client.query('update public._migrations set filename=$1 where filename=$2', [newName, oldName])
  console.log(`ledger: ${oldName} -> ${newName}  (rows updated: ${res.rowCount})`)
} catch (e) {
  console.error('FAILED:', e.message); process.exitCode = 1
} finally {
  await client.end()
}
