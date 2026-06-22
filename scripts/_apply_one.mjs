// Apply ONE migration file to the KTC DB and record it in _migrations.
// Use during concurrent two-session work so the all-pending runner doesn't
// sweep in the OTHER session's in-progress migrations.
// Runs the file as a single implicit transaction (rolls back on error).
// Usage: node scripts/_apply_one.mjs <filename.sql>
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const name = process.argv[2]
if (!name) { console.error('usage: _apply_one.mjs <filename.sql>'); process.exit(1) }

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
const file = path.join(root, 'supabase', 'migrations', name)
if (!existsSync(file)) { console.error('no such migration file:', name); process.exit(1) }

const client = new pg.Client({ connectionString: url, ssl: /supabase\.(co|com)/.test(url) ? { rejectUnauthorized: false } : undefined })
await client.connect()
try {
  await client.query('create table if not exists public._migrations (filename text primary key, applied_at timestamptz not null default now())')
  const { rows } = await client.query('select 1 from public._migrations where filename=$1', [name])
  if (rows.length) { console.log(`skip ${name} (already applied)`); }
  else {
    process.stdout.write(`applying ${name} ... `)
    await client.query(readFileSync(file, 'utf8'))
    await client.query('insert into public._migrations (filename) values ($1) on conflict do nothing', [name])
    console.log('ok')
  }
} catch (e) {
  console.error('\nFAILED:', e.message); process.exitCode = 1
} finally {
  await client.end()
}
