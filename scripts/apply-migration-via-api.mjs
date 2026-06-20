// Apply ONE supabase/migrations/*.sql via the Supabase Management API
// database/query endpoint (HTTPS) when the Postgres pooler is unreachable, and
// record it in public._migrations so run-migrations.mjs won't re-run it. Reads
// the token + project URL DIRECTLY from .env.local (ambient shell vars can be a
// stale SUPABASE_ACCESS_TOKEN → 401). See [[ktc-db-ops-via-mgmt-api]].
//
// Usage: node scripts/apply-migration-via-api.mjs 0120_relax_consignee_approval.sql
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'; import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
const envText = existsSync(path.join(root, '.env.local')) ? readFileSync(path.join(root, '.env.local'), 'utf8') : ''
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
  let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[m[1]] = v
}
const token = env.SUPABASE_ACCESS_TOKEN
const ref = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).host.split('.')[0] : null
const file = process.argv[2]
if (!token || !ref || !file) { console.error('Usage: node scripts/apply-migration-via-api.mjs <migration.sql>'); process.exit(1) }
const sqlPath = path.join(root, 'supabase', 'migrations', file)
if (!existsSync(sqlPath)) { console.error('Not found:', sqlPath); process.exit(1) }

async function runSql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`mgmt query ${r.status}: ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : []
}
const lit = (s) => "'" + s.replace(/'/g, "''") + "'"

await runSql('create table if not exists public._migrations (filename text primary key, applied_at timestamptz not null default now())')
const done = await runSql(`select 1 from public._migrations where filename = ${lit(file)}`)
if (Array.isArray(done) && done.length) { console.log('already applied:', file); process.exit(0) }
console.log('applying', file, '…')
await runSql(readFileSync(sqlPath, 'utf8'))
await runSql(`insert into public._migrations (filename) values (${lit(file)}) on conflict do nothing`)
console.log('✓ applied + recorded in _migrations')
