// Apply all supabase/migrations/*.sql in order to the database in DATABASE_URL.
// Migrations are idempotent (IF NOT EXISTS / drop policy if exists / create or replace),
// so re-running is safe.
//
// Usage:  DATABASE_URL="postgresql://...pooler.supabase.com:5432/postgres" node scripts/run-migrations.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Set DATABASE_URL (Supabase session-pooler connection string).')
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'supabase', 'migrations')
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

const needsSsl = /supabase\.(co|com)/.test(url)
const client = new pg.Client({
  connectionString: url,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
})
await client.connect()
try {
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), 'utf8')
    process.stdout.write(`applying ${f} ... `)
    await client.query(sql)
    console.log('ok')
  }
  console.log(`done — ${files.length} migration(s) applied`)
} catch (e) {
  console.error('\nFAILED:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
