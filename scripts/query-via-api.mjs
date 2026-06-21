// Read-only SQL query against the KTC DB via the Supabase Management API
// (HTTPS), for when the Postgres pooler is unreachable. Reads token + project
// ref DIRECTLY from .env.local (ambient SUPABASE_ACCESS_TOKEN can be stale →
// 401). See [[ktc-db-ops-via-mgmt-api]]. Prints the result as JSON.
//
// Usage: node scripts/query-via-api.mjs "select ... ;"
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
const query = process.argv[2]
if (!token || !ref || !query) { console.error('Usage: node scripts/query-via-api.mjs "<sql>"'); process.exit(1) }

const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})
const text = await r.text()
if (!r.ok) { console.error(`mgmt query ${r.status}: ${text.slice(0, 600)}`); process.exit(1) }
console.log(JSON.stringify(text ? JSON.parse(text) : [], null, 2))
