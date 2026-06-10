// Apply all supabase/migrations/*.sql in order to the KTC database.
// Migrations are idempotent (IF NOT EXISTS / drop policy if exists / create or replace),
// so re-running is safe.
//
// Connection string is read from process.env.DATABASE_URL, or from a gitignored
// .env.local / .env.migrate (DATABASE_URL=...). The string holds the DB password,
// so keep it ONLY in those gitignored files — never commit it.
//
// Usage:  node scripts/run-migrations.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Lightweight .env loader (no dependency). Only fills vars not already in the env.
function loadEnvFiles() {
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
}
loadEnvFiles()

const url = process.env.DATABASE_URL
if (!url) {
  console.error('No DATABASE_URL. Add it to .env.local (gitignored): DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres"')
  process.exit(1)
}

const dir = path.join(root, 'supabase', 'migrations')
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

const needsSsl = /supabase\.(co|com)/.test(url)
const client = new pg.Client({
  connectionString: url,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
})
await client.connect()
try {
  // Track applied migrations so we never re-run an old one. (Re-running used to
  // rely on idempotency, but a table rename like 0021 can't be made idempotent
  // against a blind re-run of 0001's `create table if not exists brokers`.)
  await client.query(
    'create table if not exists public._migrations (filename text primary key, applied_at timestamptz not null default now())',
  )
  const applied = new Set(
    (await client.query('select filename from public._migrations')).rows.map((r) => r.filename),
  )
  let n = 0
  for (const f of files) {
    if (applied.has(f)) {
      console.log(`skip ${f} (already applied)`)
      continue
    }
    const sql = readFileSync(path.join(dir, f), 'utf8')
    process.stdout.write(`applying ${f} ... `)
    await client.query(sql)
    await client.query('insert into public._migrations (filename) values ($1) on conflict do nothing', [f])
    console.log('ok')
    n++
  }
  console.log(`done — ${n} new migration(s) applied, ${files.length - n} already applied`)
} catch (e) {
  console.error('\nFAILED:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
