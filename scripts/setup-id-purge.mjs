// Enable the server-side 3-day valid-ID auto-purge (migration 0053).
//
// The hourly pg_cron job purge_expired_ids() deletes expired ID files through
// the Storage REST API — it needs the project's service_role key and URL in
// Vault. Until then the job is a silent no-op (the lazy client purge on admin
// page loads still applies).
//
// Setup: add to .env.local (gitignored, never commit):
//   SUPABASE_SERVICE_ROLE_KEY="<prod service_role / secret key>"
// then run:  node scripts/setup-id-purge.mjs
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
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

const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const url = process.env.VITE_SUPABASE_URL
const db = process.env.DATABASE_URL
if (!key) { console.error('Add SUPABASE_SERVICE_ROLE_KEY to .env.local first (Project Settings → API).'); process.exit(1) }
if (!url || !db) { console.error('VITE_SUPABASE_URL / DATABASE_URL missing from .env.local.'); process.exit(1) }

const c = new pg.Client({ connectionString: db, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  for (const [name, secret] of [['service_role_key', key], ['project_url', url]]) {
    const { rows } = await c.query('select id from vault.secrets where name = $1', [name])
    if (rows.length) await c.query('select vault.update_secret($1, $2)', [rows[0].id, secret])
    else await c.query('select vault.create_secret($1, $2)', [secret, name])
    console.log(`vault: ${name} set`)
  }
  const { rows } = await c.query('select public.purge_expired_ids() as purged')
  console.log(`purge test run: ok (${rows[0].purged} file(s) purged)`)
} finally {
  await c.end()
}
console.log('Server-side ID auto-purge is ACTIVE (hourly at :35).')
